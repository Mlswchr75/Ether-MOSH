import { describe, expect, it } from "vitest";
import { combinationPenalty, rememberStack, STACK_MEMORY } from "./compositionVariety";
import { briefFrom, compose, craftOf, LOOKS, NEUTRAL_STATS, pickForRole, rollWildness } from "./artDirector";
import { recencyPenalty } from "./compose";
import { rngFromSeed } from "./seed";

describe("composition variety", () => {
  it("penalizes familiar partners more than an effect returning alone, and forgets gradually", () => {
    const history = [["ripple", "bloom", "rgbShift"]];
    const single = combinationPenalty("bloom", [], history);
    const pair = combinationPenalty("bloom", ["ripple"], history);
    expect(pair).toBeGreaterThan(single);
    expect(combinationPenalty("bloom", ["ripple", "rgbShift"], history)).toBeGreaterThan(pair);
    expect(combinationPenalty("bloom", ["ripple"], [[], [], ...history])).toBeLessThan(pair);
    expect(combinationPenalty("fog", ["ripple"], history)).toBe(0);
  });

  it("keeps bounded, independent snapshots without mutating prior history", () => {
    const ids = ["ripple", "bloom", "ripple"];
    const first = rememberStack([], ids);
    ids[0] = "fog";
    let history = first;
    for (let i = 0; i < 30; i++) history = rememberStack(history, [`effect-${i}`]);
    expect(first).toEqual([["ripple", "bloom"]]);
    expect(history).toHaveLength(STACK_MEMORY);
    expect(history[0]).toEqual(["effect-29"]);
  });

  it("can leave a look's shortlist without breaking the requested role", () => {
    const look = LOOKS[0];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = pickForRole("form", look, briefFrom(NEUTRAL_STATS), rngFromSeed(`explore-${i}`), { exploration: 1, wildness: .8 });
      expect(craftOf(id)?.role).toBe("form");
      seen.add(id);
    }
    expect([...seen].filter(id => !look.picks.form?.includes(id)).length).toBeGreaterThan(3);
  });

  it("sustains varied stacks over 600 seeded taps, with rare recent pair reuse", () => {
    let forms: string[] = [], others: string[] = [], looks: string[] = [], history: string[][] = [];
    const stacks = new Set<string>(), effects = new Set<string>();
    let repeatedPairs = 0, pairs = 0;
    for (let i = 0; i < 600; i++) {
      const rand = rngFromSeed(`variety-neutral-${i}`);
      const c = compose(briefFrom(NEUTRAL_STATS), rand, {
        roleCount: 3, chaos: .15, wildness: rollWildness(rand, .18),
        lookPenalty: recencyPenalty(looks, []), effectPenalty: recencyPenalty(forms, others),
        previousLookId: looks[0], recentStacks: history,
      });
      const ids = c.layers.map(layer => layer.effectId);
      stacks.add([...ids].sort().join("|"));
      ids.forEach(id => effects.add(id));
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
        pairs++;
        if (history.slice(0, 5).some(stack => stack.includes(ids[a]) && stack.includes(ids[b]))) repeatedPairs++;
      }
      forms = [...c.layers.filter(l => l.role === "form").map(l => l.effectId), ...forms].slice(0, 5);
      others = [...c.layers.filter(l => l.role !== "form").map(l => l.effectId), ...others].slice(0, 10);
      looks = [c.look.id, ...looks].slice(0, 5);
      history = rememberStack(history, ids);
    }
    // Original same-seed baseline: 459 stacks, 82 effects, 1.06% recent pairs.
    expect(stacks.size).toBeGreaterThan(520);
    expect(effects.size).toBeGreaterThanOrEqual(85);
    expect(repeatedPairs / pairs).toBeLessThan(.008);
  });
});
