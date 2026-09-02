import { describe, expect, it } from "vitest";
import { generateRelationshipPalette, COLOR_RELATIONSHIPS, type ColorRelationship } from "./colorScript";
import { hexToOklch, hueDelta } from "./oklch";

/** Deterministic RNG so a failure is reproducible rather than a flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe("colorScript", () => {
  it("produces a valid three-color ForgePalette for every relationship, across a hue sweep", () => {
    const rand = rng(1);
    for (const rel of COLOR_RELATIONSHIPS) {
      for (let h = 0; h < 360; h += 40) {
        const palette = generateRelationshipPalette(rel, h, rand);
        expect(palette.name).toBe(rel);
        expect(palette.colors).toHaveLength(3);
        for (const hex of palette.colors) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
  });

  it("complementary places the antagonist ~180° from the dominant hue", () => {
    const rand = rng(2);
    const palette = generateRelationshipPalette("complementary", 30, rand);
    const dom = hexToOklch(palette.colors[0]);
    const antag = hexToOklch(palette.colors[1]);
    expect(Math.abs(hueDelta(dom.h, antag.h))).toBeGreaterThan(160);
  });

  it("triadic places the antagonist ~120° or ~240° from the dominant hue, not opposite", () => {
    const rand = rng(3);
    for (let i = 0; i < 20; i++) {
      const palette = generateRelationshipPalette("triadic", 30, rand);
      const dom = hexToOklch(palette.colors[0]);
      const antag = hexToOklch(palette.colors[1]);
      const delta = Math.abs(hueDelta(dom.h, antag.h));
      expect(delta).toBeGreaterThan(100);
      expect(delta).toBeLessThan(140);
    }
  });

  it("splitComplementary lands off exact opposition — neither ~180° nor within a triadic's range", () => {
    const rand = rng(4);
    for (let i = 0; i < 20; i++) {
      const palette = generateRelationshipPalette("splitComplementary", 30, rand);
      const dom = hexToOklch(palette.colors[0]);
      const antag = hexToOklch(palette.colors[1]);
      const delta = Math.abs(hueDelta(dom.h, antag.h));
      expect(delta).toBeGreaterThan(140);
      expect(delta).toBeLessThan(160);
    }
  });

  it("scorchedEarth stays in the warm hue band regardless of the requested base hue", () => {
    const rand = rng(5);
    for (let h = 0; h < 360; h += 30) {
      const palette = generateRelationshipPalette("scorchedEarth", h, rand);
      const dom = hexToOklch(palette.colors[0]);
      // Warm band folds onto 0..60° (red through amber) by design — measure
      // from the band's own center (30°) via hueDelta so a value that
      // round-trips to just past the 0/360 seam (e.g. -0.2° coming back as
      // 359.8°) is correctly recognized as still inside the band, instead
      // of a false failure from comparing raw degrees across the seam.
      expect(Math.abs(hueDelta(30, dom.h))).toBeLessThanOrEqual(30.5);
    }
  });

  it("toxicNeon stays consistently vivid across the hue wheel, not just at hue-lucky spots", () => {
    // sRGB's gamut narrows sharply for blue/violet hues at high lightness —
    // a flat chroma target at too-high a lightness reads as neon green but
    // washed-out pastel blue (the bug this test guards). Both dominant and
    // antagonist should land with real, comparable chroma regardless of
    // which part of the wheel the antagonist's offset happens to land on.
    const rand = rng(9);
    for (let h = 0; h < 360; h += 45) {
      const palette = generateRelationshipPalette("toxicNeon", h, rand);
      const dom = hexToOklch(palette.colors[0]);
      const antag = hexToOklch(palette.colors[1]);
      expect(dom.c, `dominant at base hue ${h}`).toBeGreaterThan(0.1);
      expect(antag.c, `antagonist at base hue ${h}`).toBeGreaterThan(0.1);
    }
  });

  it("toxicNeon reads as more vivid (higher chroma) than chromaticBlack's void", () => {
    const rand = rng(6);
    const neon = generateRelationshipPalette("toxicNeon", 200, rand);
    const black = generateRelationshipPalette("chromaticBlack", 200, rand);
    expect(hexToOklch(neon.colors[0]).c).toBeGreaterThan(hexToOklch(black.colors[2]).c);
  });

  it("fluorescentPastel stays light across all three slots — it's the one relationship whose 'void' isn't dark", () => {
    const rand = rng(7);
    const palette = generateRelationshipPalette("fluorescentPastel", 150, rand);
    for (const hex of palette.colors) expect(hexToOklch(hex).l).toBeGreaterThan(0.4);
  });

  it("every other relationship keeps a genuinely dark void, unlike fluorescentPastel", () => {
    const rand = rng(8);
    const darkVoidRelationships: ColorRelationship[] = [
      "complementary", "splitComplementary", "triadic", "toxicNeon", "scorchedEarth", "chromaticBlack",
    ];
    for (const rel of darkVoidRelationships) {
      const palette = generateRelationshipPalette(rel, 210, rand);
      expect(hexToOklch(palette.colors[2]).l, rel).toBeLessThan(0.35);
    }
  });

  it("is deterministic for a fixed hue and rand sequence", () => {
    const a = generateRelationshipPalette("triadic", 88, rng(999));
    const b = generateRelationshipPalette("triadic", 88, rng(999));
    expect(a).toEqual(b);
  });
});
