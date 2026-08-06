import { describe, expect, it } from "vitest";
import { NEUTRAL_STATS, briefFrom, compose, rollWildness } from "./artDirector";
import { EFFECTS_BY_ID } from "./effects";

/**
 * Variety guards.
 *
 * These exist because the engine's failure mode was never "any single output is
 * bad" — it was that consecutive rolls all landed the same distance from the
 * middle, so tapping again told you nothing new. That is invisible to a test
 * that only checks one composition at a time, so these measure the SPREAD over
 * many rolls instead.
 */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const brief = briefFrom(NEUTRAL_STATS);

/** Roll N full moshes the way the store does, honouring effect memory. */
function rollMany(n: number, floor: number, roleCount = 4) {
  const rand = seeded(12345);
  const recent: string[] = [];
  const looks: string[] = [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = compose(brief, rand, {
      roleCount,
      chaos: 0.35,
      wildness: rollWildness(rand, floor),
      avoidEffects: recent.slice(-8),
      avoidLooks: looks.slice(-4),
    });
    out.push(c);
    for (const l of c.layers) recent.push(l.effectId);
    looks.push(c.look.id);
  }
  return out;
}

describe("roll-to-roll variety", () => {
  it("reaches a wide slice of the library rather than the same shortlist", () => {
    const rolls = rollMany(60, 0.42);
    const ids = new Set(rolls.flatMap(r => r.layers.map(l => l.effectId)));
    // 60 rolls x 4 layers. Before wildness widened the pick window this sat far
    // lower, because a look offers 2-3 picks per role and the window was 3.
    expect(ids.size).toBeGreaterThan(40);
  });

  it("rarely repeats the same effect in consecutive rolls", () => {
    const rolls = rollMany(60, 0.42);
    let repeats = 0;
    for (let i = 1; i < rolls.length; i++) {
      const prev = new Set(rolls[i - 1].layers.map(l => l.effectId));
      if (rolls[i].layers.some(l => prev.has(l.effectId))) repeats++;
    }
    expect(repeats / (rolls.length - 1)).toBeLessThan(0.25);
  });

  it("produces genuinely restrained AND genuinely extreme rolls", () => {
    // The point of a fat-tailed wildness roll: both ends have to actually
    // happen, or the distribution has collapsed back to its mean.
    // One generator drawn 400 times, not 400 generators drawn once: an LCG
    // seeded with consecutive integers returns correlated first outputs, which
    // would make this measure the seeding rather than the distribution.
    const rng = seeded(99);
    const wild = Array.from({ length: 400 }, () => rollWildness(rng));
    expect(wild.filter(w => w < 0.3).length).toBeGreaterThan(40);
    expect(wild.filter(w => w > 0.7).length).toBeGreaterThan(80);
  });

  it("spreads layer opacity instead of clustering it", () => {
    const ops = rollMany(60, 0.42).flatMap(r => r.layers.map(l => l.opacity));
    const lo = ops.filter(o => o < 0.5).length / ops.length;
    const hi = ops.filter(o => o > 0.85).length / ops.length;
    // Both tails have to be populated. The old cost-damping pinned everything
    // into a mid band, which is what read as "dumbed down".
    expect(hi).toBeGreaterThan(0.12);
    expect(lo).toBeGreaterThan(0.03);
  });

  it("drives params near the ends of their travel, not just the middle", () => {
    let extreme = 0;
    let total = 0;
    for (const r of rollMany(60, 0.5)) {
      for (const l of r.layers) {
        const def = EFFECTS_BY_ID[l.effectId];
        for (const p of def.params) {
          const span = p.max - p.min;
          if (span <= 0) continue;
          const t = (l.params[p.key] - p.min) / span;
          total++;
          if (t < 0.12 || t > 0.88) extreme++;
        }
      }
    }
    expect(extreme / total).toBeGreaterThan(0.15);
  });

  it("partitions the frame on a solid share of rolls", () => {
    // Regions are how several full-strength effects coexist without mud, so
    // they need to be common at high intensity, not occasional.
    const rolls = rollMany(60, 0.5);
    const withRegion = rolls.filter(r => r.layers.some(l => l.region)).length;
    expect(withRegion / rolls.length).toBeGreaterThan(0.45);
  });

  it("uses more than one kind of partition", () => {
    const modes = new Set(
      rollMany(80, 0.6).flatMap(r => r.layers.map(l => l.region?.mode).filter(Boolean)),
    );
    expect(modes.size).toBeGreaterThanOrEqual(3);
  });

  it("still keeps mild restrained", () => {
    // Wildness must not have flattened the intensity settings into each other.
    const mild = rollMany(40, 0, 2).flatMap(r => r.layers.map(l => l.opacity));
    const nuclear = rollMany(40, 0.62, 5).flatMap(r => r.layers.map(l => l.opacity));
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(nuclear)).toBeGreaterThan(mean(mild));
  });

  it("rotates art direction across consecutive rolls", () => {
    const looks = rollMany(40, 0.42).map(r => r.look.id);
    for (let i = 1; i < looks.length; i++) {
      expect(looks[i], `look repeated back-to-back at ${i}`).not.toBe(looks[i - 1]);
    }
  });
});
