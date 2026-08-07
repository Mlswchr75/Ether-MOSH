import { describe, expect, it } from "vitest";
import { composeForgeStack } from "./forgeCompose";
import { EFFECTS_BY_ID, type EffectCategory } from "./effects";
import { tileVerdict } from "./tileSafety";

/**
 * The bias exists so the journey director can have an opinion. Two things must
 * both hold for that to be worth anything: the opinion has to actually change
 * the draw, and it must not become a cage — a director that can only ever emit
 * corruption is a worse shuffle than no director at all.
 */

/** Deterministic RNG, so a failure is reproducible rather than a flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const categoriesOf = (ids: string[]) =>
  ids.map(id => EFFECTS_BY_ID[id]?.category).filter(Boolean) as EffectCategory[];

/** Category counts across many rolls, which is the only level the bias acts at. */
function tally(bias: Partial<Record<EffectCategory, number>> | undefined, rolls = 300) {
  const rand = rng(12345);
  const counts: Record<string, number> = {};
  for (let i = 0; i < rolls; i++) {
    const stack = composeForgeStack({ rand, seamless: true, intensity: 0.6, categoryBias: bias });
    for (const c of categoriesOf(stack.map(l => l.effectId))) counts[c] = (counts[c] ?? 0) + 1;
  }
  return counts;
}

describe("forge composition", () => {
  it("only draws effects that exist", () => {
    const rand = rng(7);
    for (let i = 0; i < 50; i++) {
      for (const l of composeForgeStack({ rand, seamless: false, intensity: 0.7 })) {
        expect(EFFECTS_BY_ID[l.effectId], l.effectId).toBeDefined();
      }
    }
  });

  it("respects the seamless pool", () => {
    // The whole tiling guarantee rests on this: one camera-derived effect in
    // the stack and the export cannot tile no matter how well it is healed.
    const rand = rng(99);
    for (let i = 0; i < 80; i++) {
      for (const l of composeForgeStack({ rand, seamless: true, intensity: 0.9 })) {
        expect(tileVerdict(l.effectId).safe, l.effectId).toBe(true);
      }
    }
  });

  it("never repeats an effect within one stack", () => {
    const rand = rng(4242);
    for (let i = 0; i < 120; i++) {
      const ids = composeForgeStack({ rand, seamless: true, intensity: 1, categoryBias: { corruption: 1 } })
        .map(l => l.effectId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("shifts the draw toward the weighted category", () => {
    const leaning = tally({ atmosphere: 1, color: 0.05, geometry: 0.05, corruption: 0.05, dimension: 0.05 });
    const neutral = tally(undefined);
    const share = (c: Record<string, number>) =>
      (c.atmosphere ?? 0) / Object.values(c).reduce((a, b) => a + b, 0);
    expect(share(leaning)).toBeGreaterThan(share(neutral) * 1.5);
  });

  it("keeps every category reachable however lopsided the weights", () => {
    // A floor under the weights is what stops the director painting itself into
    // one look for an entire set.
    const counts = tally({ corruption: 1, atmosphere: 0, color: 0, geometry: 0, dimension: 0 }, 400);
    expect(Object.keys(counts).length).toBeGreaterThan(1);
  });

  it("survives a bias naming categories that were never drawn", () => {
    const rand = rng(3);
    expect(() => composeForgeStack({
      rand, seamless: true, intensity: 0.5, categoryBias: { dimension: 2 },
    })).not.toThrow();
  });

  it("keeps params inside each effect's declared range", () => {
    // Out-of-range values don't error — the shader just clamps or misbehaves
    // silently, which is the worst kind of wrong.
    const rand = rng(555);
    for (let i = 0; i < 60; i++) {
      for (const l of composeForgeStack({ rand, seamless: false, intensity: 1 })) {
        for (const p of EFFECTS_BY_ID[l.effectId].params) {
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeGreaterThanOrEqual(p.min);
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeLessThanOrEqual(p.max);
        }
      }
    }
  });

  it("composites the base layer normally at full opacity", () => {
    // An exotic blend at the bottom has nothing underneath to blend with.
    const rand = rng(88);
    for (let i = 0; i < 40; i++) {
      const stack = composeForgeStack({ rand, seamless: true, intensity: 0.6 });
      if (!stack.length) continue;
      expect(stack[0].blend).toBe("normal");
      expect(stack[0].opacity).toBe(1);
    }
  });
});
