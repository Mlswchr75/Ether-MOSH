import { describe, expect, it } from "vitest";
import { evalModulator } from "./modulators";

const RAW_TYPES = ["sine", "triangle", "saw", "perlin", "random"] as const;

describe("evalModulator", () => {
  it("keeps every raw waveform within -1..1 before offset/depth scaling", () => {
    // depth=1, offset=0 isolates the raw waveform value itself.
    for (const type of RAW_TYPES) {
      for (let t = -5; t <= 5; t += 0.1) {
        const v = evalModulator(type, t, 1, 1, 0, 0);
        expect(v).toBeGreaterThanOrEqual(-1.0001);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("random does not need — and must not get — the *2-1 rescale used by the other modulators", () => {
    // Regression: `Math.sin(...) * 2 - 1` pushed an already -1..1 value out
    // to -3..1, heavily biased negative, since Math.sin is already -1..1.
    for (let t = 0; t < 50; t++) {
      const v = evalModulator("random", t, 1, 1, 0, 0);
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });

  it("triangle keeps oscillating instead of pinning to an extreme when t goes negative (reverse-time)", () => {
    // Regression: JS's `%` returns (-1, 0] for negative input, which the
    // triangle formula always resolved to its f*4-1 arm — a constant value
    // in [-5,-1] instead of an oscillation.
    const samples: number[] = [];
    for (let t = -4; t <= 0; t += 0.05) {
      const v = evalModulator("triangle", t, 1, 1, 0, 0);
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
      samples.push(v);
    }
    // A genuine oscillation visits both a high and a low part of its range,
    // not just one corner.
    expect(Math.max(...samples)).toBeGreaterThan(0.5);
    expect(Math.min(...samples)).toBeLessThan(-0.5);
  });

  it("saw keeps oscillating for negative t the same way", () => {
    const samples: number[] = [];
    for (let t = -4; t <= 0; t += 0.05) {
      const v = evalModulator("saw", t, 1, 1, 0, 0);
      expect(v).toBeGreaterThanOrEqual(-1.0001);
      expect(v).toBeLessThanOrEqual(1.0001);
      samples.push(v);
    }
    expect(Math.max(...samples)).toBeGreaterThan(0.5);
    expect(Math.min(...samples)).toBeLessThan(-0.5);
  });

  it("applies offset and depth around the raw waveform", () => {
    expect(evalModulator("beat", 0, 1, 2, 5, 1)).toBeCloseTo(5 + 1 * 2, 5);
    expect(evalModulator("beat", 0, 1, 2, 5, 0)).toBeCloseTo(5 + -1 * 2, 5);
  });
});
