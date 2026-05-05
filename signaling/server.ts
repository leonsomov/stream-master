// Stream Master signaling broker — Deno Deploy edition.
//
// Pairs WebRTC peers by stream ID and relays SDP / ICE handshake messages.
// Audio never traverses this server.
//
// Wire protocol — JSON envelopes:
//   { "type": "register",  "role": "sender" | "receiver", "roomId": "..." }
//   { "type": "registered" }                       // server  → client
//   { "type": "peer-joined" }                      // server  → both
//   { "type": "peer-left" }                        // server  → remaining
//   { "type": "offer",     "sdp": "..." }          // sender   → receiver
//   { "type": "answer",    "sdp": "..." }          // receiver → sender
//   { "type": "candidate", "candidate": {...} }    // either   → other
//   { "type": "error",     "error": "..." }        // server   → client
//
// Caveat: this uses an in-memory Map for room state, which is local to the
// Deno Deploy isolate handling each connection. If two peers land on
// different isolates, they will not pair. In practice, both peers usually
// hit the same isolate when they connect within ~60 seconds of each other,
// because the first peer keeps the isolate warm. If this turns out to bite,
// swap the in-memory Map for Deno KV with watch().

type Role = "sender" | "receiver";

interface Room {
  sender?: WebSocket;
  receiver?: WebSocket;
}

interface ConnState {
  role: Role | null;
  roomId: string | null;
}

const rooms = new Map<string, Room>();
const connState = new WeakMap<WebSocket, ConnState>();

const ROOM_ID_RE = /^[a-z0-9-]{4,32}$/;
const VALID_ROLES: ReadonlySet<Role> = new Set(["sender", "receiver"]);
const RELAY_TYPES = new Set(["offer", "answer", "candidate"]);

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function partnerRole(role: Role): Role {
  return role === "sender" ? "receiver" : "sender";
}

function handleMessage(ws: WebSocket, raw: string): void {
  // deno-lint-ignore no-explicit-any
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: "error", error: "invalid json" });
    return;
  }

  const state = connState.get(ws);
  if (!state) return;

  if (msg.type === "register") {
    if (!ROOM_ID_RE.test(msg.roomId ?? "") || !VALID_ROLES.has(msg.role)) {
      send(ws, { type: "error", error: "invalid register" });
      ws.close();
      return;
    }
    if (state.roomId) {
      send(ws, { type: "error", error: "already registered" });
      return;
    }

    const role = msg.role as Role;
    const roomId = msg.roomId as string;
    state.role = role;
    state.roomId = roomId;

    const room: Room = rooms.get(roomId) ?? {};
    const existing = room[role];
    if (existing) {
      send(existing, { type: "error", error: "replaced by new peer" });
      existing.close();
    }
    room[role] = ws;
    rooms.set(roomId, room);

    console.log(`[=] register role=${role} room=${roomId}`);
    send(ws, { type: "registered" });

    const partner = room[partnerRole(role)];
    if (partner && partner.readyState === WebSocket.OPEN) {
      send(ws, { type: "peer-joined" });
      send(partner, { type: "peer-joined" });
    }
    return;
  }

  if (RELAY_TYPES.has(msg.type)) {
    if (!state.roomId || !state.role) {
      send(ws, { type: "error", error: "not registered" });
      return;
    }
    const room = rooms.get(state.roomId);
    const partner = room?.[partnerRole(state.role)];
    if (partner && partner.readyState === WebSocket.OPEN) {
      partner.send(raw);
    } else {
      send(ws, { type: "error", error: "no peer" });
    }
    return;
  }

  send(ws, { type: "error", error: `unknown type: ${msg.type}` });
}

function handleClose(ws: WebSocket): void {
  const state = connState.get(ws);
  if (!state || !state.roomId || !state.role) return;

  const room = rooms.get(state.roomId);
  if (!room) return;

  if (room[state.role] === ws) {
    delete room[state.role];
  }

  const partner = room[partnerRole(state.role)];
  if (partner && partner.readyState === WebSocket.OPEN) {
    send(partner, { type: "peer-left" });
  }

  if (!room.sender && !room.receiver) {
    rooms.delete(state.roomId);
  }

  console.log(`[-] close role=${state.role} room=${state.roomId}`);
}

Deno.serve((req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    return Response.json({ ok: true, rooms: rooms.size });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(
      "Stream Master broker. Connect via WebSocket.\n",
      { headers: { "content-type": "text/plain" } },
    );
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  connState.set(socket, { role: null, roomId: null });

  socket.onopen = () => {
    console.log(`[+] connect`);
  };
  socket.onmessage = (e) => handleMessage(socket, e.data);
  socket.onclose = () => handleClose(socket);
  socket.onerror = (e) => {
    const state = connState.get(socket);
    console.warn(`[!] ws error role=${state?.role} room=${state?.roomId}:`, e);
  };

  return response;
});
