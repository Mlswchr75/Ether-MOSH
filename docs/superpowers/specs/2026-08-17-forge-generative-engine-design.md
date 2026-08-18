# Forge Generative Engine — Phase 1: Generator Core

## Background

Forge mode currently generates its source imagery with a single function,
`drawSeamless()`: a trig-based gradient field plus a handful of radial-gradient
blobs. It's cheap, deterministic, and seamlessly tileable — but it's one
visual idea. The rest of MOSH (105 GPU effects, the Journey director's
Smart+Storm orchestration, beat-reactive parameters) is built to operate on
*whatever* source texture it's handed, and today that source is thin relative
to everything downstream of it.

The goal: make Forge something live performers, musicians, and visual artists
find genuinely necessary — not a background pattern generator, but an
instrument that invents its own moving, reacting, visually stunning imagery
from nothing, the way a lava lamp does, but with the range digital generation
allows that a lava lamp doesn't have.

This is a three-phase project. **This spec covers Phase 1 only** — the
generator core. Phases 2 (seamless-tileable export) and 3 (tenfold-improved
image-upload with personalized self-learning) depend on Phase 1's generator
architecture existing and will get their own specs once this ships.

## Visual language reference

Derived from ten reference images (the user's own art/style references) plus
their SVG library naming conventions, then confirmed by the user ranking the
extracted motifs. In priority order:

1. **Volumetric glow against void** (north star) — a lit, dimensional,
   translucent organic form, not a flat texture. The "hyper-realistic crisp
   form" bar the whole engine is measured against.
2. **Cellular fracture / shatter** — living Voronoi-like structure, cracks
   and cells drifting and pulsing rather than static.
3. **Organic cell-boundary blending** ("acrylic pour," not gravity-drip) —
   soft merging color cells, ink-in-water / marbling boundary character.
4. **Kaleidoscope / mandala symmetry** — radial mirror structure imposed on
   top of chaotic color; order emerging from noise.
5. *(baseline traits, present everywhere rather than standalone techniques)*
   — full-spectrum color (never a restrained 2-3 color palette) and
   edge-to-edge density (no resting negative space).

## Requirements

- **Replace** Forge's generator (not a new parallel mode) — but the existing
  gradient/blob field must remain part of the design language as one voice
  among several, not be deleted.
- Vast variety of distinct generative "voices," all continuously moving and
  audio-reactive — "an ever-evolving lava lamp, but more, given the digital
  medium."
- Every one of the 105 GPU effects available to Forge's shuffle — **already
  satisfied**: `composeForgeStack` draws from the live effect registry, not a
  curated subset. No work needed here.
- Must run *excellently* on both desktop and mobile — not desktop-first with
  mobile as a degraded afterthought.
- No obvious quality gap between the GPU-native volumetric generator and the
  Canvas2D ones; they should read as one cohesive visual language and blend
  into each other on shuffle, not jump-cut.
- Seamless-tileable export ("truly perfect... from the current visualizer,"
  off by default) — **deferred to Phase 2**. The mechanism already exists in
  miniature: `tileSafety.ts` statically analyzes shader source to classify
  which of the 105 effects survive tiling, and `composeForgeStack` already
  restricts its pool to that classification when `forge.seamless` is on.
  Phase 2 extends the same classification approach to the new generators.
- Tenfold-improved image-upload, including a personalized self-learning
  system scoped to the user's own account (myleswhitcher@gmail.com) that
  adapts based on their uploads and interaction — **deferred to Phase 3**.
  Explicitly flagged during brainstorming that "self-learning" spans a wide
  implementation range (lightweight client-side preference-weighting vs. an
  actual trained model requiring new backend infrastructure) and that range
  needs its own scoping pass before Phase 3 design begins.

## Architecture

A new `ForgeGenerator` type, structured like the existing `EffectDef`: `id`,
`name`, `category`, `blurb`, a `costTier` of `"cheap" | "moderate" | "heavy"`
(only Volumetric Bloom is expected to land in `"heavy"`), registered in a new
`forgeGenerators.ts` mirroring `effects.ts`'s `EFFECTS_BY_ID` pattern.

Each generator's persistent state (particle positions, cell growth radii,
drift offsets — see below) lives as generator-internal mutable state, the
same way `MoshingBackdrop` already keeps its render-loop state in closures
rather than in the Zustand store. Only the *selection* (which generator is
active, transition progress) belongs in `forge` state; the moment-to-moment
simulation data does not need to be observable/serializable and shouldn't
trigger React re-renders as it evolves.

Two implementation shapes, per the chosen hybrid approach (Canvas2D for
everything naturally 2D/procedural, GPU only where the payoff justifies it):

- **Canvas2D generators** draw directly into the source canvas, same call
  shape as today's `drawSeamless`, but each carries a *persistent state
  object* that evolves frame-to-frame (particle positions, cell growth radii,
  drift offsets) rather than being recomputed from scratch each frame the way
  the current field is. This statefulness is what produces genuine evolution
  rather than a pattern that merely moves without changing.
- **Volumetric Bloom** (the one GPU-native generator) is a small sibling
  renderer next to the main `MoshRenderer`, rendering raymarched SDF form to
  an offscreen canvas each frame, composited into the source canvas the same
  way Forge already composites a base photo today.

**Kaleidoscope is a modifier, not a generator** — an optional post-step that
mirror-folds any generator's output into radial symmetry (render into an
offscreen wedge, stamp rotated/mirrored copies back). This multiplies variety
cheaply: every other generator can optionally appear in its kaleidoscope
variant too.

**Visual cohesion across generators** (addressing the "no obvious quality
gap" requirement):
- A mandatory **shared finishing pass** runs on every generator's output
  before it reaches the effect stack — consistent glow/bloom/tone treatment
  regardless of which voice produced the frame.
- Canvas2D generators use offset-highlight gradients and soft inner glow (a
  simulated light source) rather than flat fills, so they read as lit
  dimensional forms in the same visual language as the volumetric one.
- Generator swaps **crossfade rather than hard-cut** — both outgoing and
  incoming generators render and blend (a dissolve, not a plain fade) over a
  transition window, so one form genuinely melts into the next. This also
  means Volumetric Bloom's glow is often physically present in-frame while a
  Canvas2D generator blends in behind it — direct visual influence from #1
  onto the other voices, not just a shared post-process.

## Components — initial roster

1. **Volumetric Bloom** (WebGL raymarch) — lit, glowing, continuously
   morphing form against near-black. The north star.
2. **Shatter Field** (Canvas2D, cellular fracture) — living Voronoi
   tessellation, cells drifting and cracking over time.
3. **Pour Bloom** (Canvas2D, metaball/organic blend) — soft merging color
   cells with ink-in-water boundary blending.
4. **Kaleidoscope** — the symmetry modifier, wrappable around any of the
   above.
5. **Drift Field** — today's gradient+blob field, folded in unchanged as one
   voice among five.

More voices can be added later by registering them the same way; this roster
is what's validated by the user's own ranking, not an attempt to cover every
possible technique in one pass.

## Data flow

`GlCanvas`'s existing render loop calls `paintForgeSource` each tick, as
today. It looks up the active generator (and, mid-transition, the outgoing
one too, rendering and blending both), calls it with its persistent state and
current audio features, applies the kaleidoscope modifier if the current
shuffle rolled it active, runs the shared finishing pass, then — unchanged —
optionally composites a base photo and hands the result to the GPU as the
source texture. The existing 105-effect stack and Journey director consume it
exactly as they do today; neither needs to change.

Shuffle/reseed (`randomiseForge` / `reseedForge`) is extended to also pick a
new active generator *and* whether kaleidoscope wraps it, reusing the
weighted-draw/category-bias machinery `forgeCompose.ts` already has for
effect selection, and to kick off a crossfade transition instead of a hard
swap. Kaleidoscope is chosen the same probabilistic way generators
themselves are — this phase doesn't add a manual on/off control for it;
that's a UI-layer decision that can follow once the generator core exists.

Audio-reactivity upgrades from the current `{ treble, beat }` pair to the
richer `AudioFeatures` already computed in `journeyCore.ts` (tempo,
regularity, brightness, weight, density, dynamics) — reused, not
reimplemented — so generators can react more expressively (e.g., fracture
rate tied to onset density, volumetric "breathing" tied to dynamics/energy).

## Performance

The device-adaptive-quality mechanism already shipping in
`MoshingBackdrop.tsx` — measure real per-frame render cost, step down
resolution/target-fps/complexity when a device struggles, seeded by an
initial guess from `navigator.hardwareConcurrency` — is reused rather than
reinvented. Volumetric Bloom's raymarch step count and render scale start
conservative on lower-tier devices and back off further under measured load;
Canvas2D generators cap particle/cell counts by the same tier signal. One
performance budget, one proven mechanism, extended to cover the new
generators.

## Error handling

Volumetric Bloom's WebGL context creation is wrapped in try/catch matching
`MoshingBackdrop`'s existing pattern; on failure or context loss it falls
back to a different generator rather than freezing or blanking the screen.
Canvas2D generators are caught per-generator — a bug in one technique logs
once and temporarily drops that generator from the shuffle pool rather than
taking down the whole session. A crossfade interrupted by a manual reseed
collapses cleanly to the new target instead of leaving a stuck blend.

## Testing

Follows the pattern already set by `forgeCompose.test.ts` and
`tileSafety.test.ts`: unit tests for generator-selection weighting (category
bias honored, nothing locked to zero probability), seeded-determinism tests
per Canvas2D generator (same seed + state history → same output), and a
smoke test that Volumetric Bloom initializes and renders without throwing,
plus that context loss triggers its fallback path. Live browser verification
(screenshots across multiple seeds, generators, and transitions) is part of
implementation, since "does it look stunning" isn't something a unit test can
answer.

## Explicitly deferred (not in this phase)

- Seamless-tileable classification and export capture for the new
  generators (Phase 2).
- Tenfold-improved image-upload integration and the personalized
  self-learning system (Phase 3) — mechanism spectrum (lightweight
  client-side preference-weighting vs. a trained model requiring backend
  infrastructure) still needs its own scoping conversation before that
  phase's design begins.
- Additional generator voices beyond the five above — the registry pattern
  supports adding more later without architectural change.
