# Graph rendering performance (release build, real device)

Measured 2026-10-06 at commit `842f718`.

## Setup

| | |
|---|---|
| Device | OPPO CPH2765 (foldable, inner display 2248×2480, adaptive 60/90/120 Hz) |
| SoC / OS | Snapdragon SM8850, Android 16 |
| Build | Release APK (`assembleRelease`, arm64-v8a, Hermes bytecode, not debuggable) |
| Data | Stress test: 150 synthetic people (Engine preview → Graph stress test) |
| Tooling | `adb shell dumpsys gfxinfo` (frame statistics), on-screen timings from the app |

Frame statistics are Android's own: *janky* frames missed their display
deadline; percentiles are per-frame durations and can exceed the refresh
interval without jank because rendering is pipelined. Interaction = six
400 ms swipes across the graph (some start on a person and drag them, the
rest pan the view).

## Live renderer (Skia, running physics, pulsing glow)

| Trial | Phase | Frames | Janky | p50 | p90 | p99 |
|---|---|---|---|---|---|---|
| 1 | Settling (first 6 s) | 431 | 0.46% | 12 ms | 23 ms | 27 ms |
| 1 | Steady glow (5 s) | 305 | 0.00% | 22 ms | 23 ms | 25 ms |
| 1 | Interaction | 405 | 0.00% | 14 ms | 14 ms | 21 ms |
| 2 | Settling | 431 | 0.46% | 13 ms | 22 ms | 25 ms |
| 2 | Steady glow | 304 | 0.00% | 21 ms | 23 ms | 24 ms |
| 2 | Interaction | 404 | 0.50% | 7 ms | 14 ms | 21 ms |
| 3 | Settling | 432 | 0.23% | 12 ms | 22 ms | 24 ms |
| 3 | Steady glow | 305 | 0.33% | 20 ms | 22 ms | 23 ms |
| 3 | Interaction | 409 | 0.00% | 7 ms | 11 ms | 15 ms |

Time to first frame: 37, 63, 43, 36 ms.

## Static renderers (one-shot layout, then pan)

| Renderer | Render time (3 runs) | Pan: janky frames (3 runs) |
|---|---|---|
| Skia (static) | 41, 43 ms (+1 run incl. layout) | 1.03%, 0.00%, 0.51% |
| SVG | 109, 110, 112 ms | 1.52%, 1.52%, 1.50% |

## One-shot layout (d3-force, 120 ticks, 150 people)

| Environment | Time |
|---|---|
| Node 22 (V8, laptop) | ~61 ms |
| Emulator, dev build (Hermes) | 808–930 ms |
| This phone, release build (Hermes) | 1254, 1285, 1335, 1338 ms |

Hermes interprets bytecode without a JIT, so numeric code like d3-force runs
~20× slower than on V8; the phone's release build is not faster than the
emulator here. About 11 ms per simulation tick at 150 people.

## Findings

1. **The live renderer is smooth on real hardware:** ≤ 0.5% janky frames in
   every phase and trial, first frame in under 65 ms.
2. **Skia beats SVG** for the same static drawing: ~42 ms vs ~110 ms to draw
   150 people, and fewer janky frames while panning (≤ 1% vs ~1.5%).
3. **Synchronous layout is the bottleneck,** not drawing: ~1.3 s on this
   phone. It blocks the JS thread for the static renderers' first open and
   for the reduced-motion path (which settles all at once). The live
   renderer avoids it by doing one tick per frame, at the cost of a slower
   settle (~3–5 s). Candidates: compute the layout on a background worklet
   runtime, cheaper forces (fewer collision iterations), or persisting
   positions so the layout rarely runs.

## Reproducing

```sh
cd apps/mobile/android
./gradlew app:assembleRelease -x lint -x test -x lintVitalAnalyzeRelease \
  -x lintVitalReportRelease -x lintVitalRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
adb shell dumpsys gfxinfo dev.kironde.socialgraph reset   # then use the screen
adb shell dumpsys gfxinfo dev.kironde.socialgraph
```

The lint exclusions work around a crash in Android lint while analysing
`expo-modules-core`; they do not affect the APK.
