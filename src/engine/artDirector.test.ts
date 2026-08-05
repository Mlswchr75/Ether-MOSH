import { describe, expect, it } from "vitest";
import { rngFromSeed } from "./seed";
import { EFFECTS_BY_ID } from "./effects";
import {
  LOOKS,
  NEUTRAL_STATS,
  ROLES,
  briefFrom,
  chooseLook,
  compose,
  craftOf,
  opacityForRole,
  pickForRole,
  poolForRole,
  roleForQuadrant,
  statsFromPixels,
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
  it("assigns every registered effect a role", () => {
    for (const id of Object.keys(EFFECTS_BY_ID)) {
      expect(craftOf(id), `${id} has no craft entry`).not.toBeNull();
    }
  });

  it("fills every role with real effects", () => {
    for (const role of ROLES) {
      expect(poolForRole(role).length, role).toBeGreaterThan(4);
    }
  });

  it("maps quadrants onto composition roles in order", () => {
    expect(roleForQuadrant(0)).toBe("grade");
    expect(roleForQuadrant(1)).toBe("form");
    expect(roleForQuadrant(2)).toBe("accent");
    expect(roleForQuadrant(3)).toBe("finish");
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

  it("holds accents and finishes below full opacity so stacks don't turn to mud", () => {
    for (let i = 0; i < 40; i++) {
      const c = compose(neutralBrief, rngFromSeed(`o-${i}`));
      for (const l of c.layers) {
        if (l.role === "accent" || l.role === "finish") expect(l.opacity).toBeLessThan(0.85);
      }
    }
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
    let grey = 0, vivid = 0;
    for (let i = 0; i < 80; i++) {
      grey += colorOf(pickForRole("grade", LOOKS[3], greyBrief, rngFromSeed(`g${i}`)));
      vivid += colorOf(pickForRole("grade", LOOKS[3], vividBrief, rngFromSeed(`v${i}`)));
    }
    expect(grey).toBeGreaterThan(vivid);
  });

  it("spends less detail on a busy frame than on an empty one", () => {
    const cost = (b: typeof busyBrief, seed: string) =>
      compose(b, rngFromSeed(seed)).layers.reduce((a, l) => a + (craftOf(l.effectId)?.cost ?? 0), 0);
    let busy = 0, empty = 0;
    for (let i = 0; i < 40; i++) {
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
