// Stream Master signaling broker — Deno Deploy + Deno KV edition.
//
// Pairs WebRTC peers by stream ID and relays SDP / ICE handshake messages.
// Audio never traverses this server.
//
// Why KV instead of an in-memory Map: Deno Deploy may route a sender and
// receiver to different isolates. Each isolate has its own memory, so a Map
// can't see the partner. Deno KV is global and atomic, so any isolate sees
// the same state.
//
// Wire protocol — JSON envelopes:
//   { "type": "register",   "role": "sender" | "receiver", "roomId": "..." }
//   { "type": "registered" }                      // server  → client
//   { "type": "peer-joined" }                     // server  → both
//   { "type": "peer-left" }                       // server  → remaining
//   { "type": "offer",      "sdp": "..." }        // sender   → receiver
//   { "type": "answer",     "sdp": "..." }        // receiver → sender
//   { "type": "candidate",  "candidate": {...} }  // either   → other
//   { "type": "error",      "error": "..." }      // server   → client
//
// Storage layout:
//   ["rooms", id, "presence", role]      = { ts }     ttl 30s
//   ["rooms", id, "seq",      role]      = number     ttl 5min
//   ["rooms", id, "msgs",     role, seq] = envelope   ttl 1min

type Role = "sender" | "receiver";

interface ConnState {
  role: Role | null;
  roomId: string | null;
  heartbeatTimer: number | null;
  watcher: ReadableStream<unknown> | null;
  lastSeenPartnerSeq: number;
}

const ROOM_ID_RE = /^[a-z0-9-]{4,32}$/;
const VALID_ROLES = new Set<Role>(["sender", "receiver"]);
const RELAY_TYPES = new Set(["offer", "answer", "candidate"]);

const PRESENCE_TTL_MS = 30_000;
const HEARTBEAT_MS    = 10_000;
const MSG_TTL_MS      = 60_000;
const SEQ_TTL_MS      = 5 * 60_000;

const connState = new WeakMap<WebSocket, ConnState>();
const kv = await Deno.openKv();

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function partnerOf(role: Role): Role {
  return role === "sender" ? "receiver" : "sender";
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function presenceKey(roomId: string, role: Role) {
  return ["rooms", roomId, "presence", role] as const;
}

function seqKey(roomId: string, role: Role) {
  return ["rooms", roomId, "seq", role] as const;
}

function msgsPrefix(roomId: string, role: Role) {
  return ["rooms", roomId, "msgs", role] as const;
}

async function setPresence(roomId: string, role: Role): Promise<void> {
  await kv.set(presenceKey(roomId, role), { ts: Date.now() }, { expireIn: PRESENCE_TTL_MS });
}

async function clearPresence(roomId: string, role: Role): Promise<void> {
  try {
    await kv.delete(presenceKey(roomId, role));
  } catch (err) {
    console.warn("clearPresence failed:", err);
  }
}

async function nextSeq(roomId: string, role: Role): Promise<number> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cur = await kv.get<number>(seqKey(roomId, role));
    const next = (cur.value ?? 0) + 1;
    const result = await kv.atomic()
      .check({ key: cur.key, versionstamp: cur.versionstamp })
      .set(seqKey(roomId, role), next, { expireIn: SEQ_TTL_MS })
      .commit();
    if (result.ok) return next;
  }
  throw new Error("seq CAS failed after 5 attempts");
}

async function publishRelay(roomId: string, fromRole: Role, envelope: unknown): Promise<void> {
  const seq = await nextSeq(roomId, fromRole);
  await kv.set([...msgsPrefix(roomId, fromRole), seq], envelope, { expireIn: MSG_TTL_MS });
}

async function readUnseen(
  roomId: string,
  fromRole: Role,
  lastSeen: number,
): Promise<Array<{ seq: number; envelope: unknown }>> {
  const out: Array<{ seq: number; envelope: unknown }> = [];
  const iter = kv.list<unknown>({ prefix: msgsPrefix(roomId, fromRole) });
  for await (const entry of iter) {
    const seq = entry.key[entry.key.length - 1] as number;
    if (typeof seq === "number" && seq > lastSeen) {
      out.push({ seq, envelope: entry.value });
    }
  }
  out.sort((a, b) => a.seq - b.seq);
  return out;
}

// ---------------------------------------------------------------------------
// per-connection lifecycle
// ---------------------------------------------------------------------------

async function startWatcher(ws: WebSocket, state: ConnState): Promise<void> {
  if (!state.roomId || !state.role) return;
  const roomId  = state.roomId;
  const role    = state.role;
  const partner = partnerOf(role);

  // Initial partner presence + replay any pending messages.
  let partnerPresent = false;
  const presenceEntry = await kv.get(presenceKey(roomId, partner));
  if (presenceEntry.value) {
    partnerPresent = true;
    send(ws, { type: "peer-joined" });
  }

  const pending = await readUnseen(roomId, partner, state.lastSeenPartnerSeq);
  for (const { seq, envelope } of pending) {
    send(ws, envelope);
    state.lastSeenPartnerSeq = seq;
  }

  // Watch for partner presence and partner seq changes. Stream is cancelled
  // from handleClose() via state.watcher.cancel().
  const watcher = kv.watch([
    presenceKey(roomId, partner),
    seqKey(roomId, partner),
  ]);
  state.watcher = watcher;

  (async () => {
    try {
      for await (const entries of watcher) {
        if (ws.readyState !== WebSocket.OPEN) break;
        const presence = entries[0];

        const nowPresent = !!presence.value;
        if (nowPresent && !partnerPresent) {
          send(ws, { type: "peer-joined" });
          partnerPresent = true;
        } else if (!nowPresent && partnerPresent) {
          send(ws, { type: "peer-left" });
          partnerPresent = false;
        }

        const newMsgs = await readUnseen(roomId, partner, state.lastSeenPartnerSeq);
        for (const { seq, envelope } of newMsgs) {
          send(ws, envelope);
          state.lastSeenPartnerSeq = seq;
        }
      }
    } catch (err) {
      // cancel() rejects the in-flight read; that is expected on close.
      console.warn(`watcher error room=${roomId} role=${role}:`, err);
    }
  })();
}

async function handleRegister(ws: WebSocket, state: ConnState, role: Role, roomId: string): Promise<void> {
  if (state.roomId) {
    send(ws, { type: "error", error: "already registered" });
    return;
  }

  state.role = role;
  state.roomId = roomId;
  state.lastSeenPartnerSeq = 0;

  // Mark ourselves present.
  await setPresence(roomId, role);
  state.heartbeatTimer = setInterval(() => {
    setPresence(roomId, role).catch((err) => console.warn("heartbeat failed:", err));
  }, HEARTBEAT_MS);

  console.log(`[=] register role=${role} room=${roomId}`);
  send(ws, { type: "registered" });

  // Start watching partner. Initial presence/messages handled inside.
  await startWatcher(ws, state);
}

async function handleClose(ws: WebSocket): Promise<void> {
  const state = connState.get(ws);
  if (!state) return;

  if (state.heartbeatTimer != null) {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }
  if (state.watcher) {
    state.watcher.cancel().catch(() => { /* expected on cancel */ });
    state.watcher = null;
  }
  if (state.roomId && state.role) {
    await clearPresence(state.roomId, state.role);
    console.log(`[-] close role=${state.role} room=${state.roomId}`);
  }
}

// ---------------------------------------------------------------------------
// message dispatch
// ---------------------------------------------------------------------------

async function handleMessage(ws: WebSocket, raw: string): Promise<void> {
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
    await handleRegister(ws, state, msg.role as Role, msg.roomId as string);
    return;
  }

  if (RELAY_TYPES.has(msg.type)) {
    if (!state.roomId || !state.role) {
      send(ws, { type: "error", error: "not registered" });
      return;
    }
    await publishRelay(state.roomId, state.role, msg);
    return;
  }

  send(ws, { type: "error", error: `unknown type: ${msg.type}` });
}

// ---------------------------------------------------------------------------
// HTTP / WebSocket entrypoint
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    // Best-effort room count: list distinct roomIds in presence keys.
    const seen = new Set<string>();
    try {
      const iter = kv.list({ prefix: ["rooms"] });
      for await (const entry of iter) {
        if (entry.key[2] === "presence") seen.add(entry.key[1] as string);
      }
    } catch (err) {
      console.warn("health list failed:", err);
    }
    return Response.json({ ok: true, rooms: seen.size });
  }

  if (req.headers.get("upgrade") !== "websocket") {
    return new Response(
      "Stream Master broker. Connect via WebSocket.\n",
      { headers: { "content-type": "text/plain" } },
    );
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  connState.set(socket, {
    role: null,
    roomId: null,
    heartbeatTimer: null,
    watcher: null,
    lastSeenPartnerSeq: 0,
  });

  socket.onopen    = () => console.log("[+] connect");
  socket.onmessage = (e) => { handleMessage(socket, e.data).catch(console.warn); };
  socket.onclose   = () => { handleClose(socket).catch(console.warn); };
  socket.onerror   = (e) => {
    const state = connState.get(socket);
    console.warn(`[!] ws error role=${state?.role} room=${state?.roomId}:`, e);
  };

  return response;
});
