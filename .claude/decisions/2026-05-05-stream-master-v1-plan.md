# Stream Master v1 — refined plan

**Date:** 2026-05-05
**Status:** Approved, ready to build
**Repo:** github.com/leonsomov/stream-master

## Decision

Ship a JUCE plugin (AU+VST3) that streams stereo Opus audio over WebRTC from
Logic/Bitwig master bus to a browser receiver, with a session chat panel for
collab feedback. Fly.io for the signaling broker. STUN-only (no TURN). v1 is
sender-only audio plus bidirectional text chat.

## Context

Use case is one-to-one mix collab: Leon in Valencia, Linas/Roman in Vilnius.
Leon picks "build instead of buy Audiomovers Listento" for branding/portfolio
value, accepting the multi-week build cost. Web-page receiver (no install
needed for collaborators) chosen over plugin-on-both-ends. Personal tool now,
maybe productize later.

## v1 scope

### In

| Component | Status |
|---|---|
| AU + VST3 plugin (JUCE 8 + CMake) | Built |
| Stream ID + persistence | Built |
| Copy Link button | Built |
| Start/Stop + audio capture (lock-free SPSC FIFO) | Built |
| GitHub Pages receiver stub | Built |
| Opus encoder (libopus) | TODO |
| WebRTC peer in plugin (libdatachannel) | TODO |
| Signaling broker (Fly.io WebSocket app) | TODO |
| Receiver page WebRTC + chat | TODO |
| Loopback test mode | TODO |
| Session chat data channel | TODO |

### Deferred (v2 candidates)

- Talkback (two-way audio) — chat replaces it for v1
- Recording / save session
- Bitrate or quality tiers
- TURN fallback (skip, accept ~10% NAT failures)
- Telemetry baseline (juce::Logger to file)
- Friendly IDs (`bright-fox-42`)
- Real custom domain (github.io is fine)
- Apple Developer ID code signing (only matters for distribution)

## Architecture

```
PLUGIN (sender)            BROKER (Fly.io)             BROWSER (receiver)
─────────────────          ──────────────              ────────────────────
audio capture (built)       pair peers by stream ID
  ↓                         relay SDP/ICE
opus encode                 step out
  ↓
webrtc peer ─── audio track ──────────────────►  decode + <audio>
  ↑↓ data channel  ───────────────────────────   chat panel
chat panel (plugin UI)                            (in receiver page)

loopback mode: encode → decode → audio out (no network)
```

## Steps

1. **Sign up Fly.io** (user task) — non-GP email, install flyctl
2. **Scaffold WebSocket signaling broker on Fly.io** — Node.js + `ws`, Dockerfile, fly.toml, ~150 lines
3. **Wire receiver page for WebRTC + chat** — docs/index.html with RTCPeerConnection, audio playback, chat panel
4. **Integrate libopus encoder** — CMake fetch, encoder wrapper, encode the FIFO contents
5. **Add loopback test mode** — toggle in UI, decode locally, write to output buffer
6. **Integrate libdatachannel for WebRTC peer in plugin** — peer connection, ICE, SDP, audio track binding
7. **Add session chat panel to plugin UI** — expand window, scrollable message list, input field
8. **End-to-end test pass** — local loopback, localhost broker, real Fly.io broker, cross-internet with Linas

## Realistic timeline

**5-8 weeks calendar** at part-time pace. ~15 working days of focused effort.

| Phase | Effort |
|---|---|
| Signaling broker + receiver page | 3-4 days |
| libopus + loopback | 1.5 days |
| libdatachannel integration | 5-10 days (the schedule killer) |
| Chat panel | 2 days |
| End-to-end debugging | 3-5 days |

## Risks

- **libdatachannel + JUCE audio thread integration** is the largest unknown.
  ICE gathering edge cases, SDP munging, audio track binding eat days each.
  Loopback mode mitigates this by letting us iterate without network.
- **NAT failures with no TURN** — ~10% of sessions silently fail. Plan B is
  "I'll bounce and email you."
- **Audio clock drift** on long sessions. WebRTC jitter buffer handles it but
  occasional glitches over 30+ min are acceptable.
- **Chat scope creep** — keep v1 plain text, no markdown/emoji/persistence.

## Rejected alternatives

- **Just buy Audiomovers Listento (€10/mo).** Honest baseline. Rejected for
  branding/portfolio reasons.
- **OBS + BlackHole + WebRTC output.** Zero plugin development but adds OBS as
  a runtime dependency. Ugly UX.
- **Cloudflare Workers for signaling.** User chose Fly.io to keep separate
  from GP CF account.
- **PeerJS Cloud.** Free public broker exists but custom protocol on plugin
  side is roughly the same C++ effort as our own broker, and you don't control
  rate limits or uptime.
- **Talkback (two-way audio) in v1.** Chat covers most collab-feedback need
  with much lower complexity (no AEC, no echo discipline). Defer talkback
  to v2.
- **TURN fallback in v1.** ~10% failure rate is acceptable for personal use.
  Add TURN when the failure mode actually bites.
- **Telemetry/Friendly IDs/Recording** — all small wins, deferred to keep
  v1 scope tight.

## Open questions (resolved on default)

- Broker host: Fly.io (over Deno Deploy)
- Plugin window size: 480×420 with always-visible chat panel
- Chat persistence: ephemeral (no save across sessions)
