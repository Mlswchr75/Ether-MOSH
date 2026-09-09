import { describe, expect, it } from "vitest";
import {
  normalizeRadialDegrees,
  radialFlickThreshold,
  radialGestureShouldActivate,
  radialHoldJitterTolerance,
  radialIndexForAngle,
  radialTriggerAt,
  clampFlickToRings,
  radialSlotsFor,
  radialTightestSpacing,
  MOBILE_RING_RADII,
  RADIAL_PAGE_SIZE,
  radialPageCount,
  radialPageIds,
  wrapPage,
  isCentralRadialHoldPoint,
  RADIAL_WHEEL_ARM_MS,
  RADIAL_WHEEL_HOLD_MS,
} from "./HotTriggers";

describe("mobile radial trigger selection", () => {
  it("normalizes angles in either direction", () => {
    expect(normalizeRadialDegrees(-10)).toBe(350);
    expect(normalizeRadialDegrees(370)).toBe(10);
  });

  it("maps twelve o'clock to the first trigger", () => {
    expect(radialIndexForAngle(0, 8)).toBe(0);
    expect(radialIndexForAngle(90, 8)).toBe(2);
    expect(radialIndexForAngle(359, 8)).toBe(0);
  });

  it("keeps flick selection aligned after steering rotation", () => {
    expect(radialIndexForAngle(45, 8, 45)).toBe(0);
    expect(radialIndexForAngle(135, 8, 45)).toBe(2);
  });

  it("returns no selection for an empty wheel", () => {
    expect(radialIndexForAngle(0, 0)).toBe(-1);
  });

  it("hit-tests exactly where it draws, at any wheel size", () => {
    // The regression: placement used fractional radii while flick selection
    // used a hard-coded 112px ring boundary, so the drawn ring and the
    // touchable ring parted company on any wheel that wasn't ~600px across.
    // Both now read the same normalized geometry, so every slot's own centre
    // resolves back to itself.
    for (const total of [5, 9, RADIAL_PAGE_SIZE]) {
      for (const slot of radialSlotsFor(total)) {
        const radians = (slot.angleDeg - 90) * Math.PI / 180;
        const nx = Math.cos(radians) * slot.radius;
        const ny = Math.sin(radians) * slot.radius;
        expect(radialTriggerAt(nx, ny, total)).toBe(slot.index);
      }
    }
  });

  it("addresses both rings, each reachable at its own angle", () => {
    const total = RADIAL_PAGE_SIZE;
    const slots = radialSlotsFor(total);
    expect([...new Set(slots.map(s => s.radius))].sort((a, b) => b - a)).toEqual(MOBILE_RING_RADII);

    // Twelve o'clock on the outer radius is the first trigger.
    expect(radialTriggerAt(0, -MOBILE_RING_RADII[0], total)).toBe(0);

    // Every inner slot is reachable at its own angle.
    const innerSlots = slots.filter(s => s.radius === MOBILE_RING_RADII[1]);
    expect(innerSlots.length).toBeGreaterThan(0);
    for (const slot of innerSlots) {
      const radians = (slot.angleDeg - 90) * Math.PI / 180;
      expect(radialTriggerAt(Math.cos(radians) * slot.radius, Math.sin(radians) * slot.radius, total))
        .toBe(slot.index);
    }
  });

  it("follows the wheel's rotation", () => {
    const total = RADIAL_PAGE_SIZE;
    const slot = radialSlotsFor(total)[3];
    const radians = (slot.angleDeg + 30 - 90) * Math.PI / 180;
    expect(radialTriggerAt(Math.cos(radians) * slot.radius, Math.sin(radians) * slot.radius, total, 30))
      .toBe(slot.index);
  });

  it("declines the hub and the space beyond the outer ring", () => {
    expect(radialTriggerAt(0, 0, RADIAL_PAGE_SIZE)).toBe(-1);
    expect(radialTriggerAt(0, -1.2, RADIAL_PAGE_SIZE)).toBe(-1);
  });

  it("leaves a full page's neighbours twice a touch target apart", () => {
    // 328px is the wheel on a 390px-wide phone at 84vw — the tightest real
    // case. Unpaginated, twenty-six triggers left neighbours ~57px apart,
    // barely more than one 48px target. A page of fourteen leaves ~84px.
    // --ht-size floors at 48px, so any pair closer than that overlaps. This
    // measures every pair, including one outer slot against one inner one,
    // which is the pair that actually collides when two ring counts share no
    // step size and drift into alignment.
    expect(radialTightestSpacing(RADIAL_PAGE_SIZE, 328)).toBeGreaterThan(48);
  });

  it("never draws more than a page, however many triggers it is handed", () => {
    // Handed the whole set this used to fill the outer ring and dump the rest
    // on the inner — a worse layout than the one pagination replaced.
    for (const total of [RADIAL_PAGE_SIZE, 26, 40]) {
      const slots = radialSlotsFor(total);
      expect(slots.length).toBeLessThanOrEqual(RADIAL_PAGE_SIZE);
      const outer = slots.filter(s => s.radius === MOBILE_RING_RADII[0]);
      const inner = slots.filter(s => s.radius === MOBILE_RING_RADII[1]);
      expect(outer.length).toBeLessThanOrEqual(8);
      expect(inner.length).toBeLessThanOrEqual(6);
    }
  });

  it("draws one ring when a page does not fill the outer one", () => {
    const slots = radialSlotsFor(5);
    expect(slots).toHaveLength(5);
    expect(new Set(slots.map(s => s.radius))).toEqual(new Set([MOBILE_RING_RADII[0]]));
  });

  it("pre-arms early but keeps the hard summon at four tenths", () => {
    expect(RADIAL_WHEEL_ARM_MS).toBeGreaterThanOrEqual(200);
    expect(RADIAL_WHEEL_ARM_MS).toBeLessThanOrEqual(300);
    expect(RADIAL_WHEEL_HOLD_MS).toBe(400);
  });

  it("uses pointer-specific flick and jitter thresholds", () => {
    expect(radialFlickThreshold("mouse")).toBeLessThan(radialFlickThreshold("pen"));
    expect(radialFlickThreshold("pen")).toBeLessThan(radialFlickThreshold("touch"));
    expect(radialHoldJitterTolerance("mouse")).toBeLessThan(radialHoldJitterTolerance("pen"));
    expect(radialHoldJitterTolerance("pen")).toBeLessThan(radialHoldJitterTolerance("touch"));
  });

  it("only summons from the central circle", () => {
    expect(isCentralRadialHoldPoint(500, 400, 1000, 800)).toBe(true);
    expect(isCentralRadialHoldPoint(500, 590, 1000, 800)).toBe(true);
    expect(isCentralRadialHoldPoint(500, 610, 1000, 800)).toBe(false);
    expect(isCentralRadialHoldPoint(20, 20, 1000, 800)).toBe(false);
  });

  it("keeps a stationary hold open but activates an intentional drag", () => {
    expect(radialGestureShouldActivate(0, "touch")).toBe(false);
    expect(radialGestureShouldActivate(20, "touch")).toBe(false);
    expect(radialGestureShouldActivate(70, "touch")).toBe(true);
    expect(radialGestureShouldActivate(40, "mouse")).toBe(true);
  });
});

describe("flick selection reaches the ring however hard you throw", () => {
  it("selects by angle when the flick overshoots the outer ring", () => {
    const total = RADIAL_PAGE_SIZE;
    const slots = radialSlotsFor(total);
    const outer = slots.find(s => s.radius === MOBILE_RING_RADII[0])!;
    const radians = (outer.angleDeg - 90) * Math.PI / 180;

    // A thumb flick easily travels 0.6 of the wheel's diameter from centre.
    // Nearest-slot matching alone found nothing out there, so the gesture
    // silently did nothing — the worst failure this control can have.
    const far = clampFlickToRings(Math.cos(radians) * 0.62, Math.sin(radians) * 0.62);
    expect(radialTriggerAt(far.x, far.y, total)).toBe(outer.index);
  });

  it("selects by angle when the flick falls short of the inner ring", () => {
    const total = RADIAL_PAGE_SIZE;
    const inner = radialSlotsFor(total).find(s => s.radius === MOBILE_RING_RADII[1])!;
    const radians = (inner.angleDeg - 90) * Math.PI / 180;
    const short = clampFlickToRings(Math.cos(radians) * 0.09, Math.sin(radians) * 0.09);
    expect(radialTriggerAt(short.x, short.y, total)).toBe(inner.index);
  });

  it("leaves a flick that lands between the rings to pick the nearer one", () => {
    const between = (MOBILE_RING_RADII[0] + MOBILE_RING_RADII[1]) / 2;
    const point = clampFlickToRings(0, -between);
    expect(Math.hypot(point.x, point.y)).toBeCloseTo(between);
  });

  it("does not divide by zero on a flick of no length", () => {
    expect(clampFlickToRings(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("paging the wheel", () => {
  const ids = Array.from({ length: 26 }, (_, i) => `t${i}`);

  it("fits twenty-six triggers in two pages, so nothing is more than one chevron away", () => {
    expect(radialPageCount(26)).toBe(2);
  });

  it("keeps the user's own order — page one is the triggers they reach for", () => {
    expect(radialPageIds(ids, 0)).toEqual(ids.slice(0, RADIAL_PAGE_SIZE));
    expect(radialPageIds(ids, 1)).toEqual(ids.slice(RADIAL_PAGE_SIZE));
  });

  it("shows every trigger exactly once across its pages", () => {
    const seen = new Set<string>();
    for (let page = 0; page < radialPageCount(ids.length); page++) {
      for (const id of radialPageIds(ids, page)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(ids.length);
  });

  it("wraps in both directions, so paging past either end is continuous", () => {
    expect(wrapPage(2, 26)).toBe(0);
    expect(wrapPage(-1, 26)).toBe(1);
    expect(wrapPage(-3, 26)).toBe(1);
  });

  it("stays on one page when the set fits", () => {
    expect(radialPageCount(8)).toBe(1);
    expect(radialPageCount(0)).toBe(1);
    expect(wrapPage(5, 8)).toBe(0);
  });
});

describe("no two triggers can overlap", () => {
  /**
   * The honest invariant, and the one the old "no shared angle" check only
   * approximated: on a full page, no two slots — on the same ring or across
   * rings — are closer than a touch target.
   *
   * Eight outer slots and six inner ones do not share a step size, so the
   * half-step stagger cannot keep them from lining up; at 90 and 270 degrees
   * they do. What stops the buttons overlapping there is the radial gap, not
   * the stagger, and that is what this measures.
   */
  it("keeps every pair of slots at least a target apart on a phone", () => {
    const diameter = 328;      // a 390px-wide phone at 84vw
    const target = 48;         // the button's own width
    const slots = radialSlotsFor(RADIAL_PAGE_SIZE);
    const at = (slot: typeof slots[number]) => {
      const radians = (slot.angleDeg - 90) * Math.PI / 180;
      return { x: Math.cos(radians) * slot.radius * diameter, y: Math.sin(radians) * slot.radius * diameter };
    };
    let tightest = Infinity;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = at(slots[i]);
        const b = at(slots[j]);
        tightest = Math.min(tightest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    expect(tightest).toBeGreaterThan(target);
  });

  it("keeps the inner ring clear of the hub and the outer ring inside the wheel", () => {
    const halfButton = 0.145 / 2;   // --ht-size as a fraction of the diameter
    const hubRadius = 0.12;         // the hub is 24% of the diameter across
    expect(MOBILE_RING_RADII[1] - halfButton).toBeGreaterThan(hubRadius);
    expect(MOBILE_RING_RADII[0] + halfButton).toBeLessThan(0.5);
  });
});
