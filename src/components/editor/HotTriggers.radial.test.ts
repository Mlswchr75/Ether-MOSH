import { describe, expect, it } from "vitest";
import { normalizeRadialDegrees, radialIndexForAngle, radialTriggerIndex } from "./HotTriggers";

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
});
