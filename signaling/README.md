# Stream Master signaling broker

WebSocket relay that pairs a Stream Master sender plugin with a browser
receiver and forwards WebRTC handshake messages (SDP offer/answer, ICE
candidates). Audio never traverses this server.

Runs on Deno Deploy (free tier, no card required, no cold-start sleep).

## Local

```sh
# Run the broker on :8000 (Deno default)
deno task dev

# In another shell, run the smoke test against localhost
deno task test

# Or test against a deployed broker
BROKER_URL=wss://stream-master-leon.deno.dev deno task test
```

## Deploy (Deno Deploy)

1. Sign in at https://dash.deno.com with the GitHub account that owns the repo.
2. New Project → Link this GitHub repo (`leonsomov/stream-master`).
3. Production branch: `main`. Entrypoint: `signaling/server.ts`.
4. Project name: `stream-master-leon` (or whatever produces a free
   `<name>.deno.dev` URL).
5. First deploy happens automatically. Subsequent pushes to `main` redeploy.

The broker is then reachable at `wss://stream-master-leon.deno.dev`. Both the
plugin and the receiver page point at this URL with their respective roles.

## Limitation

State (active rooms) is held in an in-memory Map per Deno Deploy isolate. If
two peers land on different isolates they will not see each other. In practice
both peers usually hit the same isolate when they connect within ~60s of each
other, because the first connection keeps the isolate warm.

If this turns out to bite (peers connecting > 1 minute apart frequently
failing to pair), the fix is to swap the in-memory Map for Deno KV with
`watch()` for cross-isolate coordination. Deferred until needed.
