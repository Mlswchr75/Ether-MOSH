/**
 * Drift Field — the gradient+blob field Forge already had, folded into the
 * generator roster unchanged as one voice among several. drawSeamless is
 * already a pure function of (seed, t), so this generator carries no
 * persistent state of its own.
 *
 * NOTE: forgeGenerators.ts imports DRIFT_FIELD (a value) to build its
 * GENERATORS array, so this module deliberately avoids any *value* import
 * back from forgeGenerators.ts — that would form a runtime import cycle.
 * When something (e.g. this file's own test) evaluates driftField.ts before
 * forgeGenerators.ts, the cycle resolves with DRIFT_FIELD still undefined
 * inside forgeGenerators.ts at the moment GENERATORS/GENERATORS_BY_ID are
 * built, breaking the registry. `defineGenerator` is a pure type-cast with
 * no runtime behavior, so only its *type* is needed here — a type-only
 * import is erased at compile time and doesn't create a runtime edge.
 */
import { drawSeamless } from "../seamlessSource";
import type { Canvas2DForgeGenerator } from "../forgeGenerators";

export const DRIFT_FIELD: Canvas2DForgeGenerator = {
  id: "driftField",
  name: "Drift Field",
  category: "field",
  blurb: "Slowly shifting gradient waves with soft radial highlights.",
  costTier: "cheap",
  kind: "canvas2d",
  createState: () => ({}),
  render: (gctx) => {
    drawSeamless(gctx.ctx, gctx.w, gctx.h, {
      colors: gctx.palette,
      seed: gctx.seed,
      t: gctx.t,
      complexity: Math.min(6, 2 + Math.round(gctx.intensity * 4 + gctx.audio.treble * 2)),
    });
  },
};
