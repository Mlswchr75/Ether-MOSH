# @mosh/engine

The MOSH 2.0 rendering engine — the heavy graphics layer, extracted into a
standalone package so it can be compiled, tested, and GPU-profiled in a tight
loop (something the prompt-based app builder can't do well). The MOSH app
imports this engine and drives it through a small, stable API; all UI, state,
auth, payments, and content stay in the app.

> Status: **scaffold**. This is the Phase 2/3 foundation from the MOSH 2.0
> blueprint. The public API and subsystem contracts are defined here; the
> WebGL2/WebGPU implementations land incrementally. Phase 1 (HDR + real
> post-processing chain) currently ships inside the app's existing
> `src/engine/Renderer.ts`; those passes migrate here as the engine matures.

## Why a separate package

The app's current renderer is a single-pass, fragment-shader-only, 8-bit
pipeline. The MOSH 2.0 leaps — HDR float16 targets, a real post-process graph,
GPU particles, feedback trails, on-device segmentation, and **region-masked
effect stacks** (each detected element moshed independently) — need
compile → test → profile iteration on real GPUs. That belongs in code, not in
a chat-driven builder.

## Design goals

- **Backend-agnostic.** A WebGL2 baseline (universal, incl. iOS 15+) with
  WebGPU as progressive enhancement (compute particles, faster segmentation,
  depth). Feature-detect and fall back; never hard-require WebGPU.
- **Stable, small surface.** The app only sees the `MoshEngine` API below.
- **Reactive-native.** Motion fields and audio bands are first-class inputs
  that both effects and the post chain consume.
- **Adaptive.** A runtime capability probe scales DPR, particle counts, pass
  count, and segmentation FPS to hold 60fps without cooking the device.

## Public API (see `src/index.ts`)

```ts
const engine = await createMoshEngine(canvas, { preferWebGPU: true });

engine.setSource(videoOrImageOrCanvas);   // live camera, image, or procedural
engine.setStack(effectStack);             // ordered, blended, audio-mapped layers
engine.setMotionField(motionFieldConfig); // GPU frame-diff / optical flow driver
engine.setRegions(segmentationConfig);    // MediaPipe masks -> per-region stacks
engine.render(frame);                     // per-rAF; consumes audio + motion
engine.resize(width, height, dpr);
engine.capabilities;                      // what this device actually supports
engine.dispose();
```

## Subsystems

| Module | Responsibility | Phase |
|---|---|---|
| `postfx/PostChain` | HDR float16 pipeline: bloom, chromatic aberration, CAS, vignette, filmic tone-map | 1 → migrating in |
| `motion/MotionField` | GPU frame-diff / optical-flow, per-pixel + per-zone motion | 2 |
| `segmentation/Segmenter` | MediaPipe Selfie Segmentation + Pose → mask textures | 2 |
| `particles/ParticleSystem` | Transform-feedback (WebGL2) / compute (WebGPU) particles steered by motion+audio | 2 → 3 |

## Roadmap

- **Phase 1** — HDR + real post-process chain. (Ships in-app now; migrates here.)
- **Phase 2** — Motion field on GPU, MediaPipe segmentation, region-masked
  effect stacks, GPU particles, feedback trails. WebGL2.
- **Phase 3** — WebGPU path (compute particles, depth-based 3D displacement),
  with WebGL2 fallback.

See the MOSH 2.0 blueprint for the full rationale, risks, and phasing.
