import { describe, expect, it } from "vitest";
import { FORGE_PALETTES, chooseArtDirectedPalette } from "./forgePalettes";

const brief = { needsColor: 0.7, needsLift: 0.3, needsCompression: 0.2, warmth: 0.5, saturation: 0.3 };

describe("automatic palette direction", () => {
  it("does not repeat the current palette when alternatives exist", () => {
    expect(chooseArtDirectedPalette(brief, () => 0, 0)).not.toBe(0);
  });

  it("includes restrained non pink-blue families in the roster", () => {
    expect(FORGE_PALETTES.map(p => p.name)).toEqual(expect.arrayContaining(["ochre", "moss", "oxide", "mono"]));
  });
});
