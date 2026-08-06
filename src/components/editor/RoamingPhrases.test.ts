import { describe, expect, it } from "vitest";
import { choosePosition, type Rect } from "./RoamingPhrases";

/** Deterministic PRNG so a failure is reproducible. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const VIEWPORTS = [
  { W: 1920, H: 1080 },
  { W: 1280, H: 800 },
  { W: 834, H: 1112 },
  { W: 390, H: 844 },   // phone portrait
  { W: 844, H: 390 },   // phone landscape — the tightest case
];

/** A Go Live button roughly where the overlay centres it. */
const buttonFor = (W: number, H: number): Rect => {
  const bw = Math.min(260, W * 0.6);
  const bh = 68;
  return {
    l: (W - bw) / 2 - 16,
    t: (H - bh) / 2 - 16,
    r: (W + bw) / 2 + 16,
    b: (H + bh) / 2 + 16,
  };
};

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

/** Text sizes spanning "MOSH small" to "SELECT A FOLDER huge". */
const TEXTS = [
  { tw: 90, th: 40 },
  { tw: 240, th: 60 },
  { tw: 520, th: 110 },
  { tw: 900, th: 190 },
];

describe("phrase placement", () => {
  it("never lets a phrase cross an edge", () => {
    for (const { W, H } of VIEWPORTS) {
      const margin = Math.max(10, Math.min(W, H) * 0.03);
      for (const { tw, th } of TEXTS) {
        for (const seed of SEEDS) {
          const spot = choosePosition({
            W, H, tw, th, margin,
            blocked: buttonFor(W, H),
            spansFrame: tw > W * 0.62,
            rng: seeded(seed),
          });
          if (!spot) continue; // legitimately unplaceable
          expect(spot.left, `left ${W}x${H} ${tw}`).toBeGreaterThanOrEqual(margin - 0.001);
          expect(spot.top, `top ${W}x${H} ${tw}`).toBeGreaterThanOrEqual(margin - 0.001);
          expect(spot.left + tw, `right ${W}x${H} ${tw}`).toBeLessThanOrEqual(W - margin + 0.001);
          expect(spot.top + th, `bottom ${W}x${H} ${tw}`).toBeLessThanOrEqual(H - margin + 0.001);
        }
      }
    }
  });

  it("never covers the button unless the phrase spans the frame", () => {
    for (const { W, H } of VIEWPORTS) {
      const margin = Math.max(10, Math.min(W, H) * 0.03);
      const blocked = buttonFor(W, H);
      for (const { tw, th } of TEXTS) {
        const spansFrame = tw > W * 0.62;
        if (spansFrame) continue; // allowed to pass behind, tested separately
        for (const seed of SEEDS) {
          const spot = choosePosition({ W, H, tw, th, margin, blocked, spansFrame, rng: seeded(seed) });
          if (!spot) continue;
          const hits =
            spot.left < blocked.r && spot.left + tw > blocked.l &&
            spot.top < blocked.b && spot.top + th > blocked.t;
          expect(hits, `${W}x${H} tw=${tw} seed=${seed} overlapped the button`).toBe(false);
        }
      }
    }
  });

  it("refuses to place text that cannot fit inside the margins", () => {
    // The caller scales down before reaching here; if that ever regresses,
    // this must return null rather than emit a clipped placement.
    expect(choosePosition({
      W: 390, H: 844, tw: 500, th: 80, margin: 12,
      blocked: null, spansFrame: false, rng: seeded(1),
    })).toBeNull();

    expect(choosePosition({
      W: 390, H: 844, tw: 200, th: 900, margin: 12,
      blocked: null, spansFrame: false, rng: seeded(1),
    })).toBeNull();
  });

  it("still places a frame-spanning phrase even when it must cross the button", () => {
    // At this width there is nowhere it could go that avoids the centre, so
    // returning null would mean these phrases simply never appear.
    const W = 1280, H = 800;
    let placed = 0;
    for (const seed of SEEDS) {
      const spot = choosePosition({
        W, H, tw: 1000, th: 150, margin: 24,
        blocked: buttonFor(W, H), spansFrame: true, rng: seeded(seed),
      });
      if (spot) placed++;
    }
    expect(placed).toBe(SEEDS.length);
  });

  it("places small phrases reliably rather than mostly skipping", () => {
    // A high skip rate would read as dead air on screen.
    const W = 1280, H = 800;
    const margin = 24;
    const placed = SEEDS.filter(seed => choosePosition({
      W, H, tw: 240, th: 60, margin,
      blocked: buttonFor(W, H), spansFrame: false, rng: seeded(seed),
    })).length;
    expect(placed).toBeGreaterThan(SEEDS.length * 0.95);
  });

  it("uses the full height of the frame, not just a centred band", () => {
    // The phrases are supposed to be able to appear anywhere vertically.
    const W = 1280, H = 800;
    const margin = 24;
    const tops: number[] = [];
    for (const seed of SEEDS) {
      const spot = choosePosition({
        W, H, tw: 240, th: 60, margin,
        blocked: buttonFor(W, H), spansFrame: false, rng: seeded(seed),
      });
      if (spot) tops.push(spot.top);
    }
    expect(Math.min(...tops)).toBeLessThan(H * 0.2);
    expect(Math.max(...tops)).toBeGreaterThan(H * 0.7);
  });

  it("handles a missing button rect", () => {
    const spot = choosePosition({
      W: 1280, H: 800, tw: 240, th: 60, margin: 24,
      blocked: null, spansFrame: false, rng: seeded(7),
    });
    expect(spot).not.toBeNull();
  });
});
