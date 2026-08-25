import { describe, expect, it } from "vitest";
import { normalizeJourneyPortalConfig, normalizeJourneyPortalShape } from "./JourneyPortal";
import { CUSTOM_PORTAL_SHAPES } from "./portalShapes";

describe("Journey Portal normalization", () => {
  it("accepts known organic shapes and rejects unknown ones", () => {
    expect(normalizeJourneyPortalShape("rift")).toBe("rift");
    expect(normalizeJourneyPortalShape("rectangle")).toBe("breach");
  });

  it("keeps embed controls inside performance-safe bounds", () => {
    expect(normalizeJourneyPortalConfig({ palette: 99, intensity: 4, cadenceMs: 100 })).toMatchObject({
      palette: 5,
      intensity: 1,
      cadenceMs: 4_800,
    });
    expect(normalizeJourneyPortalConfig({ palette: -4, intensity: -1, cadenceMs: 99_000 })).toMatchObject({
      palette: 0,
      intensity: 0,
      cadenceMs: 9_500,
    });
  });

  it("ships a varied twelve-shape custom portal atlas", () => {
    const clips = Object.values(CUSTOM_PORTAL_SHAPES);
    expect(clips).toHaveLength(12);
    expect(new Set(clips).size).toBe(12);
    clips.forEach(clip => {
      expect(clip).toMatch(/^polygon\(/);
      expect(clip.split(",").length).toBeGreaterThanOrEqual(20);
    });
  });
});
