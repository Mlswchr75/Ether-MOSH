/**
 * Drift Field — the gradient+blob field Forge already had, folded into the
 * generator roster unchanged as one voice among several. drawSeamless is
 * already a pure function of (seed, t), so this generator carries no
 * persistent state of its own.
 */
import { drawSeamless } from "../seamlessSource";
import { defineGenerator } from "../forgeGenerators";

export const DRIFT_FIELD = defineGenerator<Record<string, never>>({
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
});
