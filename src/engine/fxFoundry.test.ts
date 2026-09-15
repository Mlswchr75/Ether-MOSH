import { describe, expect, it } from "vitest";
import { EFFECTS_BY_ID } from "./effects";
import {
  combineVisualGenomes,
  genomeFromJson,
  synthesizeFoundryRecipes,
  type VisualGenome,
} from "./fxFoundry";

const richGenome: VisualGenome = {
  brightness: 0.58,
  contrast: 0.82,
  saturation: 0.91,
  warmth: 0.28,
  hueSpread: 0.88,
  edgeDensity: 0.79,
  entropy: 0.94,
  symmetry: 0.22,
  density: 0.84,
  directionality: 0.66,
  complexity: 0.96,
  motionPotential: 0.74,
  organic: 0.43,
  geometric: 0.81,
  texture: 0.9,
  palette: ["#ff1493", "#00e5ff", "#6a00ff"],
  descriptors: ["fractured", "neon", "stained glass", "dense"],
  numericSignals: {},
  sourceCount: 1,
};

describe("FX Foundry visual genome", () => {
  it("extracts semantic traits, palette colors, descriptors and numeric signals from arbitrary JSON", () => {
    const genome = genomeFromJson({
      analysis: {
        brightness: 72,
        contrast: 0.81,
        saturation: "high",
        edge_density: 0.77,
        complexity: 9.2,
        palette: ["#ff00aa", "#0cf"],
        style_tags: ["fractured", "iridescent", "dense"],
      },
    });

    expect(genome.brightness).toBeGreaterThan(0.6);
    expect(genome.contrast).toBeGreaterThan(0.7);
    expect(genome.edgeDensity).toBeGreaterThan(0.65);
    expect(genome.complexity).toBeGreaterThan(0.75);
    expect(genome.palette).toContain("#ff00aa");
    expect(genome.descriptors).toContain("fractured");
    expect(Object.keys(genome.numericSignals).length).toBeGreaterThan(2);
  });

  it("combines multiple genomes without losing source provenance", () => {
    const a = { ...richGenome, sourceCount: 2, descriptors: ["fractured"], palette: ["#ff0000"] };
    const b = { ...richGenome, brightness: 0.2, sourceCount: 3, descriptors: ["organic"], palette: ["#00ff00"] };
    const combined = combineVisualGenomes([a, b]);

    expect(combined.sourceCount).toBe(5);
    expect(combined.descriptors).toEqual(expect.arrayContaining(["fractured", "organic"]));
    expect(combined.palette).toEqual(expect.arrayContaining(["#ff0000", "#00ff00"]));
    expect(combined.brightness).toBeGreaterThan(0.2);
    expect(combined.brightness).toBeLessThan(0.58);
  });
});

describe("FX Foundry recipe synthesis", () => {
  it("is deterministic for the same genome and seed", () => {
    expect(synthesizeFoundryRecipes(richGenome, { seed: "same-seed", count: 4 }))
      .toEqual(synthesizeFoundryRecipes(richGenome, { seed: "same-seed", count: 4 }));
  });

  it("only emits registered non-internal effects with valid parameter ranges", () => {
    const recipes = synthesizeFoundryRecipes(richGenome, { seed: "range-check", count: 12 });
    expect(recipes).toHaveLength(12);

    for (const recipe of recipes) {
      expect(recipe.layers.length).toBeGreaterThanOrEqual(3);
      expect(new Set(recipe.layers.map(layer => layer.effectId)).size).toBe(recipe.layers.length);
      expect(recipe.layers[0].blend).toBe("normal");
      expect(recipe.layers[0].opacity).toBe(1);

      for (const layer of recipe.layers) {
        const effect = EFFECTS_BY_ID[layer.effectId];
        expect(effect, layer.effectId).toBeDefined();
        expect(effect.internal).not.toBe(true);
        for (const param of effect.params) {
          expect(layer.params[param.key], `${layer.effectId}.${param.key}`).toBeGreaterThanOrEqual(param.min);
          expect(layer.params[param.key], `${layer.effectId}.${param.key}`).toBeLessThanOrEqual(param.max);
        }
      }
    }
  });

  it("produces visibly diverse recipes from a complex genome instead of cloning one stack", () => {
    const recipes = synthesizeFoundryRecipes(richGenome, { seed: "diversity", count: 8 });
    const signatures = new Set(recipes.map(recipe => recipe.layers.map(layer => layer.effectId).join("+")));
    expect(signatures.size).toBeGreaterThanOrEqual(6);
    expect(recipes.every(recipe => recipe.score >= 0 && recipe.score <= 1)).toBe(true);
    expect(recipes.every(recipe => recipe.name.length > 3)).toBe(true);
  });
});
