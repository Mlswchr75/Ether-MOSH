# Sticker Forge Design

## Goal
Turn any selected/captured Ether-MOSH subject into a reusable transparent animated sticker, choosing the highest-quality Lottie representation the source can support without forcing poor vectorization.

## Product model
Sticker Forge has one quick entry point (`Make Sticker`) and a deeper Forge workflow:

`Select / Detect -> Isolate -> Refine -> Animate -> Forge -> Vault / Scene / Download`

### Tier A — Universal Lottie
For photographs, complex collage art, noisy imagery, or sources with too much contour/color complexity for useful tracing. Preserve the transparent isolated raster as an embedded Lottie image asset and animate it with native Lottie transform/opacity keyframes. This is the reliable default and must remain visually faithful.

### Tier B — Vector Lottie
For clean logos, icons, illustrations, symbols, silhouettes, and low-complexity graphic art. Analyze the isolated subject, score vector suitability, trace significant regions/contours, simplify paths, and emit Lottie shape layers. Vector mode is offered automatically only above a quality threshold; users may override the recommendation.

## Quality policy
- Never label raster-backed Lottie as vector.
- Never force vectorization when it materially degrades the source.
- Preserve alpha throughout the pipeline; no generated background layer.
- Prefer a faithful raster-backed Lottie over pathological thousands-of-points vector output.
- Keep outputs self-contained where practical so Vault/download assets do not depend on transient blob URLs.

## Motion system
Initial motion presets: Float, Pulse, Wobble, Bounce, Spin, Flicker. Extend with Breathe, Orbit, Jitter, Glitch, and Melt after the core pipeline is stable. Motion is represented with native Lottie keyframes and may later be mapped to Ether-MOSH REACT controls at playback time.

## Suitability scoring
Vector suitability is a deterministic 0..1 score derived from alpha occupancy, edge density, approximate color complexity, and contour complexity. Clean subjects score higher. A score >= 0.72 recommends Vector Lottie; lower scores recommend Universal Lottie. Scoring is advisory and never blocks either explicit user choice.

## Vectorization boundaries
The first vector implementation targets silhouette/flat-region artwork. It should produce a bounded number of simplified paths and reject output exceeding complexity budgets. Multipart semantic reconstruction (eyes/arms/letters/etc.) is a later enhancement built on the same vector layer model, not a prerequisite for first release.

## UI
Keep the default Sticker Mode compact. `Make Sticker` remains a one-tap save. `Forge` opens advanced controls for output type (Auto / Universal / Vector), motion preset, preview, and refinement. The UI displays `Recommended: Vector` or `Recommended: Universal` with a concise quality reason.

## Persistence and export
Forged assets are immediately placed in the Overlay scene, persisted in the existing IndexedDB Sticker Vault, and downloadable as `.json` Lottie. Existing Vault favorites/names/tags/search remain the canonical library metadata.

## Performance
All analysis/vectorization runs on demand, never continuously during rendering. Cap source analysis resolution and path count for mobile. Existing overlay runtime budgets remain authoritative for playback/swarm/tracking.

## Testing / release gate
Unit-test Lottie transparency, keyframe structure, suitability scoring, complexity rejection, and vector path output. Require a successful Netlify preview build before merge. Keep production isolated until preview verification is green.
