# Sticker Forge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a quality-gated two-tier transparent Lottie Sticker Forge that uses faithful raster-backed Lottie universally and true vector shape Lottie for suitable artwork.

**Architecture:** Extend the existing Overlay/Vault pipeline rather than creating a second sticker store. Keep source analysis/vectorization in focused engine modules; the UI consumes a deterministic recommendation and produces the same `OverlayAsset` contract used by imported/captured stickers.

**Tech Stack:** React, TypeScript, Zustand overlay store, IndexedDB Vault, dotLottie runtime, Canvas 2D image analysis, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-sticker-forge-design.md`

## Global Constraints
- Preserve transparent alpha; never add a background layer.
- Never describe raster-backed output as vector.
- Vector recommendation threshold is 0.72.
- Analysis/vectorization is on-demand and bounded for mobile.
- Netlify preview must build successfully before merge.

---

### Task 1: Stabilize Universal Lottie Forge

**Files:**
- Modify: `src/engine/overlay/stickerLottie.ts`
- Test: `src/engine/overlay/stickerLottie.test.ts`
- Modify: `src/components/editor/OverlayVault.tsx`

**Interfaces:**
- Produces: `buildStickerLottie(input): object`, `blobToPngDataUrl(blob): Promise<string>`, `lottieJsonBlob(json): Blob`.

- [ ] Add failing tests for transparent self-contained image assets, each motion preset, dimensions, duration, and no solid background layer.
- [ ] Run `npm test -- src/engine/overlay/stickerLottie.test.ts` and verify the new assertions fail before implementation.
- [ ] Harden `buildStickerLottie` to sanitize dimensions/FPS/duration and keep embedded image data self-contained.
- [ ] Run the focused test and verify it passes.
- [ ] Commit the Universal Lottie slice.

### Task 2: Vector Suitability Analyzer

**Files:**
- Create: `src/engine/overlay/vectorSuitability.ts`
- Create: `src/engine/overlay/vectorSuitability.test.ts`

**Interfaces:**
- Produces: `scoreVectorSuitability(imageData: ImageData): { score: number; recommendation: "vector" | "universal"; metrics: { alphaOccupancy: number; edgeDensity: number; colorComplexity: number; contourComplexity: number } }`.

- [ ] Write tests with synthetic flat-icon, silhouette, noisy-photo, and transparent-empty ImageData fixtures.
- [ ] Run focused test and verify failure because analyzer is absent.
- [ ] Implement bounded sampling (maximum effective analysis dimension 256px), deterministic metrics, and threshold 0.72.
- [ ] Run focused tests and verify all fixtures classify as expected.
- [ ] Commit analyzer.

### Task 3: Bounded Vector Shape Tracing

**Files:**
- Create: `src/engine/overlay/vectorTrace.ts`
- Create: `src/engine/overlay/vectorTrace.test.ts`
- Create: `src/engine/overlay/vectorLottie.ts`
- Create: `src/engine/overlay/vectorLottie.test.ts`

**Interfaces:**
- Produces: `traceStickerShapes(imageData, options): TracedStickerShape[]` with a hard path/point budget.
- Produces: `buildVectorStickerLottie({ name, width, height, shapes, preset }): object`.

- [ ] Write failing tests for a rectangle/silhouette fixture, transparent holes, path simplification, and complexity rejection.
- [ ] Implement contour extraction and simplification with maximum 24 shapes and maximum 320 points per shape; return a typed rejection when budgets are exceeded.
- [ ] Implement Lottie shape-layer serialization with no image asset and no background layer.
- [ ] Verify generated vector Lottie uses shape layers (`ty: 4`) and contains no raster assets.
- [ ] Commit vector engine.

### Task 4: Sticker Forge Inspector

**Files:**
- Create: `src/components/editor/StickerForge.tsx`
- Modify: `src/components/editor/OverlayVault.tsx`

**Interfaces:**
- Consumes existing selected `OverlayEntity`, suitability analyzer, Universal/Vector builders, Vault persistence, and overlay store `addAsset`.

- [ ] Add component tests or pure helper tests for Auto mode choosing Vector only at score >= 0.72 and falling back to Universal on vector rejection.
- [ ] Build compact Forge UI: Auto / Universal / Vector, recommendation badge/reason, motion preset, Forge button, busy/error state.
- [ ] Keep `Make Sticker` as the one-tap Vault action; open advanced Forge separately.
- [ ] On success place the forged asset, persist it, open Vault, and expose download.
- [ ] Commit UI integration.

### Task 5: Motion Expansion and Runtime Compatibility

**Files:**
- Modify: `src/engine/overlay/stickerLottie.ts`
- Modify: `src/engine/overlay/vectorLottie.ts`
- Modify: `src/components/editor/LottieOverlay.tsx`
- Tests: corresponding engine tests.

**Interfaces:**
- Add presets `breathe`, `orbit`, `jitter`, `glitch`, `melt` only where representable without pathological geometry.

- [ ] Add failing preset-structure tests.
- [ ] Implement bounded native Lottie transforms/opacity; keep Melt vector-only if raster distortion cannot be represented faithfully.
- [ ] Verify generated files load through existing dotLottie renderer and remain compatible with playback REACT controls.
- [ ] Commit motion expansion.

### Task 6: Mobile Budgets and Release Verification

**Files:**
- Modify: `src/engine/overlay/deviceBudget.ts` if new analysis budget fields are required.
- Add/modify focused budget tests.

**Interfaces:**
- Analysis max dimension: 256 desktop, 192 constrained mobile.
- Vector output hard cap: 24 shapes, 320 points/shape; reject/fallback rather than exceed.

- [ ] Add budget tests for coarse-pointer/low-core devices.
- [ ] Apply budgets to analysis/tracing paths.
- [ ] Run focused Sticker Forge tests.
- [ ] Run production build (`npm run build`).
- [ ] Push branch and require Netlify preview `ready` with no deploy error before merge.
- [ ] Merge only after verification and verify the exact production SHA on Netlify.
