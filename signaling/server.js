// Stream Master signaling broker.
//
// Responsibilities:
//   1. Accept WebSocket connections from sender plugins and receiver browsers.
//   2. Pair them by stream ID + role (sender / receiver).
//   3. Relay WebRTC handshake messages (offer / answer / candidate) between
//      paired peers. The broker never sees audio.
//
// Wire protocol — JSON envelopes:
//   { "type": "register",   "role": "sender" | "receiver", "roomId": "..." }
//   { "type": "registered" }                       // server  → client
//   { "type": "peer-joined" }                      // server  → both
//   { "type": "peer-left" }                        // server  → remaining
//   { "type": "offer",      "sdp": "..." }         // sender  → receiver
//   { "type": "answer",     "sdp": "..." }         // receiver → sender
//   { "type": "candidate",  "candidate": {...} }   // either  → other
//   { "type": "error",      "error": "..." }       // server  → client

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOM_ID_RE = /^[a-z0-9-]{4,32}$/;
const VALID_ROLES = new Set(['sender', 'receiver']);
const RELAY_TYPES = new Set(['offer', 'answer', 'candidate']);

// roomId -> { sender?: ws, receiver?: ws }
const rooms = new Map();

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Stream Master broker. Connect via WebSocket.\n');
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function partnerRole(role) {
  return role === 'sender' ? 'receiver' : 'sender';
}

wss.on('connection', (ws, req) => {
  ws.role = null;
  ws.roomId = null;

  console.log(`[+] connect from ${req.socket.remoteAddress}`);

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', error: 'invalid json' });
      return;
    }

    if (msg.type === 'register') {
      if (!ROOM_ID_RE.test(msg.roomId || '') || !VALID_ROLES.has(msg.role)) {
        send(ws, { type: 'error', error: 'invalid register' });
        ws.close();
        return;
      }
      if (ws.roomId) {
        send(ws, { type: 'error', error: 'already registered' });
        return;
      }

      ws.role = msg.role;
      ws.roomId = msg.roomId;

      const room = rooms.get(msg.roomId) || {};
      // If a peer is already registered with this role, kick the old one.
      if (room[msg.role]) {
        send(room[msg.role], { type: 'error', error: 'replaced by new peer' });
        room[msg.role].close();
      }
      room[msg.role] = ws;
      rooms.set(msg.roomId, room);

      console.log(`[=] register role=${msg.role} room=${msg.roomId}`);
      send(ws, { type: 'registered' });

      const partner = room[partnerRole(msg.role)];
      if (partner && partner.readyState === WebSocket.OPEN) {
        send(ws, { type: 'peer-joined' });
        send(partner, { type: 'peer-joined' });
      }
      return;
    }

    if (RELAY_TYPES.has(msg.type)) {
      if (!ws.roomId) {
        send(ws, { type: 'error', error: 'not registered' });
        return;
      }
      const room = rooms.get(ws.roomId);
      const partner = room && room[partnerRole(ws.role)];
      if (partner && partner.readyState === WebSocket.OPEN) {
        partner.send(raw.toString());
      } else {
        send(ws, { type: 'error', error: 'no peer' });
      }
      return;
    }

    send(ws, { type: 'error', error: `unknown type: ${msg.type}` });
  });

  ws.on('close', () => {
    if (!ws.roomId) return;
    const room = rooms.get(ws.roomId);
    if (!room) return;

    if (room[ws.role] === ws) delete room[ws.role];

    const partner = room[partnerRole(ws.role)];
    if (partner && partner.readyState === WebSocket.OPEN) {
      send(partner, { type: 'peer-left' });
    }

    if (!room.sender && !room.receiver) {
      rooms.delete(ws.roomId);
    }
    console.log(`[-] close role=${ws.role} room=${ws.roomId}`);
  });

  ws.on('error', (err) => {
    console.warn(`[!] ws error role=${ws.role} room=${ws.roomId}: ${err.message}`);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Stream Master broker listening on :${PORT}`);
});

const shutdown = (signal) => {
  console.log(`Got ${signal}, shutting down...`);
  wss.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
