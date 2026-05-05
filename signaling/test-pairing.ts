// Smoke test for the broker. Connects two WebSockets, registers each in the
// same room with sender/receiver roles, exchanges SDP/ICE envelopes, then
// asserts each side saw what it should have seen.
//
// Run with the broker already listening on PORT (default 8080):
//   deno task test
//
// Override the URL to test against a deployed broker:
//   BROKER_URL=wss://stream-master-leon.deno.dev deno run --allow-net test-pairing.ts

const URL_ = Deno.env.get("BROKER_URL") ?? "ws://localhost:8000";
const ROOM = "test-1234";

let passed = 0;
let failed = 0;

function expect(name: string, cond: boolean): void {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    failed++;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Client {
  ws: WebSocket;
  events: Array<Record<string, unknown>>;
  role: "sender" | "receiver";
}

async function makeClient(role: "sender" | "receiver"): Promise<Client> {
  const ws = new WebSocket(URL_);
  const events: Array<Record<string, unknown>> = [];
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (e) => reject(e), { once: true });
  });
  ws.addEventListener("message", (e) => {
    events.push(JSON.parse(e.data));
  });
  return { ws, events, role };
}

console.log(`connecting to ${URL_}`);

const sender = await makeClient("sender");
const receiver = await makeClient("receiver");

sender.ws.send(JSON.stringify({ type: "register", role: "sender", roomId: ROOM }));
await sleep(100);
receiver.ws.send(JSON.stringify({ type: "register", role: "receiver", roomId: ROOM }));
await sleep(200);

expect("sender got registered",         sender.events.some((m) => m.type === "registered"));
expect("receiver got registered",       receiver.events.some((m) => m.type === "registered"));
expect("sender saw peer-joined",        sender.events.some((m) => m.type === "peer-joined"));
expect("receiver saw peer-joined",      receiver.events.some((m) => m.type === "peer-joined"));

sender.ws.send(JSON.stringify({ type: "offer", sdp: "v=0\r\no=- offer" }));
await sleep(100);
expect("offer relayed to receiver",     receiver.events.some((m) => m.type === "offer" && m.sdp));

receiver.ws.send(JSON.stringify({ type: "answer", sdp: "v=0\r\no=- answer" }));
await sleep(100);
expect("answer relayed to sender",      sender.events.some((m) => m.type === "answer" && m.sdp));

sender.ws.send(JSON.stringify({ type: "candidate", candidate: { sdpMid: "0" } }));
await sleep(100);
expect("candidate relayed to receiver", receiver.events.some((m) => m.type === "candidate"));

receiver.ws.close();
await sleep(150);
expect("sender notified peer-left",     sender.events.some((m) => m.type === "peer-left"));

sender.ws.close();
await sleep(50);

console.log();
console.log(`PASSED ${passed}  FAILED ${failed}`);
Deno.exit(failed > 0 ? 1 : 0);
