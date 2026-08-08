/**
 * Regression guard for the "too much black / too dark" bug.
 *
 * The app kept reintroducing darkening whenever the post pipeline changed
 * (ACES on LDR content, double gamma, vignette on by default, HDR target
 * encode). These tests pin the invariant in code: at default params the grade
 * must preserve brightness, and the darkening knobs must be off by default.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_POST_PARAMS } from "./PostChain.js";
import { gradePixel, luma, saturate, type RGB } from "./color.js";

const GRAYS: RGB[] = [
  [0.05, 0.05, 0.05],
  [0.25, 0.25, 0.25],
  [0.5, 0.5, 0.5],
  [0.75, 0.75, 0.75],
];

describe("PostChain grade — anti-darkening invariants", () => {
  it("does not CRUSH grays at default params (the actual bug)", () => {
    // The historical regression (ACES-on-LDR / double-gamma / HDR misencode)
    // crushed everything 40-60% toward black. A gentle contrast curve dipping
    // deep shadows a few % is fine and intended. Guard against real crushing:
    // no gray may lose more than 20% of its brightness at center.
    for (const g of GRAYS) {
      const out = gradePixel(g, g, DEFAULT_POST_PARAMS, 1);
      expect(luma(out)).toBeGreaterThanOrEqual(luma(g) * 0.8);
    }
  });

  it("preserves mid-gray brightness at default params", () => {
    // 0.5 is the contrast pivot, so it must pass through essentially untouched —
    // this is the value the crush bugs slammed hardest.
    const mid: RGB = [0.5, 0.5, 0.5];
    const out = gradePixel(mid, mid, DEFAULT_POST_PARAMS, 1);
    expect(luma(out)).toBeCloseTo(0.5, 2);
  });

  it("ships with the darkening knobs OFF by default", () => {
    expect(DEFAULT_POST_PARAMS.vignette).toBe(0);
    expect(DEFAULT_POST_PARAMS.toneMap).toBe(0);
  });

  it("vignette default (0) does not darken corners", () => {
    const g: RGB = [0.5, 0.5, 0.5];
    const corner = gradePixel(g, g, DEFAULT_POST_PARAMS, 0 /* full corner */);
    expect(luma(corner)).toBeCloseTo(luma(g), 5);
  });

  it("blend-with-original keeps output tethered to the true image", () => {
    // A wildly boosted color still can't stray more than (1 - mix) from source.
    const original: RGB = [0.4, 0.2, 0.1];
    const out = gradePixel([1, 1, 1], original, DEFAULT_POST_PARAMS, 1);
    for (let i = 0; i < 3; i++) {
      // With mix=0.5, output can drift at most (1 - mix) from the source.
      const maxDrift = 1 - DEFAULT_POST_PARAMS.mix + 1e-6;
      expect(Math.abs(out[i] - original[i])).toBeLessThanOrEqual(maxDrift);
    }
  });

  it("saturation > 1 actually increases channel spread on a colored pixel", () => {
    const c: RGB = [0.6, 0.4, 0.2];
    const before = Math.max(...c) - Math.min(...c);
    const s = saturate(c, 1.3);
    const after = Math.max(...s) - Math.min(...s);
    expect(after).toBeGreaterThan(before);
  });
});
