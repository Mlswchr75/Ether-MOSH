/**
 * Seamless tiling — which effects survive it, and proof that a result did.
 *
 * A pattern tiles seamlessly when the pixels at u=0 match the pixels at u=1
 * (and likewise top to bottom). That holds only if every operation in the chain
 * is translation-invariant modulo one tile. Three things break it:
 *
 *   CLAMPED SAMPLING — an effect that clamps its sample coordinate into [0,1]
 *     ignores wrap-around, so the edge smears instead of continuing.
 *   CENTRE-RELATIVE GEOMETRY — anything built on `vUv - 0.5` has a middle, and
 *     a middle is by definition not repeatable. Radial blurs, vignettes and
 *     zooms all put a visible focal point in every tile.
 *   CAMERA-DERIVED DATA — depth, optical flow and frame history describe a live
 *     camera. Against a generated source they are meaningless, and they carry
 *     no periodicity.
 *
 * Classification is derived from the shader body rather than hand-maintained,
 * so a new effect is judged automatically. But classification is a heuristic,
 * and the output is what actually matters — so `seamScore` measures the real
 * thing, and the generator verifies rather than trusts.
 */
import { EFFECTS, EFFECTS_BY_ID, type EffectDef } from "./effects";

export type TileVerdict = {
  safe: boolean;
  /** Why it was rejected — surfaced in the UI so the rule is legible. */
  reason?: "clamped" | "radial" | "camera" | "unknown-effect";
};

/** Everything after `void main(){` — the shared header declares things every
 *  effect would otherwise appear to use. */
function body(def: EffectDef): string {
  const at = def.frag.indexOf("void main(){");
  return at >= 0 ? def.frag.slice(at) : def.frag;
}

export function tileVerdict(effectId: string): TileVerdict {
  const def = EFFECTS_BY_ID[effectId];
  if (!def) return { safe: false, reason: "unknown-effect" };
  const src = body(def);

  // Camera-derived: no meaning against a procedural source, and not periodic.
  if (/\b(depthAt|flowAt|timeAt)\s*\(/.test(src) || /\buFeedback\b/.test(src)) {
    return { safe: false, reason: "camera" };
  }

  // Clamped sampling defeats wrap-around at the seam.
  if (/clamp\s*\([^;]*\b(uv|vUv)\b/.test(src) || /texture2D\s*\(\s*uTex\s*,\s*clamp/.test(src)) {
    return { safe: false, reason: "clamped" };
  }

  // Centre-relative geometry gives every tile a visible middle. Written as a
  // subtraction (`vUv - 0.5`), as a distance (`distance(vUv, vec2(0.5))`) or
  // via a precomputed `rel` — all three appear in the library.
  if (
    /\b(vUv|uv)\s*-\s*(vec2\s*\(\s*)?0\.5/.test(src) ||
    /\bdistance\s*\(\s*(vUv|uv)\b/.test(src) ||
    /\blength\s*\(\s*rel\b/.test(src) ||
    /\bvec2\s*\(\s*0\.5\s*[,)]/.test(src)
  ) {
    return { safe: false, reason: "radial" };
  }

  return { safe: true };
}

/** Every effect that can appear in a seamless pattern. */
export function tileSafeEffects(): string[] {
  return EFFECTS.filter(e => tileVerdict(e.id).safe).map(e => e.id);
}

export type SeamScore = {
  /** 0..1, 1 = the left and right edges match exactly. */
  horizontal: number;
  /** 0..1, 1 = the top and bottom edges match exactly. */
  vertical: number;
  /** The weaker of the two — what actually decides whether a tile passes. */
  worst: number;
};

/**
 * Measure how well an image tiles, by comparing the pixels that would meet if
 * it were repeated.
 *
 * This is the ground truth the classifier only approximates. Comparing against
 * the *second* row/column rather than only the first also catches the case
 * where edges match but the gradient across the seam does not, which reads as a
 * visible line even when the pixels themselves are identical.
 */
export function seamScore(data: Uint8ClampedArray, w: number, h: number): SeamScore {
  if (w < 8 || h < 8 || data.length < w * h * 4) {
    return { horizontal: 0, vertical: 0, worst: 0 };
  }
  const at = (x: number, y: number) => (y * w + x) * 4;
  const chanDiff = (a: number, b: number) =>
    Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);

  /* Measured against the interior, not against zero.
     In a correctly tiling image the last column and the first column are
     ADJACENT samples, not duplicates — they should differ by about as much as
     any neighbouring pair inside the image. Demanding they be identical would
     fail every pattern that actually varies, which is all of them. What marks a
     real seam is the join differing by much MORE than the local texture does. */
  const meanCol = (f: (y: number) => number) => {
    let t = 0;
    for (let y = 0; y < h; y++) t += f(y);
    return t / h;
  };
  const meanRow = (f: (x: number) => number) => {
    let t = 0;
    for (let x = 0; x < w; x++) t += f(x);
    return t / w;
  };

  const hSeam = meanCol(y => chanDiff(at(w - 1, y), at(0, y)));
  const vSeam = meanRow(x => chanDiff(at(x, h - 1), at(x, 0)));

  /* Baseline taken from the columns either side of the join, not from the whole
     image. A seam is a question about LOCAL continuity: does the join look like
     the texture right next to it? Averaging the gradient across the entire
     image gets this wrong whenever the pattern happens to be steepest at the
     edge — the join is then correctly continuous but scores badly for sitting
     on a busy part of the design. */
  const hBase = (
    meanCol(y => chanDiff(at(0, y), at(1, y))) +
    meanCol(y => chanDiff(at(w - 2, y), at(w - 1, y)))
  ) / 2;
  const vBase = (
    meanRow(x => chanDiff(at(x, 0), at(x, 1))) +
    meanRow(x => chanDiff(at(x, h - 2), at(x, h - 1)))
  ) / 2;

  /* Ratio, not difference.

     A seamless tile has seam ≈ baseline, so the honest question is "how many
     times the local texture does the join jump?" — ratio 1 is perfect, and a
     linear gradient (interior step ~4, seam ~250) lands around 60. Scoring on
     raw difference instead would penalise every high-contrast pattern for being
     high-contrast, which has nothing to do with whether it tiles.

     The floor stops a perfectly flat image, whose baseline is zero, from
     dividing by nothing and reporting a seam that is not there. */
  const score = (seam: number, base: number) => {
    const ratio = seam / Math.max(base, 4);
    return Math.max(0, Math.min(1, 1 - Math.max(0, ratio - 1) / 3));
  };

  const horizontal = score(hSeam, hBase);
  const vertical = score(vSeam, vBase);
  return { horizontal, vertical, worst: Math.min(horizontal, vertical) };
}

/**
 * Threshold for "this will print without a visible seam".
 *
 * Not 1.0: dithering, mediump precision and PNG quantisation all put a little
 * noise across the join, and demanding perfection would reject patterns that
 * are visually flawless on fabric.
 */
export const SEAM_PASS = 0.97;

export const seamPasses = (s: SeamScore) => s.worst >= SEAM_PASS;
