/**
 * Reference implementation of the PostChain color grade, in TypeScript.
 *
 * This mirrors the GLSL grade in `shaders.ts` exactly so the behavior can be
 * unit-tested on the CPU (GLSL can't be). Its most important job is to lock in
 * the invariant we kept regressing on in the app: **at default params the grade
 * must not darken the image.** See `color.test.ts`.
 *
 * All values are linear-ish 0..1 RGB; the final linear->sRGB encode happens in
 * the shader's output stage and is intentionally NOT part of the grade math
 * here (encoding twice is exactly what caused the "too much black" regression).
 */

import type { PostChainParams } from "./PostChain.js";

const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;

export type RGB = [number, number, number];

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const luma = ([r, g, b]: RGB): number => r * LUMA.r + g * LUMA.g + b * LUMA.b;

/** Saturation around luminance. 1 = identity, >1 more saturated. */
export function saturate(rgb: RGB, s: number): RGB {
  const l = luma(rgb);
  return [l + (rgb[0] - l) * s, l + (rgb[1] - l) * s, l + (rgb[2] - l) * s];
}

/** Vibrance: pushes already-dull pixels harder than saturated ones. */
export function vibrance(rgb: RGB, amount: number): RGB {
  const mx = Math.max(rgb[0], rgb[1], rgb[2]);
  const mn = Math.min(rgb[0], rgb[1], rgb[2]);
  const sat = mx - mn;
  return saturate(rgb, 1 + amount * (1 - sat));
}

/** Symmetric contrast around 0.5. c = 1 is identity. */
export function contrast(rgb: RGB, c: number): RGB {
  return [
    clamp01((rgb[0] - 0.5) * c + 0.5),
    clamp01((rgb[1] - 0.5) * c + 0.5),
    clamp01((rgb[2] - 0.5) * c + 0.5),
  ];
}

/**
 * The full default grade, minus the GPU-only bits (CAS neighborhood sampling,
 * bloom texture, animated grain) which can't run on a single CPU pixel. Those
 * are all *additive/neutral* by design and never darken. This covers the parts
 * that historically caused darkening: saturation, vibrance, contrast, vignette,
 * tone-map, and the blend-with-original.
 */
export function gradePixel(
  color: RGB,
  original: RGB,
  params: PostChainParams,
  vignetteFactor = 1, // 1 at center, <1 toward corners; 1 means "no vignette here"
): RGB {
  let c: RGB = [color[0], color[1], color[2]];

  c = saturate(c, params.saturation);
  c = vibrance(c, params.vibrance);
  c = contrast(c, params.contrast);

  // Vignette darkens toward corners; at default strength 0 it is a no-op.
  const vig = 1 - params.vignette * (1 - vignetteFactor);
  c = [c[0] * vig, c[1] * vig, c[2] * vig];

  // Tone-map is a blend toward a filmic curve; at default 0 it is a no-op.
  if (params.toneMap > 0) {
    const filmic = c.map(aces) as RGB;
    c = [
      c[0] + (filmic[0] - c[0]) * params.toneMap,
      c[1] + (filmic[1] - c[1]) * params.toneMap,
      c[2] + (filmic[2] - c[2]) * params.toneMap,
    ];
  }

  // Blend with the untouched original so true color/detail always shows through.
  const m = params.mix;
  return [
    clamp01(original[0] + (c[0] - original[0]) * m),
    clamp01(original[1] + (c[1] - original[1]) * m),
    clamp01(original[2] + (c[2] - original[2]) * m),
  ];
}

/** Narkowski/ACES-ish filmic approximation, per channel. */
function aces(x: number): number {
  const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp01((x * (a * x + b)) / (x * (c * x + d) + e));
}

export { luma };
