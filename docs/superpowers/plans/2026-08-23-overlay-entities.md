# Overlay Entities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve Sticker Mode into a universal animated overlay engine with Lottie support and extensible behavior/reactivity/tracking.

**Architecture:** OverlayEntity is the stable scene primitive; asset ingestion normalizes supported files into entity assets, while rendering and high-frequency playback remain isolated from React store churn. Existing StickerCapture feeds the same entity/vault pipeline.

**Tech Stack:** React, TypeScript, Zustand, WebGL/canvas, existing Ether-MOSH audio/segmentation engines, dotlottie-web.

**Spec:** `docs/superpowers/specs/2026-08-23-overlay-entities-design.md`

## Global Constraints
- Preserve existing StickerCapture behavior and gallery compatibility during migration.
- Initial formats: PNG, WebP, GIF, SVG, Lottie JSON, .lottie.
- Internal name: OverlayEntity; user-facing label remains Stickers.
- High-frequency animation state must not cause per-frame global Zustand updates.
- Features must work across upload, camera and Forge sources.

---

### Task 1: Overlay domain model and store
**Files:** Modify `src/store/types.ts`, `src/store/useStore.ts`; create `src/engine/overlay/types.ts` and tests.
**Produces:** typed OverlayAsset, OverlayEntity, OverlayTransform, OverlayPlayback, OverlayBehavior, OverlayReaction and OverlayTrackingBinding; CRUD/reorder/select actions.
- [ ] Write failing tests for entity defaults, duplication, reorder and StickerEntry migration.
- [ ] Run focused tests and confirm failure.
- [ ] Implement minimal typed model and store actions while retaining stickerGallery.
- [ ] Run focused tests and full typecheck/test suite.
- [ ] Commit `feat: add overlay entity model`.

### Task 2: Asset ingestion
**Files:** Create `src/engine/overlay/importOverlay.ts`, tests; add UI importer under `src/components/editor/`.
**Produces:** `importOverlayFile(file: File): Promise<OverlayAsset>` and input accepting PNG/WebP/GIF/SVG/JSON/.lottie.
- [ ] Write failing MIME/extension classification and rejection tests.
- [ ] Implement normalization, object-URL lifecycle metadata and Lottie JSON validation.
- [ ] Add browse/drop/paste entry points that instantiate an entity.
- [ ] Verify invalid files surface a user-readable error without altering scene state.
- [ ] Commit `feat: import overlay assets`.

### Task 3: Interactive overlay stage
**Files:** Create `OverlayStage.tsx`, `OverlayEntityView.tsx`, transform helpers/tests; modify editor composition point.
**Produces:** visible entities with selection, drag, pinch/scale, rotation, opacity, duplicate/delete and z-order.
- [ ] Test transform math independently of DOM gestures.
- [ ] Render static raster/SVG/GIF/WebP assets after global FX.
- [ ] Add pointer/touch selection and transforms with local transient gesture state.
- [ ] Add contextual controls and keyboard-safe delete/duplicate actions.
- [ ] Verify camera/upload/Forge and mobile pointer flows.
- [ ] Commit `feat: add interactive overlay stage`.

### Task 4: Lottie runtime
**Files:** Modify package manifests; create `LottieOverlay.tsx` and lifecycle tests.
**Produces:** JSON/.lottie rendering with play, pause, loop, speed, direction and segment support.
- [ ] Add dotlottie-web dependency.
- [ ] Write lifecycle tests for mount/update/unmount and playback property changes.
- [ ] Implement one renderer wrapper with cleanup and visibility pause.
- [ ] Route Lottie assets through it in OverlayEntityView.
- [ ] Verify multiple simultaneous animations and resize behavior.
- [ ] Commit `feat: add lottie overlays`.

### Task 5: Compositing and independent FX contract
**Files:** Overlay model/stage plus renderer bridge.
**Produces:** `before-fx | after-fx | own-fx`, blend mode and per-entity FX stack contract.
- [ ] Test stage ordering and blend serialization.
- [ ] Implement before/after render surfaces without duplicating entity state.
- [ ] Add own-FX stack bridge using existing Layer semantics.
- [ ] Verify hidden/locked/opacity/blend behavior.
- [ ] Commit `feat: add overlay compositing modes`.

### Task 6: Behavior engine
**Files:** Create `src/engine/overlay/behaviors.ts` and tests; add controls.
**Produces:** pure `sampleBehavior(entity, time, viewport)` transform delta for none/float/pulse/wobble/orbit/bounce/flicker/jitter/random-walk.
- [ ] Write deterministic sampling tests.
- [ ] Implement pure behavior functions with seeded variation.
- [ ] Apply deltas in render loop without Zustand frame writes.
- [ ] Add Behavior selector.
- [ ] Commit `feat: add overlay behaviors`.

### Task 7: Audio/beat reactivity
**Files:** Overlay reaction engine/tests and controls; reuse current analyzer values.
**Produces:** mappings from bass/mid/treble/overall/beat to scale/rotation/opacity/playbackSpeed/playbackPosition.
- [ ] Test mapping, smoothing, inversion and clamping.
- [ ] Implement reaction sampler using existing audio state source.
- [ ] Add REACT control surface.
- [ ] Verify beat restart and continuous mappings.
- [ ] Commit `feat: add reactive overlays`.

### Task 8: Tracking bindings
**Files:** Overlay tracking adapter/tests; segmentation/Journey integration points.
**Produces:** normalized tracked target transform consumed by overlay renderer.
- [ ] Test normalized target-to-overlay transform mapping and lost-target behavior.
- [ ] Implement adapter for hand/face/person/object/Journey targets.
- [ ] Add TRACK selector and graceful fallback to last/free position.
- [ ] Verify moving live-camera targets do not trigger React rerender storms.
- [ ] Commit `feat: add tracked overlays`.

### Task 9: Swarm
**Files:** Swarm renderer/model tests and controls.
**Produces:** bounded instances sharing one asset/runtime source with seeded transform/phase offsets.
- [ ] Test deterministic instance generation and hard performance cap.
- [ ] Implement shared-source swarm rendering.
- [ ] Add count/spread/chaos controls.
- [ ] Verify automatic instance reduction under performance budget.
- [ ] Commit `feat: add overlay swarm`.

### Task 10: Vault and Make Sticker
**Files:** Vault persistence module/tests, StickerCapture integration, extraction entry points, Vault UI.
**Produces:** reusable OverlayAsset records persisted independently from scene entities.
- [ ] Test persistence/version migration and object URL restoration strategy.
- [ ] Implement Vault add/remove/star/instantiate.
- [ ] Route new StickerCapture output through Vault-compatible assets while retaining downloads.
- [ ] Add MAKE STICKER entry point for extracted subjects.
- [ ] Commit `feat: add sticker vault`.

### Task 11: Static-to-animate and QA
**Files:** preset definitions/tests, UI polish, integration tests.
**Produces:** one-tap Float/Pulse/Wobble/Orbit/Jitter/Melt-like motion presets built from behavior/FX contracts.
- [ ] Test preset-to-entity configuration.
- [ ] Add presets without a second animation system.
- [ ] Run typecheck, unit tests and production build.
- [ ] Manually verify upload/camera/Forge, touch gestures, GIF/WebP/SVG/Lottie, capture-to-overlay, reactivity and tracking.
- [ ] Commit `feat: finish overlay forge upgrade`.