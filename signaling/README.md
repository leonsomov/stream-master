# Stream Master signaling broker

WebSocket relay that pairs a Stream Master sender plugin with a browser
receiver and forwards WebRTC handshake messages (SDP offer/answer, ICE
candidates). Audio never traverses this server.

Runs on Deno Deploy (free tier, no card required, no cold-start sleep).
State is held in Deno KV so that peers landing on different isolates still
pair correctly.

## Local

```sh
# Run the broker on :8000 (Deno default).
# --unstable-kv is needed locally; Deno Deploy enables KV automatically.
deno task dev

# In another shell, run the smoke test against localhost
deno task test

# Or test against the deployed broker
BROKER_URL=wss://stream-master.leonsomov.deno.net deno task test
```

## Deploy

GitHub-linked auto-deploy: every push to `main` redeploys.

Initial setup (already done for this repo):
1. https://dash.deno.com → New App
2. Repo: `leonsomov/stream-master`
3. App directory: `signaling`
4. Entrypoint: `server.ts`
5. Production branch: `main`

Live URL: `https://stream-master.leonsomov.deno.net`

## Storage layout (Deno KV)

| Key                                    | Value         | TTL  | Purpose                                                |
|----------------------------------------|---------------|------|--------------------------------------------------------|
| `["rooms", id, "presence", role]`      | `{ ts }`      | 30s  | Liveness beacon, refreshed every 10s by heartbeat      |
| `["rooms", id, "seq",      role]`      | `number`      | 5min | Atomic monotonic counter for outbound message sequence |
| `["rooms", id, "msgs",     role, seq]` | envelope JSON | 60s  | A single relay envelope (offer / answer / candidate)   |

Each connection watches the partner's `presence` and `seq` keys. On any
change, the watcher reads any unseen messages from the `msgs` prefix and
forwards them to the local WebSocket.

## Wire protocol

JSON envelopes over WebSocket. See the comment block at the top of
`server.ts` for the full message catalog.
