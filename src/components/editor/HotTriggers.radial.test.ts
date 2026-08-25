import { describe, expect, it } from "vitest";
import {
  normalizeRadialDegrees,
  radialFlickThreshold,
  radialHoldJitterTolerance,
  radialIndexForAngle,
  radialTriggerIndex,
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

  it("uses flick distance to address both visible rings", () => {
    expect(radialTriggerIndex(0, 160, 25)).toBe(0);
    expect(radialTriggerIndex(0, 80, 25)).toBe(14);
    expect(radialTriggerIndex(90, 80, 25)).toBe(17);
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
});
