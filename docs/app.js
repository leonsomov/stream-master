// Stream Master receiver / test-sender app.
//
// URL params:
//   ?r=<roomId>     room to listen on (required)
//   ?send=1         test-sender mode (generates a 440Hz sine + chat); default
//                   is receiver mode
//   ?broker=<url>   override the signaling broker (default: production)
//
// Flow (receiver):
//   open WS  →  register{role:receiver,roomId}  →  wait peer-joined
//   →  receive offer  →  setRemoteDescription  →  createAnswer  →  send answer
//   →  receive ICE candidates  →  add them  →  ontrack → <audio>
//
// Flow (sender, test mode):
//   open WS  →  register{role:sender,roomId}  →  wait peer-joined
//   →  capture test tone  →  createOffer (with audio + datachannel)
//   →  send offer  →  receive answer  →  apply  →  send ICE  →  done

const DEFAULT_BROKER = "wss://stream-master.leonsomov.deno.net";

const params = new URLSearchParams(location.search);
const roomId = params.get("r");
const mode = params.get("send") === "1" ? "sender" : "receiver";
const brokerUrl = params.get("broker") ?? DEFAULT_BROKER;

const dom = {
  title:           document.getElementById("page-title"),
  roleLabel:       document.getElementById("role-label"),
  roomId:          document.getElementById("room-id"),
  status:          document.getElementById("status"),
  startButton:     document.getElementById("start-button"),
  sendStartButton: document.getElementById("send-start-button"),
  audio:           document.getElementById("audio"),
  chat:            document.getElementById("chat"),
  chatLog:         document.getElementById("chat-log"),
  chatForm:        document.getElementById("chat-form"),
  chatInput:       document.getElementById("chat-input"),
  footerMode:      document.getElementById("footer-mode"),
};

function setStatus(text, kind) {
  dom.status.textContent = text;
  dom.status.className = "status" + (kind ? " " + kind : "");
}

function appendChat(who, text, kind) {
  const div = document.createElement("div");
  div.className = "chat-msg " + (kind ?? "");
  if (kind === "system") {
    div.textContent = text;
  } else {
    const w = document.createElement("span");
    w.className = "who";
    w.textContent = who;
    div.appendChild(w);
    div.appendChild(document.createTextNode(text));
  }
  dom.chatLog.appendChild(div);
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

// ---------------------------------------------------------------------------
// Validate room ID up front
// ---------------------------------------------------------------------------

if (!roomId || !/^[a-z0-9-]{4,32}$/.test(roomId)) {
  dom.roomId.textContent = "(no room)";
  dom.roomId.classList.add("empty");
  setStatus("open this page with ?r=<id>", "error");
  throw new Error("missing or invalid room id");
}

dom.roomId.textContent = roomId;
document.title = `Stream Master  /  ${roomId}`;

if (mode === "sender") {
  dom.title.textContent = "Stream Master · Test Sender";
  dom.roleLabel.textContent = "sending to room";
  dom.footerMode.textContent = "test sender";
} else {
  dom.roleLabel.textContent = "listening to room";
  dom.footerMode.textContent = "receiver";
}

// ---------------------------------------------------------------------------
// WebRTC + signaling
// ---------------------------------------------------------------------------

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

let ws = null;
let pc = null;
let dc = null;          // chat data channel
let audioContext = null; // for sender's test tone

function openSocket() {
  ws = new WebSocket(brokerUrl);

  ws.addEventListener("open", () => {
    setStatus("registering");
    ws.send(JSON.stringify({ type: "register", role: mode, roomId }));
  });

  ws.addEventListener("message", async (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }

    if (msg.type === "registered") {
      setStatus("waiting for peer");
    } else if (msg.type === "peer-joined") {
      setStatus("peer joined, negotiating", "live");
      if (mode === "sender") {
        await senderStartNegotiation();
      } else {
        receiverPrepare();
      }
    } else if (msg.type === "peer-left") {
      setStatus("peer left, waiting for return");
      teardownPeer();
    } else if (msg.type === "offer") {
      await handleOffer(msg.sdp);
    } else if (msg.type === "answer") {
      await handleAnswer(msg.sdp);
    } else if (msg.type === "candidate") {
      await handleCandidate(msg.candidate);
    } else if (msg.type === "error") {
      console.warn("broker error:", msg.error);
      setStatus(`broker: ${msg.error}`, "error");
    }
  });

  ws.addEventListener("close", () => {
    setStatus("disconnected from broker", "error");
  });
  ws.addEventListener("error", () => {
    setStatus("broker connection error", "error");
  });
}

function sendSignal(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function teardownPeer() {
  if (dc) { try { dc.close(); } catch (_) { /* ignore */ } dc = null; }
  if (pc) { try { pc.close(); } catch (_) { /* ignore */ } pc = null; }
  dom.chat.hidden = true;
  dom.audio.srcObject = null;
}

function makePeer() {
  const peer = new RTCPeerConnection(ICE_CONFIG);

  peer.addEventListener("icecandidate", (e) => {
    if (e.candidate) {
      sendSignal({ type: "candidate", candidate: e.candidate.toJSON() });
    }
  });

  peer.addEventListener("connectionstatechange", () => {
    const s = peer.connectionState;
    if (s === "connected") {
      setStatus("live", "live");
    } else if (s === "failed" || s === "disconnected" || s === "closed") {
      setStatus(`peer ${s}`, "error");
    }
  });

  peer.addEventListener("track", (e) => {
    const [stream] = e.streams;
    if (stream) {
      dom.audio.srcObject = stream;
      // some browsers (iOS Safari) need an explicit play() after a user gesture
      const tryPlay = () => dom.audio.play().catch(() => {
        dom.startButton.hidden = false;
      });
      tryPlay();
    }
  });

  peer.addEventListener("datachannel", (e) => {
    bindChat(e.channel);
  });

  return peer;
}

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

function receiverPrepare() {
  // wait for sender to send the offer; pc gets created on offer arrival
}

async function handleOffer(sdp) {
  if (mode !== "receiver") return;
  pc = makePeer();
  await pc.setRemoteDescription({ type: "offer", sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal({ type: "answer", sdp: answer.sdp });
  setStatus("answered, waiting for media", "live");
}

// ---------------------------------------------------------------------------
// Sender (test mode)
// ---------------------------------------------------------------------------

async function senderStartNegotiation() {
  if (mode !== "sender") return;

  if (!audioContext) {
    dom.sendStartButton.hidden = false;
    setStatus("tap to start the test tone");
    return;
  }

  await actuallyStartSending();
}

async function actuallyStartSending() {
  pc = makePeer();

  const stream = makeTestToneStream();
  for (const track of stream.getAudioTracks()) {
    pc.addTrack(track, stream);
  }

  // Sender opens the data channel; receiver gets it via ondatachannel
  dc = pc.createDataChannel("chat");
  bindChat(dc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendSignal({ type: "offer", sdp: offer.sdp });
  setStatus("offered, waiting for answer", "live");
}

async function handleAnswer(sdp) {
  if (mode !== "sender" || !pc) return;
  await pc.setRemoteDescription({ type: "answer", sdp });
  setStatus("answered, finalizing", "live");
}

function makeTestToneStream() {
  const ctx = audioContext;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 440;

  const gain = ctx.createGain();
  gain.gain.value = 0.15;

  const dest = ctx.createMediaStreamDestination();
  osc.connect(gain).connect(dest);
  osc.start();

  return dest.stream;
}

// ---------------------------------------------------------------------------
// ICE
// ---------------------------------------------------------------------------

async function handleCandidate(candidate) {
  if (!pc) return;
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.warn("addIceCandidate failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function bindChat(channel) {
  dc = channel;

  channel.addEventListener("open", () => {
    dom.chat.hidden = false;
    dom.chatInput.disabled = false;
    appendChat("", "chat connected", "system");
  });
  channel.addEventListener("close", () => {
    dom.chatInput.disabled = true;
    appendChat("", "chat disconnected", "system");
  });
  channel.addEventListener("message", (e) => {
    appendChat(mode === "sender" ? "them" : "them", e.data, "from-them");
  });
}

dom.chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = dom.chatInput.value.trim();
  if (!text || !dc || dc.readyState !== "open") return;
  dc.send(text);
  appendChat("me", text, "from-me");
  dom.chatInput.value = "";
});

// ---------------------------------------------------------------------------
// Buttons / autoplay
// ---------------------------------------------------------------------------

dom.startButton.addEventListener("click", () => {
  dom.startButton.hidden = true;
  dom.audio.play().catch((err) => {
    setStatus(`audio play failed: ${err.message}`, "error");
  });
});

dom.sendStartButton.addEventListener("click", async () => {
  dom.sendStartButton.hidden = true;
  // AudioContext must be created from a user gesture in some browsers
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); } catch (_) { /* ignore */ }
  }
  await actuallyStartSending();
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

if (mode === "sender") {
  // Sender needs a user gesture before it can create AudioContext on some
  // browsers, so prompt up front and wait for the click. Negotiation kicks in
  // after the click, once the peer also joins.
  audioContext = null;
}

openSocket();
