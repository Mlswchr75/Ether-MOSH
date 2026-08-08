import { describe, expect, it } from "vitest";
import { composeStack, roleOfCategory, type ComposeInput } from "./compose";
import { EFFECTS, EFFECTS_BY_ID, type EffectCategory } from "./effects";

const categoryOf = (id: string): EffectCategory =>
  EFFECTS_BY_ID[id]?.category ?? "corruption";

/** Deterministic PRNG so a failure is reproducible rather than a one-in-N fluke. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rankedFromAll = () =>
  EFFECTS.map((e, i) => ({ id: e.id, score: 1 - i / EFFECTS.length }));

function build(seed: number, intensity: number, ranked = rankedFromAll()) {
  const input: ComposeInput = { ranked, categoryOf, intensity, rand: seeded(seed) };
  return composeStack(input);
}

/** Enough samples that a probabilistic rule violation shows up reliably. */
const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const INTENSITIES = [0, 0.25, 0.5, 0.75, 1];

describe("composition grammar", () => {
  it("always produces at least one layer", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        expect(build(seed, intensity).length).toBeGreaterThan(0);
      }
    }
  });

  /**
   * The mud rule. Two effects that both rearrange where things are will
   * destroy each other's readability no matter how good either one is — this
   * is the single constraint that separates a composed stack from a pile.
   */
  it("never emits two structural layers", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const stack = build(seed, intensity);
        const structural = stack.filter(l => l.role === "structural");
        expect(structural.length, `seed ${seed} @ ${intensity}`).toBe(1);
      }
    }
  });

  it("puts the structural layer first and loudest", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const stack = build(seed, intensity);
        expect(stack[0].role).toBe("structural");
        for (const sub of stack.slice(1)) {
          expect(sub.opacity, `seed ${seed}`).toBeLessThan(stack[0].opacity);
        }
      }
    }
  });

  /**
   * Subordinate layers must stay clearly subordinate. The old director gave
   * every layer 0.75–1.0, which is what made heavy stacks unreadable; if this
   * ceiling ever drifts back up, that regression is back.
   */
  it("keeps every non-structural layer well below full strength", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        for (const l of build(seed, intensity).slice(1)) {
          expect(l.opacity, `${l.effectId} seed ${seed}`).toBeLessThanOrEqual(0.56);
        }
      }
    }
  });

  it("never lets two layers of one category both run loud", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const byCat = new Map<string, number>();
        for (const l of build(seed, intensity)) {
          if (l.opacity <= 0.5) continue;
          const c = categoryOf(l.effectId);
          byCat.set(c, (byCat.get(c) ?? 0) + 1);
        }
        for (const [cat, n] of byCat) {
          expect(n, `${cat} loud x${n} seed ${seed}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("scales layer count with intensity but never past four", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const n = build(seed, intensity).length;
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n, `seed ${seed} @ ${intensity}`).toBeLessThanOrEqual(4);
      }
    }
  });

  /**
   * A region pairing is only meaningful if the two halves differ. Handing both
   * layers the same mask would apply both effects to the same pixels, which is
   * just a normal stack wearing a mask.
   */
  it("pairs regions complementarily when it splits the frame", () => {
    let sawPair = 0;
    for (const seed of SEEDS) {
      const stack = build(seed, 0.8);
      const regioned = stack.filter(l => l.region);
      if (regioned.length < 2) continue;
      sawPair++;
      const [a, b] = regioned;
      const opposed =
        (a.region!.mode === "foreground" && b.region!.mode === "background") ||
        (a.region!.mode === "background" && b.region!.mode === "foreground") ||
        (a.region!.mode === b.region!.mode && !!a.region!.invert !== !!b.region!.invert);
      expect(opposed, `seed ${seed}: ${a.region!.mode} vs ${b.region!.mode}`).toBe(true);
    }
    // The pairing must actually happen sometimes, or the assertion above is vacuous.
    expect(sawPair).toBeGreaterThan(20);
  });

  it("does sometimes split the frame at high intensity", () => {
    const withRegions = SEEDS.filter(s => build(s, 0.9).some(l => l.region)).length;
    expect(withRegions).toBeGreaterThan(SEEDS.length * 0.3);
  });

  it("leaves calm scenes mostly unsplit", () => {
    const withRegions = SEEDS.filter(s => build(s, 0).some(l => l.region)).length;
    expect(withRegions).toBeLessThan(SEEDS.length * 0.75);
  });

  it("emits no duplicate effects within a stack", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        const ids = build(seed, intensity).map(l => l.effectId);
        expect(new Set(ids).size, `seed ${seed}`).toBe(ids.length);
      }
    }
  });

  it("only emits effects that exist", () => {
    for (const seed of SEEDS) {
      for (const l of build(seed, 0.6)) {
        expect(EFFECTS_BY_ID[l.effectId], l.effectId).toBeDefined();
      }
    }
  });

  it("keeps opacity in range", () => {
    for (const seed of SEEDS) {
      for (const intensity of INTENSITIES) {
        for (const l of build(seed, intensity)) {
          expect(l.opacity).toBeGreaterThan(0);
          expect(l.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("never gives a subordinate layer an obliterating blend", () => {
    // difference and hardLight wipe out what is beneath them, which defeats
    // the point of a layer that is meant to sit on top of the structure.
    for (const seed of SEEDS) {
      for (const l of build(seed, 0.7).slice(1)) {
        expect(["difference", "hardLight"]).not.toContain(l.blend);
      }
    }
  });

  it("degrades gracefully on a thin candidate list", () => {
    const ranked = [{ id: EFFECTS[0].id, score: 1 }];
    for (const seed of SEEDS.slice(0, 50)) {
      const stack = build(seed, 0.8, ranked);
      expect(stack).toHaveLength(1);
      expect(stack[0].role).toBe("structural");
    }
  });

  it("returns nothing when handed nothing", () => {
    expect(build(1, 0.5, [])).toEqual([]);
  });

  it("prefers a dimensional effect as the load-bearing layer", () => {
    // Dimensional effects are the only ones that add structure rather than
    // surface, so they should usually anchor the stack when available.
    const dimensional = SEEDS.filter(s =>
      categoryOf(build(s, 0.7)[0].effectId) === "dimension"
    ).length;
    expect(dimensional).toBeGreaterThan(SEEDS.length * 0.4);
  });
});

describe("role mapping", () => {
  it("treats dimension and geometry as structural", () => {
    expect(roleOfCategory("dimension")).toBe("structural");
    expect(roleOfCategory("geometry")).toBe("structural");
  });

  it("never assigns structural to a surface category", () => {
    for (const c of ["color", "atmosphere", "corruption"] as EffectCategory[]) {
      expect(roleOfCategory(c)).not.toBe("structural");
    }
  });
});
