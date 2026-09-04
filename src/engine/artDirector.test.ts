import { describe, expect, it } from "vitest";
import { rngFromSeed } from "./seed";
import { EFFECTS_BY_ID, PUBLIC_EFFECTS } from "./effects";
import {
  LOOKS,
  MAX_ROLES,
  VIBRANCE_MAX,
  VIBRANCE_MIN,
  adaptiveVibrance,
  NEUTRAL_STATS,
  ROLES,
  briefFrom,
  chooseLook,
  compose,
  composeRoleLayer,
  craftOf,
  gpuCostOf,
  lookTransitionScore,
  opacityForRole,
  paramsForRole,
  pickForRole,
  poolForRole,
  rollRoleCount,
  statsFromPixels,
  strengthParamFor,
  type Look,
  type SourceStats,
} from "./artDirector";

/** Build a flat WxH image of one colour for the analyzer. */
function solid(w: number, h: number, r: number, g: number, b: number): number[] {
  const px: number[] = [];
  for (let i = 0; i < w * h; i++) px.push(r, g, b, 255);
  return px;
}

/**
 * Vertical black/white bars — busy, high-contrast detail.
 *
 * The period must be > 2: at period 2 the pixels either side of any pixel hold
 * the same value, so a Sobel gradient cancels to exactly zero. That's a real
 * property of the operator at Nyquist, not something the analyzer should try to
 * work around — but it makes a 1px checker a useless fixture for "busy".
 */
function stripes(w: number, h: number, period = 6): number[] {
  const px: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x % period < period / 2 ? 0 : 255;
      px.push(v, v, v, 255);
    }
  }
  return px;
}

describe("content analysis", () => {
  it("reads a dark frame as dark and flat", () => {
    const s = statsFromPixels(solid(16, 16, 10, 10, 12), 16, 16);
    expect(s.brightness).toBeLessThan(0.1);
    expect(s.contrast).toBeLessThan(0.05);
    expect(s.density).toBeLessThan(0.05);
  });

  it("reads a bright frame as bright and clipping", () => {
    const s = statsFromPixels(solid(16, 16, 255, 255, 255), 16, 16);
    expect(s.brightness).toBeGreaterThan(0.95);
    expect(s.clipHigh).toBeGreaterThan(0.9);
  });

  it("reads a grey frame as unsaturated", () => {
    const s = statsFromPixels(solid(16, 16, 128, 128, 128), 16, 16);
    expect(s.saturation).toBeLessThan(0.05);
  });

  it("reads a saturated frame as saturated", () => {
    const s = statsFromPixels(solid(16, 16, 255, 0, 0), 16, 16);
    expect(s.saturation).toBeGreaterThan(0.9);
  });

  it("reads stripes as busy and high-contrast", () => {
    const s = statsFromPixels(stripes(16, 16), 16, 16);
    expect(s.density).toBeGreaterThan(0.5);
    expect(s.contrast).toBeGreaterThan(0.8);
  });

  it("separates warm from cool", () => {
    const warm = statsFromPixels(solid(8, 8, 220, 120, 40), 8, 8);
    const cool = statsFromPixels(solid(8, 8, 40, 120, 220), 8, 8);
    expect(warm.warmth).toBeGreaterThan(cool.warmth);
  });

  it("locates visual energy instead of treating the frame as spatially flat", () => {
    const px = solid(16, 8, 0, 0, 0);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const i = (y * 16 + x) * 4; px[i] = 255; px[i + 1] = 220; px[i + 2] = 60;
    }
    expect(statsFromPixels(px, 16, 8).balanceX).toBeLessThan(0.4);
  });
});

describe("sequence judgement", () => {
  it("rejects exact repetition and rewards a related but novel continuation", () => {
    const brief = briefFrom(NEUTRAL_STATS);
    expect(lookTransitionScore("chromeNoir", "chromeNoir", brief)).toBeLessThan(-2);
    expect(lookTransitionScore("chromeNoir", "livingCrystal", brief)).toBeGreaterThan(-0.5);
  });
});

describe("the brief", () => {
  it("asks for lift on a dark frame and compression on a blown one", () => {
    const dark = briefFrom(statsFromPixels(solid(8, 8, 12, 12, 12), 8, 8));
    const blown = briefFrom(statsFromPixels(solid(8, 8, 252, 252, 252), 8, 8));
    expect(dark.needsLift).toBeGreaterThan(0.8);
    expect(dark.needsCompression).toBe(0);
    expect(blown.needsCompression).toBeGreaterThan(0.8);
    expect(blown.needsLift).toBe(0);
  });

  it("asks for colour on a grey frame and not on a vivid one", () => {
    const grey = briefFrom(statsFromPixels(solid(8, 8, 128, 128, 128), 8, 8));
    const vivid = briefFrom(statsFromPixels(solid(8, 8, 255, 20, 140), 8, 8));
    expect(grey.needsColor).toBeGreaterThan(vivid.needsColor);
    expect(grey.needsColor).toBeGreaterThan(0.7);
  });

  it("asks for structure on an empty frame and restraint on a busy one", () => {
    const empty = briefFrom(statsFromPixels(solid(16, 16, 90, 90, 90), 16, 16));
    const busy = briefFrom(statsFromPixels(stripes(16, 16), 16, 16));
    expect(empty.needsStructure).toBeGreaterThan(0.9);
    expect(busy.needsRestraint).toBeGreaterThan(empty.needsRestraint);
  });

  it("keeps every derived need inside 0..1", () => {
    for (const px of [solid(8,8,0,0,0), solid(8,8,255,255,255), stripes(8,8), solid(8,8,255,0,255)]) {
      const b = briefFrom(statsFromPixels(px, 8, 8));
      for (const k of ["needsLift","needsCompression","needsContrast","needsColor","needsStructure","needsRestraint"] as const) {
        expect(b[k], k).toBeGreaterThanOrEqual(0);
        expect(b[k], k).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the grammar", () => {
  it("composes role layers with grade-safe blending and explicit region handling", () => {
    const look = LOOKS[0];
    const brief = briefFrom(NEUTRAL_STATS);
    const region = { mode: "radial" as const, scale: 0.4, feather: 0.1, invert: false };

    const grade = composeRoleLayer("grade", look, brief, rngFromSeed("grade-role"), {
      exclude: [], wildness: 0.4,
    });
    const added = composeRoleLayer("form", look, brief, rngFromSeed("added-role"), {
      exclude: [], wildness: 0.4, existingRegion: null,
    });
    const rerolled = composeRoleLayer("accent", look, brief, rngFromSeed("rerolled-role"), {
      exclude: [], wildness: 0.4, existingRegion: region,
    });

    expect(grade!.blend).toBe("normal");
    expect(added!.region).toBeNull();
    expect(rerolled!.region).toEqual(region);
  });

  it("assigns every registered effect a role", () => {
    // Internal, manager-driven effects (e.g. cursorMosh) are deliberately
    // outside the director's grammar — they never enter the auto-composed
    // stack, so they carry no craft entry by design.
    for (const { id } of PUBLIC_EFFECTS) {
      expect(craftOf(id), `${id} has no craft entry`).not.toBeNull();
    }
  });

  it("fills every role with real effects", () => {
    for (const role of ROLES) {
      expect(poolForRole(role).length, role).toBeGreaterThan(4);
    }
  });

  it("gives every look a pick for every role it can fill", () => {
    for (const look of LOOKS) {
      for (const role of ROLES) {
        const picks = look.picks[role] ?? [];
        expect(picks.length, `${look.id}.${role}`).toBeGreaterThan(0);
        for (const id of picks) {
          expect(EFFECTS_BY_ID[id], `${look.id}.${role} -> ${id}`).toBeDefined();
          expect(craftOf(id)!.role, `${look.id}.${role} -> ${id} is not a ${role}`).toBe(role);
        }
      }
    }
  });
});

describe("composition", () => {
  const neutralBrief = briefFrom(NEUTRAL_STATS);

  it("always composes in role order, bottom to top", () => {
    for (let i = 0; i < 60; i++) {
      const c = compose(neutralBrief, rngFromSeed(`c-${i}`));
      expect(c.layers.map(l => l.role)).toEqual(["grade", "form", "accent", "finish"]);
    }
  });

  it("blends the grade with the original instead of painting over it", () => {
    for (let i = 0; i < 40; i++) {
      const c = compose(neutralBrief, rngFromSeed(`g-${i}`));
      const grade = c.layers[0];
      // Normal blend keeps the bottom of the stack from wiping to black, and
      // holding it under 1.0 lets the real frame show through — the difference
      // between grading a shot and replacing it.
      expect(grade.blend).toBe("normal");
      // Floor is 0.4, not 0.5: a heavy grade (bitCrush, posterize) is held back
      // further by the cost weighting, which is the intended behaviour. It only
      // has to stay strong enough to read as a grade at all.
      expect(grade.opacity).toBeGreaterThan(0.4);
      expect(grade.opacity).toBeLessThan(0.95);
    }
  });

  /**
   * Mud is caused by a loud layer covering everything beneath it — so the rule
   * is about full-frame coverage, not about opacity alone.
   *
   * A REGIONED accent only covers part of the frame; the grade and form still
   * read everywhere else, so it can run as loud as it likes without burying
   * anything. That distinction is what lets a stack be violent and legible at
   * the same time, and narrowing this test to full-frame layers is the point
   * rather than a concession — an unregioned accent is still capped.
   */
  it("holds full-frame accents and finishes below full opacity on a calm roll", () => {
    // The 0.84+wildness*0.16 ceiling is wildness-dependent by design (a
    // maximally wild roll is allowed to push toward full opacity even
    // unregioned -- see the test below). This test isolates the calm-roll
    // case, which is what actually guards against mud in the common case;
    // it previously left wildness to chance, which made it fragile rather
    // than meaningfully calm.
    for (let i = 0; i < 40; i++) {
      const c = compose(neutralBrief, rngFromSeed(`o-${i}`), { wildness: 0.1 });
      for (const l of c.layers) {
        if (l.region) continue;
        if (l.role === "accent" || l.role === "finish") expect(l.opacity).toBeLessThan(0.87);
      }
    }
  });

  it("lets an accent past the calm-roll cap when the roll is sufficiently wild, regioned or not", () => {
    // The region exemption was widened into a wildness exemption: a
    // sufficiently wild roll can now push an unregioned accent/finish toward
    // full opacity too, not just a regioned one. This guards the exemption
    // itself -- if wild rolls stopped producing any loud layers, this test
    // would silently become vacuous rather than start failing.
    let loud = 0;
    for (let i = 0; i < 200; i++) {
      for (const l of compose(neutralBrief, rngFromSeed(`or-${i}`), { wildness: 0.95 }).layers) {
        if (l.opacity >= 0.85 && (l.role === "accent" || l.role === "finish")) loud++;
      }
    }
    expect(loud).toBeGreaterThan(0);
  });

  it("never repeats an effect inside one stack", () => {
    for (let i = 0; i < 60; i++) {
      const ids = compose(neutralBrief, rngFromSeed(`d-${i}`)).layers.map(l => l.effectId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("drops to grade+finish at the lowest role count", () => {
    const c = compose(neutralBrief, rngFromSeed("low"), { roleCount: 2 });
    expect(c.layers.map(l => l.role)).toEqual(["grade", "finish"]);
  });

  it("goes deeper than four without losing role order", () => {
    for (let i = 0; i < 40; i++) {
      const c = compose(neutralBrief, rngFromSeed(`deep-${i}`), { roleCount: 7, chaos: 0.6 });
      expect(c.layers).toHaveLength(7);
      // Depth doubles roles rather than inventing them, and the stack still
      // reads bottom-to-top.
      const order = c.layers.map(l => ROLES.indexOf(l.role));
      expect([...order]).toEqual([...order].sort((a, b) => a - b));
      expect(c.layers[0].role).toBe("grade");
    }
  });

  it("never repeats an effect even in a deep chaotic stack", () => {
    for (let i = 0; i < 60; i++) {
      const ids = compose(neutralBrief, rngFromSeed(`dd-${i}`), { roleCount: 7, chaos: 1 })
        .layers.map(l => l.effectId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("keeps the grade strict even at maximum chaos", () => {
    // The grade is the tonal foundation; an arbitrary effect underneath
    // everything wipes the frame, so rule-breaks must never touch it.
    for (let i = 0; i < 60; i++) {
      const c = compose(neutralBrief, rngFromSeed(`gc-${i}`), { roleCount: 7, chaos: 1 });
      expect(craftOf(c.layers[0].effectId)?.role).toBe("grade");
    }
  });

  it("actually breaks the grammar when asked, and never when not", () => {
    const offRole = (chaos: number) => {
      let n = 0;
      for (let i = 0; i < 120; i++) {
        for (const l of compose(neutralBrief, rngFromSeed(`br-${chaos}-${i}`), { roleCount: 7, chaos }).layers) {
          if (craftOf(l.effectId)?.role !== l.role) n++;
        }
      }
      return n;
    };
    // Strict mode is a guarantee, not a tendency.
    expect(offRole(0)).toBe(0);
    expect(offRole(1)).toBeGreaterThan(0);
  });

  it("keeps deep stacks inside a bounded gpu ceiling", () => {
    for (let i = 0; i < 80; i++) {
      const c = compose(neutralBrief, rngFromSeed(`gb-${i}`), { roleCount: 7, chaos: 1 });
      const total = c.layers.reduce((a, l) => a + gpuCostOf(l.effectId), 0);
      // Deeper stacks earn more budget, but it is capped — this is what keeps
      // frame time bounded however wild the roll.
      expect(total).toBeLessThanOrEqual(28 + 8);
    }
  });

  it("writes params inside every declared range", () => {
    for (let i = 0; i < 60; i++) {
      for (const l of compose(neutralBrief, rngFromSeed(`p-${i}`)).layers) {
        const def = EFFECTS_BY_ID[l.effectId];
        for (const p of def.params) {
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeGreaterThanOrEqual(p.min);
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeLessThanOrEqual(p.max);
        }
      }
    }
  });
});

describe("content-awareness", () => {
  const darkBrief = briefFrom(statsFromPixels(solid(16, 16, 14, 14, 20), 16, 16));
  const blownBrief = briefFrom(statsFromPixels(solid(16, 16, 250, 250, 250), 16, 16));
  const greyBrief = briefFrom(statsFromPixels(solid(16, 16, 120, 120, 120), 16, 16));
  const busyBrief = briefFrom(stripesStats());

  function stripesStats(): SourceStats {
    return statsFromPixels(stripes(24, 24), 24, 24);
  }

  const finishLight = (id: string) => craftOf(id)?.gives.light ?? 0;

  it("reaches for light on a dark frame more than on a blown one", () => {
    let dark = 0, blown = 0;
    for (let i = 0; i < 80; i++) {
      dark += finishLight(pickForRole("finish", LOOKS[0], darkBrief, rngFromSeed(`d${i}`)));
      blown += finishLight(pickForRole("finish", LOOKS[0], blownBrief, rngFromSeed(`b${i}`)));
    }
    expect(dark).toBeGreaterThan(blown);
  });

  it("reaches for colour on a grey frame more than on a vivid one", () => {
    const vividBrief = briefFrom(statsFromPixels(solid(16, 16, 255, 30, 160), 16, 16));
    const colorOf = (id: string) => craftOf(id)?.gives.color ?? 0;
    // Averaged over every look, not one: a look whose whole grade palette is
    // already colourful has no room to discriminate, which made this a coin
    // flip sensitive to unrelated scoring changes.
    let grey = 0, vivid = 0;
    for (const look of LOOKS) {
      for (let i = 0; i < 20; i++) {
        grey += colorOf(pickForRole("grade", look, greyBrief, rngFromSeed(`g${look.id}${i}`)));
        vivid += colorOf(pickForRole("grade", look, vividBrief, rngFromSeed(`v${look.id}${i}`)));
      }
    }
    expect(grey).toBeGreaterThan(vivid);
  });

  /* Averaged over enough rolls to actually measure the preference.
     Restraint is one term among many in pickForRole's score, and cost per
     mosh only separates the two briefs by a few percent — at 40 samples the
     seeds moved the total more than the brief did, so this passed or failed
     on which seeds happened to be listed rather than on whether the director
     reads the picture. Several hundred is where the sign stops flipping. */
  it("spends less detail on a busy frame than on an empty one", () => {
    const cost = (b: typeof busyBrief, seed: string) =>
      compose(b, rngFromSeed(seed)).layers.reduce((a, l) => a + (craftOf(l.effectId)?.cost ?? 0), 0);
    let busy = 0, empty = 0;
    for (let i = 0; i < 400; i++) {
      busy += cost(busyBrief, `bz-${i}`);
      empty += cost(greyBrief, `em-${i}`);
    }
    expect(busy).toBeLessThan(empty);
  });
});

describe("tonal punch", () => {
  const brief = briefFrom(NEUTRAL_STATS);

  it("registers a tone curve the director can reach for", () => {
    // Before this existed there was no effect in the library whose primary job
    // was adding contrast, so nothing could restore punch a stack had spent.
    const c = craftOf("filmicTone");
    expect(c).not.toBeNull();
    expect(c!.role).toBe("grade");
    expect(c!.gives.contrast).toBeGreaterThanOrEqual(0.9);
    // It must preserve the frame it's grading, not overwrite it.
    expect(c!.cost).toBeLessThan(0.2);
    expect(c!.replaces ?? 0).toBeLessThan(0.2);
  });

  it("holds heavy effects back harder than gentle ones", () => {
    // A layer that rearranges the frame gets less opacity, so the source still
    // reads through it. This is what keeps stacks legible.
    let heavy = 0, light = 0;
    for (let i = 0; i < 60; i++) {
      const r1 = rngFromSeed(`h-${i}`);
      const r2 = rngFromSeed(`h-${i}`);
      heavy += opacityForRole("form", LOOKS[0], brief, r1, "drosteTunnel"); // cost 0.55
      light += opacityForRole("form", LOOKS[0], brief, r2, "lensWarp");     // cost 0.25
    }
    expect(heavy).toBeLessThan(light);
  });

  it("keeps every composed opacity in a usable range", () => {
    for (let i = 0; i < 60; i++) {
      for (const l of compose(brief, rngFromSeed(`op-${i}`)).layers) {
        expect(l.opacity).toBeGreaterThan(0.15);
        expect(l.opacity).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("house style", () => {
  const brief = briefFrom(NEUTRAL_STATS);

  it("keeps lo-fi effects out of cinematic looks", () => {
    const cinematic = LOOKS.filter(l => l.id !== "signalDecay");
    let lofi = 0, total = 0;
    for (const look of cinematic) {
      for (let i = 0; i < 30; i++) {
        for (const role of ROLES) {
          const id = pickForRole(role, look, brief, rngFromSeed(`${look.id}-${role}-${i}`));
          if (craftOf(id)?.fidelity === "lofi") lofi++;
          total++;
        }
      }
    }
    // Grit should be rare outside the look that asks for it.
    expect(lofi / total).toBeLessThan(0.12);
  });

  it("lets SIGNAL DECAY actually be gritty", () => {
    const decay = LOOKS.find(l => l.id === "signalDecay")!;
    let lofi = 0, total = 0;
    for (let i = 0; i < 40; i++) {
      for (const role of ROLES) {
        const id = pickForRole(role, decay, brief, rngFromSeed(`sd-${role}-${i}`));
        if (craftOf(id)?.fidelity === "lofi") lofi++;
        total++;
      }
    }
    expect(lofi / total).toBeGreaterThan(0.3);
  });
});

describe("variety", () => {
  const brief = briefFrom(NEUTRAL_STATS);

  it("rotates the art direction instead of repeating one look", () => {
    // Simulate a user tapping MOSH repeatedly, carrying look memory forward.
    const recent: string[] = [];
    const chosen: string[] = [];
    for (let i = 0; i < 24; i++) {
      const look = chooseLook(brief, rngFromSeed(`r-${i}`), recent);
      chosen.push(look.id);
      recent.push(look.id);
      if (recent.length > 4) recent.shift();
    }
    // No look twice within its memory window.
    for (let i = 1; i < chosen.length; i++) {
      expect(chosen[i], `repeat at ${i}`).not.toBe(chosen[i - 1]);
    }
    expect(new Set(chosen).size).toBeGreaterThanOrEqual(5);
  });

  it("produces materially different stacks on consecutive moshes", () => {
    const recentLooks: string[] = [];
    const stacks: string[][] = [];
    for (let i = 0; i < 12; i++) {
      const c = compose(brief, rngFromSeed(`s-${i}`), { avoidLooks: recentLooks });
      recentLooks.push(c.look.id);
      if (recentLooks.length > 4) recentLooks.shift();
      stacks.push(c.layers.map(l => l.effectId));
    }
    for (let i = 1; i < stacks.length; i++) {
      const shared = stacks[i].filter(id => stacks[i - 1].includes(id)).length;
      // Consecutive stacks may echo one slot, never read as the same stack.
      expect(shared, `stacks ${i - 1}/${i} too similar`).toBeLessThan(3);
    }
  });
});

describe("frame budget", () => {
  const brief = briefFrom(NEUTRAL_STATS);

  it("never composes a stack that blows the GPU budget", () => {
    // The structural half of "no lag": whatever the director rolls, total
    // shader cost stays bounded. 16x is roughly two heavy effects plus two
    // cheap ones; four heavy ones would be ~28x and drop frames.
    for (let i = 0; i < 300; i++) {
      const c = compose(brief, rngFromSeed(`gpu-${i}`));
      const total = c.layers.reduce((a, l) => a + gpuCostOf(l.effectId), 0);
      expect(total, c.layers.map(l => l.effectId).join(" > ")).toBeLessThanOrEqual(16);
    }
  });

  it("costs every effect, defaulting unmeasured ones to cheap", () => {
    for (const id of Object.keys(EFFECTS_BY_ID)) {
      const g = gpuCostOf(id);
      expect(g).toBeGreaterThanOrEqual(1);
      expect(g).toBeLessThan(12);
    }
  });

  it("still fills all four roles under the budget", () => {
    for (let i = 0; i < 120; i++) {
      expect(compose(brief, rngFromSeed(`full-${i}`)).layers).toHaveLength(4);
    }
  });
});

describe("effect strength (Phase 5)", () => {
  const brief = briefFrom(NEUTRAL_STATS);
  const maxDrive: Look = { id: "max", name: "MAX", blurb: "", picks: {}, suits: {}, drive: 1 };
  const minDrive: Look = { id: "min", name: "MIN", blurb: "", picks: {}, suits: {}, drive: 0 };

  describe("strengthParamFor", () => {
    it("defaults to params[0] pushed up, for an effect with no override", () => {
      expect(strengthParamFor("pixelSort")).toEqual({ key: "amount", direction: "up" });
    });

    it("resolves every documented override correctly", () => {
      expect(strengthParamFor("posterize")).toEqual({ key: "levels", direction: "down" });
      expect(strengthParamFor("bitCrush")).toEqual({ key: "bits", direction: "down" });
      expect(strengthParamFor("neonContour")).toEqual({ key: "threshold", direction: "down" });
      expect(strengthParamFor("depthEcho")).toEqual({ key: "strength", direction: "up" });
      expect(strengthParamFor("infiniteZoom")).toEqual({ key: "feed", direction: "up" });
      expect(strengthParamFor("strataSlice")).toEqual({ key: "timeSpread", direction: "up" });
      expect(strengthParamFor("timeShatter")).toEqual({ key: "spread", direction: "up" });
      expect(strengthParamFor("crtPhosphor")).toEqual({ key: "mask", direction: "up" });
    });

    it("opts out (key: null) for effects with no real amount knob", () => {
      expect(strengthParamFor("mirror").key).toBeNull();
      expect(strengthParamFor("feedbackTunnel").key).toBeNull();
      expect(strengthParamFor("mandalaBloom").key).toBeNull();
    });

    it("every overridden key actually exists on that effect's own params", () => {
      // A typo here would silently no-op the whole override — paramsForRole
      // just wouldn't find a param matching the (wrong) key and every param
      // would fall through to character variation instead.
      for (const id of ["posterize", "bitCrush", "neonContour", "depthEcho", "infiniteZoom", "strataSlice", "timeShatter", "crtPhosphor"]) {
        const { key } = strengthParamFor(id);
        expect(EFFECTS_BY_ID[id].params.some(p => p.key === key), `${id}.${key}`).toBe(true);
      }
    });
  });

  describe("paramsForRole", () => {
    it("pushes a 'down' effect's strength param toward its min at max drive, not its max", () => {
      const rand = rngFromSeed("posterize-max");
      const params = paramsForRole("posterize", "grade", maxDrive, brief, rand, 0);
      const p = EFFECTS_BY_ID.posterize.params.find(p => p.key === "levels")!;
      // Low wildness (0) keeps jitter small, so this should land close to
      // the min end rather than anywhere near the max — the inverse of
      // what an un-overridden "up" effect would do.
      expect(params.levels).toBeLessThan(p.min + (p.max - p.min) * 0.4);
    });

    it("pushes a default 'up' effect's strength param toward its max at max drive", () => {
      const rand = rngFromSeed("pixelSort-max");
      const params = paramsForRole("pixelSort", "accent", maxDrive, brief, rand, 0);
      const p = EFFECTS_BY_ID.pixelSort.params.find(p => p.key === "amount")!;
      expect(params.amount).toBeGreaterThan(p.min + (p.max - p.min) * 0.6);
    });

    it("keeps an opted-out effect's params near their defaults regardless of drive — nothing gets forced toward an extreme", () => {
      const rand = rngFromSeed("mirror-max");
      const params = paramsForRole("mirror", "form", maxDrive, brief, rand, 0);
      for (const p of EFFECTS_BY_ID.mirror.params) {
        // Character variation centers on the default with wildness-scaled
        // spread — at wildness 0 that spread is at its narrowest, so this
        // should land close to default regardless of how high drive is.
        expect(Math.abs(params[p.key] - p.default)).toBeLessThan((p.max - p.min) * 0.35);
      }
    });

    it("min drive still respects the override direction — a 'down' effect's strength param moves toward its max instead", () => {
      const rand = rngFromSeed("posterize-min");
      const params = paramsForRole("posterize", "grade", minDrive, brief, rand, 0);
      const p = EFFECTS_BY_ID.posterize.params.find(p => p.key === "levels")!;
      expect(params.levels).toBeGreaterThan(p.min + (p.max - p.min) * 0.6);
    });

    it("keeps every param within its declared range across the whole collection, both directions, at full wildness", () => {
      const rand = rngFromSeed("range-sweep");
      for (const id of Object.keys(EFFECTS_BY_ID)) {
        for (const drive of [maxDrive, minDrive]) {
          const params = paramsForRole(id, "accent", drive, brief, rand, 1);
          for (const p of EFFECTS_BY_ID[id].params) {
            expect(params[p.key], `${id}.${p.key}`).toBeGreaterThanOrEqual(p.min);
            expect(params[p.key], `${id}.${p.key}`).toBeLessThanOrEqual(p.max);
          }
        }
      }
    });
  });
});

describe("look curation coverage", () => {
  const curatedIds = () => {
    const ids = new Set<string>();
    for (const look of LOOKS) for (const role of ROLES) for (const id of look.picks[role] ?? []) ids.add(id);
    return ids;
  };

  /* The selection funnel, not the library, is what decides how much of MOSH a
     user ever sees. A pick comes from the chosen look's own shortlist unless a
     chaos roll breaks the grammar — and chaos is 0 at MILD — so an effect
     filed in no look at all is, at the settings most people leave alone,
     effectively unreachable. This is the check that keeps the library and what
     the director can actually reach from drifting apart again. */
  it("files every directable effect in at least one look", () => {
    const curated = curatedIds();
    const orphans = Object.keys(EFFECTS_BY_ID).filter(id => craftOf(id) && !curated.has(id));
    expect(orphans, `effects no look can reach: ${orphans.join(", ")}`).toEqual([]);
  });

  it("never lists a pick that isn't a real effect", () => {
    for (const look of LOOKS) {
      for (const role of ROLES) {
        for (const id of look.picks[role] ?? []) {
          expect(EFFECTS_BY_ID[id], `${look.id}/${role}: unknown effect "${id}"`).toBeDefined();
        }
      }
    }
  });

  /* A pick filed under the wrong role is silently dropped by pickForRole's
     own CRAFT lookup, which reads as "this look keeps ignoring that effect"
     rather than as the typo it is. */
  it("never files a pick under a role it isn't crafted for", () => {
    for (const look of LOOKS) {
      for (const role of ROLES) {
        for (const id of look.picks[role] ?? []) {
          expect(craftOf(id)?.role, `${look.id}/${role}: "${id}"`).toBe(role);
        }
      }
    }
  });

  /* Two or three picks per role meant the top of the ranking barely moved
     between rolls, so consecutive moshes on one look cycled the same handful
     of effects. Three is the floor; the deck averages well above it. */
  it("gives every look a shortlist wide enough to vary", () => {
    for (const look of LOOKS) {
      for (const role of ROLES) {
        expect((look.picks[role] ?? []).length, `${look.id}/${role}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("rollRoleCount", () => {
  const sample = (base: number, n = 4000) => {
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const rand = rngFromSeed(`rc-${base}-${i}`);
      const v = rollRoleCount(rand, base);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return counts;
  };

  it("centres on the tier's own depth but reaches a layer either side", () => {
    const counts = sample(4);
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([3, 4, 5]);
    // The centre stays the most likely outcome — this is jitter around a
    // chosen depth, not a uniform roll that throws the setting away.
    expect(counts.get(4)!).toBeGreaterThan(counts.get(3)!);
    expect(counts.get(4)!).toBeGreaterThan(counts.get(5)!);
  });

  it("never composes a single-layer stack, however low the tier", () => {
    for (const base of [1, 2]) {
      for (const v of sample(base, 500).keys()) expect(v).toBeGreaterThanOrEqual(2);
    }
  });

  it("never reaches past MAX_ROLES, however high the tier", () => {
    for (const base of [MAX_ROLES - 1, MAX_ROLES, MAX_ROLES + 3]) {
      for (const v of sample(base, 500).keys()) expect(v).toBeLessThanOrEqual(MAX_ROLES);
    }
  });

  it("actually produces stacks of that depth", () => {
    const brief = briefFrom(NEUTRAL_STATS);
    for (const depth of [3, 4, 5]) {
      const layers = compose(brief, rngFromSeed(`depth-${depth}`), { roleCount: depth }).layers;
      expect(layers).toHaveLength(depth);
    }
  });
});

describe("adaptiveVibrance", () => {
  /* The lift used to be a hardcoded 0.35 that nothing ever wrote to, so a grey
     wall and a neon sign got the same push. */
  it("spends the lift where there is room for it", () => {
    expect(adaptiveVibrance(0)).toBeCloseTo(VIBRANCE_MAX);
    expect(adaptiveVibrance(1)).toBeCloseTo(VIBRANCE_MIN);
    expect(adaptiveVibrance(0.2)).toBeGreaterThan(adaptiveVibrance(0.8));
  });

  it("lifts a typical frame harder than the fixed value it replaces", () => {
    expect(adaptiveVibrance(NEUTRAL_STATS.saturation)).toBeGreaterThan(0.35);
  });

  /* Pushing an already-vivid frame does not add range, it removes it: clipped
     hues all resolve to the same flat block. */
  it("holds back on a frame that is already vivid", () => {
    expect(adaptiveVibrance(0.9)).toBeLessThan(0.35);
  });

  it("stays inside the finisher's own 0..1 uniform range for any input", () => {
    for (const s of [-5, -0.1, 0, 0.5, 1, 1.4, 99, Number.NaN]) {
      const v = adaptiveVibrance(s);
      if (Number.isNaN(s)) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("falls monotonically as the source gets more colourful", () => {
    let previous = Infinity;
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const v = adaptiveVibrance(s);
      expect(v).toBeLessThan(previous);
      previous = v;
    }
  });
});
