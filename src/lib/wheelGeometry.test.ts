import { describe, expect, it } from "vitest";
import {
  angleDelta,
  hitSlot,
  HUB_RADIUS,
  normalizeDegrees,
  PER_RING,
  pointerAngle,
  precisionForRadius,
  proportionalRingPlan,
  ringPlan,
  ringSpacingPx,
  slotOffset,
  fixedRingSlots,
  wheelSlots,
} from "./wheelGeometry";

describe("ringPlan", () => {
  it("keeps a small set on one ring", () => {
    expect(ringPlan(5)).toEqual([5]);
    expect(ringPlan(PER_RING)).toEqual([PER_RING]);
  });

  it("never exceeds the per-ring breadth cap", () => {
    for (let total = 1; total <= 60; total++) {
      for (const count of ringPlan(total)) expect(count).toBeLessThanOrEqual(PER_RING);
    }
  });

  it("accounts for every item exactly once", () => {
    for (let total = 1; total <= 60; total++) {
      expect(ringPlan(total).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("gives the overflow to the outer ring, which has room for it", () => {
    // 9 items: the old layout put 8 outside and 1 inside. Spreading them
    // 5/4 keeps both rings comfortable.
    expect(ringPlan(9)).toEqual([5, 4]);
    expect(ringPlan(9)[0]).toBeGreaterThanOrEqual(ringPlan(9)[1]);
  });

  it("handles the empty case", () => {
    expect(ringPlan(0)).toEqual([]);
  });
});

describe("wheelSlots", () => {
  it("indexes slots contiguously from the outer ring inward", () => {
    const slots = wheelSlots(20);
    expect(slots.map(s => s.index)).toEqual(slots.map((_, i) => i));
    expect(slots[0].ring).toBe(0);
    expect(slots[slots.length - 1].ring).toBeGreaterThan(0);
  });

  it("keeps every slot outside the hub", () => {
    for (const slot of wheelSlots(30)) expect(slot.radius).toBeGreaterThan(HUB_RADIUS);
  });

  it("staggers alternate rings so slots do not stack radially", () => {
    const slots = wheelSlots(16);
    const outer = slots.filter(s => s.ring === 0).map(s => s.angleDeg);
    const inner = slots.filter(s => s.ring === 1).map(s => s.angleDeg);
    for (const angle of inner) expect(outer).not.toContain(angle);
  });

  it("applies whole-wheel rotation", () => {
    const plain = wheelSlots(4);
    const turned = wheelSlots(4, { rotationDeg: 45 });
    expect(turned.map(s => s.angleDeg)).toEqual(plain.map(s => normalizeDegrees(s.angleDeg + 45)));
  });
});

describe("hitSlot", () => {
  it("selects the slot the layout actually draws — at any wheel size", () => {
    // The regression this module exists to prevent: layout and hit-test are
    // both normalized, so the same normalized point resolves identically
    // whether the wheel is 300px or 700px across.
    const slots = wheelSlots(26);
    for (const slot of slots) {
      const offset = slotOffset(slot);
      expect(hitSlot(offset.x, offset.y, slots)).toBe(slot.index);
    }
  });

  it("returns nothing inside the hub", () => {
    const slots = wheelSlots(12);
    expect(hitSlot(0, 0, slots)).toBe(-1);
    expect(hitSlot(HUB_RADIUS * 0.5, 0, slots)).toBe(-1);
  });

  it("returns nothing well outside the outermost ring", () => {
    const slots = wheelSlots(12);
    expect(hitSlot(0, -1.4, slots)).toBe(-1);
  });

  it("leaves the gap between neighbours dead rather than snapping", () => {
    const slots = wheelSlots(8);
    const a = slotOffset(slots[0]);
    const b = slotOffset(slots[1]);
    // Dead-centre between two neighbours is ambiguous; a tight tolerance
    // should decline rather than guess.
    expect(hitSlot((a.x + b.x) / 2, (a.y + b.y) / 2, slots, 0.05)).toBe(-1);
  });

  it("handles an empty wheel", () => {
    expect(hitSlot(0.3, 0.3, [])).toBe(-1);
  });
});

describe("pointerAngle / angleDelta", () => {
  it("measures clockwise from twelve o'clock", () => {
    expect(pointerAngle(0, -1)).toBeCloseTo(0);
    expect(pointerAngle(1, 0)).toBeCloseTo(90);
    expect(pointerAngle(0, 1)).toBeCloseTo(180);
    expect(pointerAngle(-1, 0)).toBeCloseTo(270);
  });

  it("takes the short way round when crossing twelve", () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20);
    expect(angleDelta(10, 350)).toBeCloseTo(-20);
    expect(angleDelta(0, 0)).toBeCloseTo(0);
  });

  it("stays within a half turn", () => {
    for (let from = 0; from < 360; from += 17) {
      for (let to = 0; to < 360; to += 23) {
        const delta = angleDelta(from, to);
        expect(delta).toBeGreaterThan(-181);
        expect(delta).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe("precisionForRadius", () => {
  it("is full-speed near the ring and vernier at the rim", () => {
    expect(precisionForRadius(0.2)).toBe(1);
    expect(precisionForRadius(0.9)).toBeCloseTo(0.18);
  });

  it("falls off monotonically in between", () => {
    let previous = Infinity;
    for (let r = 0.3; r <= 0.7; r += 0.05) {
      const value = precisionForRadius(r);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      previous = value;
    }
  });
});

describe("proportionalRingPlan", () => {
  it("weights rings by circumference instead of splitting evenly", () => {
    const counts = proportionalRingPlan(27, [0.44, 0.315]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(27);
    // The outer ring has the circumference, so it takes the larger share —
    // the opposite of the old fixed 14-outer/12-inner split, which crowded
    // the smaller circle.
    expect(counts[0]).toBeGreaterThan(counts[1]);
  });

  it("accounts for every item, at any count", () => {
    for (let total = 1; total <= 40; total++) {
      expect(proportionalRingPlan(total, [0.44, 0.315]).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it("drops rings it cannot fill rather than drawing empty ones", () => {
    expect(proportionalRingPlan(1, [0.44, 0.315])).toEqual([1]);
    expect(proportionalRingPlan(0, [0.44, 0.315])).toEqual([]);
    expect(proportionalRingPlan(5, [])).toEqual([]);
  });

  it("evens out the touchable gap between the two rings", () => {
    const diameter = 328; // a 390px-wide phone at 84vw
    const radii = [0.44, 0.315];
    const counts = proportionalRingPlan(27, radii);
    const spacings = counts.map((count, ring) => ringSpacingPx(radii[ring], count, diameter));
    // Both rings comfortably clear a 44px target...
    for (const spacing of spacings) expect(spacing).toBeGreaterThan(44);
    // ...and neither ring is much tighter than the other.
    expect(Math.max(...spacings) - Math.min(...spacings)).toBeLessThan(12);
  });

  it("beats an even split on the crowded ring", () => {
    const diameter = 328;
    const radii = [0.44, 0.315];
    const proportional = proportionalRingPlan(27, radii);
    const evenSplit = [14, 13];
    const tightest = (counts: number[]) =>
      Math.min(...counts.map((count, ring) => ringSpacingPx(radii[ring], count, diameter)));
    expect(tightest(proportional)).toBeGreaterThan(tightest(evenSplit));
  });
});

describe("fixedRingSlots", () => {
  it("round-trips through the same hit-test as the layout", () => {
    const slots = fixedRingSlots(27, [0.44, 0.315]);
    for (const slot of slots) {
      const offset = slotOffset(slot);
      expect(hitSlot(offset.x, offset.y, slots)).toBe(slot.index);
    }
  });

  it("indexes contiguously and puts the outer ring first", () => {
    const slots = fixedRingSlots(27, [0.44, 0.315]);
    expect(slots.map(s => s.index)).toEqual(slots.map((_, i) => i));
    expect(slots[0].radius).toBe(0.44);
    expect(slots[slots.length - 1].radius).toBe(0.315);
  });
});
