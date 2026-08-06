import { describe, expect, it } from "vitest";
import { rngFromSeed } from "./seed";
import { EFFECTS_BY_ID } from "./effects";
import {
  TRAITS,
  affinityAgainst,
  applyAxisDelta,
  axisTargets,
  blendForRelation,
  localInQuadrant,
  quadrantAt,
  relationLabel,
  rollQuadrantEffect,
  similarity,
  type QuadrantIndex,
} from "./quadrants";

describe("quadrantAt", () => {
  it("maps corners to Q1..Q4 in reading order", () => {
    expect(quadrantAt(0.1, 0.1)).toBe(0); // top-left
    expect(quadrantAt(0.9, 0.1)).toBe(1); // top-right
    expect(quadrantAt(0.1, 0.9)).toBe(2); // bottom-left
    expect(quadrantAt(0.9, 0.9)).toBe(3); // bottom-right
  });

  it("puts the exact midpoint in the bottom-right quadrant", () => {
    expect(quadrantAt(0.5, 0.5)).toBe(3);
  });
});

describe("localInQuadrant", () => {
  it("rescales each quadrant to a full 0..1 pad", () => {
    expect(localInQuadrant(0, 0)).toEqual({ x: 0, y: 0 });
    // Just inside the top-left quadrant's far corner.
    expect(localInQuadrant(0.25, 0.25)).toEqual({ x: 0.5, y: 0.5 });
    // Same relative spot, bottom-right quadrant.
    expect(localInQuadrant(0.75, 0.75)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("traits", () => {
  it("derives traits for every registered effect", () => {
    for (const id of Object.keys(EFFECTS_BY_ID)) {
      expect(TRAITS[id], `missing traits for ${id}`).toBeDefined();
    }
  });

  it("detects UV displacement from the shader body", () => {
    // blockShift samples at a shifted uv; hueRotate samples plain vUv.
    expect(TRAITS.blockShift.displaces).toBe(true);
    expect(TRAITS.hueRotate.displaces).toBe(false);
  });

  it("detects time-driven effects", () => {
    expect(TRAITS.scanBreak.temporal).toBe(true);
    expect(TRAITS.solarize.temporal).toBe(false);
  });
});

describe("similarity", () => {
  it("is maximal for an effect against itself", () => {
    expect(similarity("datamosh", "datamosh")).toBe(1);
  });

  it("is symmetric", () => {
    expect(similarity("datamosh", "hueRotate")).toBeCloseTo(similarity("hueRotate", "datamosh"), 10);
  });

  it("rates same-category pairs above cross-family pairs", () => {
    const sameFamily = similarity("datamosh", "blockShift");      // corruption ↔ corruption
    const crossFamily = similarity("datamosh", "vignette");       // corruption ↔ atmosphere
    expect(sameFamily).toBeGreaterThan(crossFamily);
  });

  it("stays within 0..1", () => {
    for (const a of Object.keys(TRAITS)) {
      for (const b of Object.keys(TRAITS)) {
        const s = similarity(a, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("affinityAgainst", () => {
  it("returns a neutral 0 when there are no neighbours", () => {
    expect(affinityAgainst("datamosh", [])).toBe(0);
  });

  it("scores a kindred effect above a clashing one", () => {
    const neighbours = ["datamosh", "blockShift"]; // corruption pair
    expect(affinityAgainst("pixelSort", neighbours))
      .toBeGreaterThan(affinityAgainst("vignette", neighbours));
  });
});

describe("relationLabel", () => {
  it("names each band of the affinity axis", () => {
    expect(relationLabel(-1)).toBe("clashing");
    expect(relationLabel(-0.4)).toBe("contrary");
    expect(relationLabel(0)).toBe("wild");
    expect(relationLabel(0.4)).toBe("kindred");
    expect(relationLabel(1)).toBe("matched");
  });
});

describe("rollQuadrantEffect", () => {
  it("never returns an excluded effect", () => {
    const exclude = ["datamosh", "pixelSort", "blockShift"];
    for (let i = 0; i < 200; i++) {
      const roll = rollQuadrantEffect({
        neighbours: ["hueRotate"],
        exclude,
        rand: rngFromSeed(`seed-${i}`),
      });
      expect(exclude).not.toContain(roll.effectId);
    }
  });

  it("never duplicates an effect another quadrant already holds", () => {
    const neighbours = ["datamosh", "hueRotate", "kaleidoscope"];
    for (let i = 0; i < 200; i++) {
      const roll = rollQuadrantEffect({ neighbours, rand: rngFromSeed(`dup-${i}`) });
      expect(neighbours).not.toContain(roll.effectId);
    }
  });

  it("honours a forced target: similar targets beat clashing targets", () => {
    const neighbours = ["datamosh", "blockShift"];
    let similarTotal = 0;
    let clashingTotal = 0;
    for (let i = 0; i < 60; i++) {
      similarTotal += rollQuadrantEffect({
        neighbours, targetAffinity: 1, rand: rngFromSeed(`s-${i}`),
      }).affinity;
      clashingTotal += rollQuadrantEffect({
        neighbours, targetAffinity: -1, rand: rngFromSeed(`c-${i}`),
      }).affinity;
    }
    expect(similarTotal / 60).toBeGreaterThan(clashingTotal / 60);
  });

  it("spreads across many distinct effects over repeated rolls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      seen.add(rollQuadrantEffect({ neighbours: [], rand: rngFromSeed(`v-${i}`) }).effectId);
    }
    // The whole point of the feature: taps must not cycle a handful of effects.
    expect(seen.size).toBeGreaterThan(15);
  });

  it("still returns an effect when exclusions would starve the pool", () => {
    const everything = Object.keys(EFFECTS_BY_ID);
    const roll = rollQuadrantEffect({
      neighbours: everything,
      exclude: everything,
      rand: rngFromSeed("starved"),
    });
    expect(roll.effectId).toBeTruthy();
    expect(EFFECTS_BY_ID[roll.effectId]).toBeDefined();
  });
});

describe("blendForRelation", () => {
  it("always composites the base layer normally", () => {
    for (let i = 0; i < 50; i++) {
      expect(blendForRelation(-1, rngFromSeed(`b-${i}`), true)).toBe("normal");
    }
  });

  it("uses clashing blends for incompatible rolls and gentle ones otherwise", () => {
    const clashing = new Set(["difference", "multiply", "additive", "hardLight"]);
    const cohesive = new Set(["normal", "screen", "overlay"]);
    for (let i = 0; i < 50; i++) {
      expect(clashing.has(blendForRelation(-0.9, rngFromSeed(`x-${i}`), false))).toBe(true);
      expect(cohesive.has(blendForRelation(0.9, rngFromSeed(`y-${i}`), false))).toBe(true);
    }
  });
});

describe("axisTargets", () => {
  it("puts the first two params on X and Y", () => {
    const t = axisTargets("datamosh");
    expect(t?.x.key).toBe("amount");
    expect(t?.y.key).toBe("scale");
  });

  it("falls back to opacity on Y for single-param effects", () => {
    // Every shipped effect now carries two params, so the fallback is only
    // reachable through a stand-in. It stays in place for effects added later.
    const id = "__singleParamProbe";
    EFFECTS_BY_ID[id] = {
      id,
      name: "Probe",
      category: "color",
      blurb: "test stand-in",
      params: [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 }],
      frag: "void main(){ gl_FragColor = vec4(0.0); }",
    };
    try {
      const t = axisTargets(id);
      expect(t?.x.key).toBe("amount");
      expect(t?.y.key).toBeNull();
      expect(t?.y.label).toBe("Opacity");
    } finally {
      delete EFFECTS_BY_ID[id];
    }
  });

  it("gives every registered effect two named axes", () => {
    for (const id of Object.keys(EFFECTS_BY_ID)) {
      const t = axisTargets(id);
      expect(t, `no axes for ${id}`).not.toBeNull();
      // Both axes drive a real param: no effect leans on the opacity fallback,
      // so a drag in any direction changes the look rather than just the mix.
      expect(t?.x.key, `${id} has no X param`).toBeTruthy();
      expect(t?.y.key, `${id} has no Y param`).toBeTruthy();
      expect(t?.x.key, `${id} maps both axes to the same param`).not.toBe(t?.y.key);
    }
  });
});

describe("applyAxisDelta", () => {
  const target = { key: "amount", label: "Amount", min: 0, max: 1 };

  it("sweeps the full range over one quadrant of travel", () => {
    expect(applyAxisDelta(target, 0, 1)).toBe(1);
    expect(applyAxisDelta(target, 0.5, -0.25)).toBeCloseTo(0.25, 10);
  });

  it("clamps to the param's bounds", () => {
    expect(applyAxisDelta(target, 0.9, 5)).toBe(1);
    expect(applyAxisDelta(target, 0.1, -5)).toBe(0);
  });

  it("snaps to the step when one is declared", () => {
    const stepped = { key: "rows", label: "Density", min: 4, max: 200, step: 1 };
    const v = applyAxisDelta(stepped, 40, 0.1);
    expect(Number.isInteger(v)).toBe(true);
  });
});
