# GP Stream

Low-latency audio streaming plugin for Logic Pro and Bitwig Studio.

**Status:** v0 — passthrough skeleton. No networking yet.

## Plan

Master-bus plugin that encodes the stereo mix with Opus and streams one-way to a
collaborator's browser via WebRTC. Working title; rename later.

See [PLAN.md](PLAN.md) for the full architecture and roadmap.

## Build

Requires:
- macOS on Apple Silicon
- Xcode Command Line Tools (`xcode-select --install`)
- CMake 3.22+ (`brew install cmake`)

```sh
git submodule update --init --recursive
cmake -B build -G Xcode
cmake --build build --config Release
```

Outputs land in `build/GPStream_artefacts/Release/`:
- `AU/GP Stream.component`
- `VST3/GP Stream.vst3`

## Install locally

```sh
ln -sf "$PWD/build/GPStream_artefacts/Release/AU/GP Stream.component" \
  ~/Library/Audio/Plug-Ins/Components/
ln -sf "$PWD/build/GPStream_artefacts/Release/VST3/GP Stream.vst3" \
  ~/Library/Audio/Plug-Ins/VST3/
```

Restart Logic / Bitwig and rescan plugins.
