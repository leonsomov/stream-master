// Smoke test for the broker. Connects two clients, registers each in the same
// room with sender/receiver roles, exchanges SDP/ICE envelopes, then verifies
// each side saw what it should have seen.

const WebSocket = require('ws');

const URL = process.env.BROKER_URL || 'ws://localhost:8080';
const ROOM = 'test-1234';

let passed = 0;
let failed = 0;

const expect = (name, cond) => {
  if (cond) { console.log(`  PASS  ${name}`); passed++; }
  else      { console.log(`  FAIL  ${name}`); failed++; }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeClient(role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const events = [];
    ws.on('open', () => resolve({ ws, events, role }));
    ws.on('error', reject);
    ws.on('message', (raw) => events.push(JSON.parse(raw.toString())));
  });
}

(async () => {
  console.log(`connecting to ${URL}`);

  const sender   = await makeClient('sender');
  const receiver = await makeClient('receiver');

  sender.ws.send(JSON.stringify({ type: 'register', role: 'sender', roomId: ROOM }));
  await sleep(100);
  receiver.ws.send(JSON.stringify({ type: 'register', role: 'receiver', roomId: ROOM }));
  await sleep(200);

  expect('sender got registered',           sender.events.some(m => m.type === 'registered'));
  expect('receiver got registered',         receiver.events.some(m => m.type === 'registered'));
  expect('sender saw peer-joined',          sender.events.some(m => m.type === 'peer-joined'));
  expect('receiver saw peer-joined',        receiver.events.some(m => m.type === 'peer-joined'));

  sender.ws.send(JSON.stringify({ type: 'offer', sdp: 'v=0\r\no=- offer' }));
  await sleep(100);
  expect('offer relayed to receiver',       receiver.events.some(m => m.type === 'offer' && m.sdp));

  receiver.ws.send(JSON.stringify({ type: 'answer', sdp: 'v=0\r\no=- answer' }));
  await sleep(100);
  expect('answer relayed to sender',        sender.events.some(m => m.type === 'answer' && m.sdp));

  sender.ws.send(JSON.stringify({ type: 'candidate', candidate: { sdpMid: '0' } }));
  await sleep(100);
  expect('candidate relayed to receiver',   receiver.events.some(m => m.type === 'candidate'));

  receiver.ws.close();
  await sleep(150);
  expect('sender notified peer-left',       sender.events.some(m => m.type === 'peer-left'));

  sender.ws.close();
  await sleep(50);

  console.log();
  console.log(`PASSED ${passed}  FAILED ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('test crashed:', err.message);
  process.exit(2);
});
