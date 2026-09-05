import { describe, expect, it } from "vitest";
import { hexToOklch, oklchToHex, hueDelta } from "./oklch";

/** Max per-channel deviation tolerated on a round-trip through OKLCH and
 *  back — gamut-edge colors lose a little precision from the chroma-clamp
 *  loop's step size, everything else should be near-exact. */
const CHANNEL_TOLERANCE = 3;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe("oklch", () => {
  it("round-trips a spread of real hexes (including this app's own palette hues) within a small tolerance", () => {
    const hexes = [
      "#FF1F8F", "#00FFB2", "#1A0033", "#C0C0C0", "#4488FF", "#0A0A14",
      "#FF4500", "#FF00CC", "#050510", "#00BFFF", "#7700FF", "#000A1A",
      "#E6A817", "#6F3B18", "#140D08", "#A8C256", "#315C3A", "#07120B",
      "#FFFFFF", "#000000", "#808080", "#FF0000", "#00FF00", "#0000FF",
    ];
    for (const hex of hexes) {
      const [r0, g0, b0] = hexToRgb(hex);
      const roundTripped = oklchToHex(hexToOklch(hex));
      const [r1, g1, b1] = hexToRgb(roundTripped);
      expect(Math.abs(r0 - r1), `${hex} -> ${roundTripped} (R)`).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      expect(Math.abs(g0 - g1), `${hex} -> ${roundTripped} (G)`).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
      expect(Math.abs(b0 - b1), `${hex} -> ${roundTripped} (B)`).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
    }
  });

  it("gives pure white and black zero chroma", () => {
    expect(hexToOklch("#FFFFFF").c).toBeCloseTo(0, 2);
    expect(hexToOklch("#000000").c).toBeCloseTo(0, 2);
  });

  it("orders lightness the way perception expects: white > mid gray > black, regardless of hue", () => {
    expect(hexToOklch("#FFFFFF").l).toBeGreaterThan(hexToOklch("#808080").l);
    expect(hexToOklch("#808080").l).toBeGreaterThan(hexToOklch("#000000").l);
  });

  it("never emits an out-of-gamut or malformed hex for a wide sweep of hue/chroma/lightness", () => {
    for (let hi = 0; hi < 360; hi += 15) {
      for (let li = 1; li < 10; li++) {
        for (let ci = 0; ci < 5; ci++) {
          const hex = oklchToHex({ l: li / 10, c: ci * 0.08, h: hi });
          expect(hex).toMatch(/^#[0-9A-F]{6}$/);
        }
      }
    }
  });

  describe("hueDelta", () => {
    it("takes the short way around the circle", () => {
      expect(hueDelta(350, 10)).toBe(20);
      expect(hueDelta(10, 350)).toBe(-20);
    });
    it("is zero for equal hues, including across the 0/360 seam", () => {
      expect(hueDelta(0, 360)).toBeCloseTo(0, 5);
      expect(hueDelta(180, 180)).toBe(0);
    });
    it("is exactly ±180 at the antipode, never off by a wraparound sign flip", () => {
      expect(Math.abs(hueDelta(0, 180))).toBe(180);
      expect(Math.abs(hueDelta(90, 270))).toBe(180);
    });
  });
});
