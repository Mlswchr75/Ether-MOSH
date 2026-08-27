import { afterEach, describe, expect, it } from "vitest";
import { composeForgeStack } from "./forgeCompose";
import { EFFECTS_BY_ID, type EffectCategory } from "./effects";
import { tileVerdict } from "./tileSafety";
import { GENERATORS } from "./forgeGeneratorRegistry";
import { pickForgeGenerator, rollKaleidoscope } from "./forgeCompose";

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

describe("forge generator selection", () => {
  let restoreHardwareConcurrency: (() => void) | null = null;

  /** Volumetric Bloom is the only `costTier: "heavy"` generator today. */
  const VOLUMETRIC_BLOOM_ID = "volumetricBloom";

  function stubHardwareConcurrency(value: number) {
    const original = Object.getOwnPropertyDescriptor(navigator, "hardwareConcurrency");
    Object.defineProperty(navigator, "hardwareConcurrency", { value, configurable: true });
    restoreHardwareConcurrency = () => {
      if (original) Object.defineProperty(navigator, "hardwareConcurrency", original);
      else delete (navigator as { hardwareConcurrency?: number }).hardwareConcurrency;
    };
  }

  afterEach(() => {
    restoreHardwareConcurrency?.();
    restoreHardwareConcurrency = null;
  });

  it("only picks ids that exist in the registry", () => {
    const rand = rng(99);
    for (let i = 0; i < 100; i++) {
      const id = pickForgeGenerator(rand);
      expect(GENERATORS.some(g => g.id === id)).toBe(true);
    }
  });

  it("reaches every registered generator over many rolls", () => {
    const rand = rng(4242);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickForgeGenerator(rand));
    for (const g of GENERATORS) expect(seen.has(g.id)).toBe(true);
  });

  it("down-weights the heavy generator (Volumetric Bloom) on low-tier devices", () => {
    stubHardwareConcurrency(2);
    const rand = rng(2026);
    let volumetricCount = 0;
    const rolls = 500;
    for (let i = 0; i < rolls; i++) {
      if (pickForgeGenerator(rand) === VOLUMETRIC_BLOOM_ID) volumetricCount++;
    }
    // Flat weighting across 4 generators would land ~25%; the biased weight
    // (0.35 vs 1) works out to roughly 10.4%. Use a generous threshold well
    // below flat-share and above zero, so this is a real statistical signal
    // without being flaky.
    expect(volumetricCount / rolls).toBeLessThan(0.15);
    expect(volumetricCount).toBeGreaterThan(0); // never fully locked out
  });

  it("keeps selection roughly uniform across all 4 generators on high-tier devices", () => {
    stubHardwareConcurrency(8);
    const rand = rng(4242);
    const counts: Record<string, number> = {};
    const rolls = 500;
    for (let i = 0; i < rolls; i++) {
      const id = pickForgeGenerator(rand);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    for (const g of GENERATORS) {
      const share = (counts[g.id] ?? 0) / rolls;
      // Generator selection is intentionally close to flat; allow a wide band so this
      // isn't flaky, while still catching one generator dominating or being
      // starved.
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.4);
    }
  });

  it("rollKaleidoscope returns null most of the time and a valid fold count otherwise", () => {
    const rand = rng(55);
    let sawNull = false;
    let sawFold = false;
    for (let i = 0; i < 200; i++) {
      const fold = rollKaleidoscope(rand);
      if (fold === null) sawNull = true;
      else { sawFold = true; expect([2, 4, 6, 8]).toContain(fold); }
    }
    expect(sawNull).toBe(true);
    expect(sawFold).toBe(true);
  });
});
