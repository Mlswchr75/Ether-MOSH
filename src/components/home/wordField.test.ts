import { describe, expect, it } from "vitest";
import {
  createWordBag,
  overlaps,
  placeWord,
  rectAround,
  rotatedExtent,
  type Rect,
} from "./wordField";

/** Deterministic stand-in for Math.random so placement runs are reproducible. */
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

describe("rotatedExtent", () => {
  it("leaves an unrotated box alone", () => {
    expect(rotatedExtent(100, 20, 0)).toEqual({ w: 100, h: 20 });
  });

  it("swaps width and height at a quarter turn", () => {
    const e = rotatedExtent(100, 20, 90);
    expect(e.w).toBeCloseTo(20);
    expect(e.h).toBeCloseTo(100);
  });

  it("treats -90 and 270 like 90", () => {
    expect(rotatedExtent(100, 20, -90).w).toBeCloseTo(20);
    expect(rotatedExtent(100, 20, 270).w).toBeCloseTo(20);
  });

  it("grows a tilted word's short axis — the one that would clip a neighbour", () => {
    // A long, thin word narrows on its own axis at 45° but sweeps far taller,
    // and that new height is exactly the space a collision test must reserve.
    const e = rotatedExtent(100, 20, 45);
    expect(e.h).toBeGreaterThan(20 * 4);
    expect(e.h).toBeCloseTo((100 + 20) * Math.SQRT1_2);
  });

  it("grows both axes of a square on the diagonal", () => {
    const e = rotatedExtent(50, 50, 45);
    expect(e.w).toBeGreaterThan(50);
    expect(e.h).toBeGreaterThan(50);
  });
});

describe("overlaps", () => {
  const a: Rect = { l: 0, t: 0, r: 10, b: 10 };

  it("detects a shared area", () => {
    expect(overlaps(a, { l: 5, t: 5, r: 15, b: 15 })).toBe(true);
  });

  it("clears disjoint boxes", () => {
    expect(overlaps(a, { l: 20, t: 0, r: 30, b: 10 })).toBe(false);
  });

  it("counts a near miss as a hit once padded", () => {
    const near: Rect = { l: 12, t: 0, r: 22, b: 10 };
    expect(overlaps(a, near)).toBe(false);
    expect(overlaps(a, near, 2)).toBe(true);
  });
});

describe("placeWord", () => {
  const base = {
    W: 1000,
    H: 700,
    w: 120,
    h: 30,
    deg: 0,
    margin: 20,
    blocked: [] as Rect[],
    gap: 8,
    rng: seeded(1),
  };

  it("keeps the word inside the margins", () => {
    for (let i = 0; i < 200; i++) {
      const spot = placeWord({ ...base, rng: seeded(i) });
      expect(spot).not.toBeNull();
      expect(spot!.rect.l).toBeGreaterThanOrEqual(base.margin - 1e-6);
      expect(spot!.rect.t).toBeGreaterThanOrEqual(base.margin - 1e-6);
      expect(spot!.rect.r).toBeLessThanOrEqual(base.W - base.margin + 1e-6);
      expect(spot!.rect.b).toBeLessThanOrEqual(base.H - base.margin + 1e-6);
    }
  });

  it("reserves the rotated footprint, not the flat one", () => {
    // A 90°-turned word is 30 wide and 120 tall; only the tall extent can clip.
    for (let i = 0; i < 200; i++) {
      const spot = placeWord({ ...base, deg: 90, rng: seeded(i + 500) });
      expect(spot).not.toBeNull();
      expect(spot!.rect.b - spot!.rect.t).toBeCloseTo(120);
      expect(spot!.rect.r - spot!.rect.l).toBeCloseTo(30);
      expect(spot!.rect.b).toBeLessThanOrEqual(base.H - base.margin + 1e-6);
    }
  });

  it("never lands on a blocked box", () => {
    const hero: Rect = { l: 300, t: 250, r: 700, b: 450 };
    for (let i = 0; i < 300; i++) {
      const spot = placeWord({ ...base, blocked: [hero], rng: seeded(i + 900) });
      if (!spot) continue;
      expect(overlaps(spot.rect, hero, base.gap)).toBe(false);
    }
  });

  it("packs a whole field without a single collision", () => {
    const rng = seeded(42);
    const live: Rect[] = [{ l: 380, t: 280, r: 620, b: 420 }]; // hero keep-out
    let placed = 0;
    for (let i = 0; i < 40; i++) {
      const deg = [0, 90, -90, 180][i % 4];
      const spot = placeWord({ ...base, deg, blocked: live, rng });
      if (!spot) continue;
      for (const other of live) {
        expect(overlaps(spot.rect, other, base.gap)).toBe(false);
      }
      live.push(spot.rect);
      placed++;
    }
    expect(placed).toBeGreaterThan(8);
  });

  it("frees space again when a word is removed", () => {
    const wall: Rect[] = [{ l: 0, t: 0, r: 1000, b: 700 }];
    expect(placeWord({ ...base, blocked: wall })).toBeNull();
    expect(placeWord({ ...base, blocked: [] })).not.toBeNull();
  });

  it("returns null rather than clipping a word too big for the field", () => {
    expect(placeWord({ ...base, w: 2000 })).toBeNull();
    expect(placeWord({ ...base, w: 120, h: 900 })).toBeNull();
  });
});

describe("rectAround", () => {
  it("centres the box on the point", () => {
    expect(rectAround(50, 50, 20, 10)).toEqual({ l: 40, t: 45, r: 60, b: 55 });
  });
});

describe("createWordBag", () => {
  const WORDS = ["MOSH", "BROWSE", "LINK", "GO LIVE"] as const;

  it("shows every word once before repeating any", () => {
    const bag = createWordBag(WORDS, seeded(7));
    const drawn = WORDS.map(() => bag.next());
    expect([...drawn].sort()).toEqual([...WORDS].sort());
  });

  it("never draws the excluded word while alternatives remain", () => {
    const bag = createWordBag(WORDS, seeded(3));
    for (let i = 0; i < 40; i++) {
      expect(bag.next("MOSH")).not.toBe("MOSH");
    }
  });

  it("reports no draw rather than repeating when every word is excluded", () => {
    const bag = createWordBag(["MOSH"], seeded(3));
    expect(bag.next("MOSH")).toBeNull();
  });

  it("skips every word already on screen", () => {
    const bag = createWordBag(WORDS, seeded(11));
    const live = ["MOSH", "BROWSE", "LINK"];
    for (let i = 0; i < 40; i++) {
      expect(bag.next(live)).toBe("GO LIVE");
    }
  });
});
