# Stream Master

Low-latency audio streaming plugin for Logic Pro and Bitwig Studio.

**Status:** v0 — passthrough skeleton. No networking yet.

## Plan

Master-bus plugin that encodes the stereo mix with Opus and streams one-way to a
collaborator's browser via WebRTC.

## Build

Requires:
- macOS on Apple Silicon
- Xcode Command Line Tools (`xcode-select --install`)
- CMake 3.22+ (`brew install cmake`)

```sh
git submodule update --init --recursive
cmake -B build
cmake --build build --config Release -j 8
```

`COPY_PLUGIN_AFTER_BUILD` is enabled, so the build auto-installs to:

- `~/Library/Audio/Plug-Ins/Components/Stream Master.component`
- `~/Library/Audio/Plug-Ins/VST3/Stream Master.vst3`

## Validate (optional)

```sh
auval -v aufx Strm Gpks
```
