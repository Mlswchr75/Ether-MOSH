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
    for (const total of [8, 25, 27]) {
      for (const slot of radialSlotsFor(total)) {
        const radians = (slot.angleDeg - 90) * Math.PI / 180;
        const nx = Math.cos(radians) * slot.radius;
        const ny = Math.sin(radians) * slot.radius;
        expect(radialTriggerAt(nx, ny, total)).toBe(slot.index);
      }
    }
  });

  it("still addresses both rings, by radius rather than by pixel count", () => {
    const total = 27;
    const slots = radialSlotsFor(total);
    expect([...new Set(slots.map(s => s.radius))].sort((a, b) => b - a)).toEqual(MOBILE_RING_RADII);

    // Twelve o'clock on the outer radius is the first trigger.
    expect(radialTriggerAt(0, -MOBILE_RING_RADII[0], total)).toBe(0);

    // The inner ring is staggered half a step, so it has no slot at twelve —
    // that is the point of staggering, and it is why a point at the same
    // angle but a shorter radius reaches a different trigger entirely rather
    // than one hiding directly beneath the first.
    const inner = radialTriggerAt(0, -MOBILE_RING_RADII[1], total);
    expect(inner).toBeGreaterThan(0);
    expect(slots[inner].radius).toBe(MOBILE_RING_RADII[1]);
  });

  it("follows the wheel's rotation", () => {
    const total = 27;
    const slot = radialSlotsFor(total)[3];
    const radians = (slot.angleDeg + 30 - 90) * Math.PI / 180;
    expect(radialTriggerAt(Math.cos(radians) * slot.radius, Math.sin(radians) * slot.radius, total, 30))
      .toBe(slot.index);
  });

  it("declines the hub and the space beyond the outer ring", () => {
    expect(radialTriggerAt(0, 0, 27)).toBe(-1);
    expect(radialTriggerAt(0, -1.2, 27)).toBe(-1);
  });

  it("keeps every neighbour further apart than a 44px touch target", () => {
    // 328px is the wheel on a 390px-wide phone at 84vw — the tightest real
    // case. The previous fixed 14-outer/12-inner split left the inner ring's
    // slots ~50px apart, which is barely one target's width.
    expect(radialTightestSpacing(27, 328)).toBeGreaterThan(48);
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
    const total = 27;
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
    const total = 27;
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
