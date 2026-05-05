# Stream Master signaling broker

WebSocket relay that pairs a Stream Master sender plugin with a browser
receiver and forwards WebRTC handshake messages (SDP offer/answer, ICE
candidates). Audio never traverses this server.

## Local

```sh
npm install
PORT=8080 node server.js
# in another shell
curl http://localhost:8080/health
```

Two clients can pair by sending `{"type":"register","role":"sender"|"receiver","roomId":"<id>"}`
to `ws://localhost:8080`.

## Deploy (Fly.io)

```sh
fly launch --no-deploy --copy-config --name stream-master-leon --region mad --yes
fly deploy
```

The broker exposes `wss://<app>.fly.dev`. The plugin and the receiver page both
connect to the same URL with their respective roles.
