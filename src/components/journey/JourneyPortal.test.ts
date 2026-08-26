import { describe, expect, it } from "vitest";
import { normalizeJourneyPortalConfig, normalizeJourneyPortalShape } from "./JourneyPortal";
import { createOrganicClipPaths, parsePolygonClip } from "./organicClip";
import { CUSTOM_PORTAL_SHAPES, JOURNEY_PORTAL_CLIPS } from "./portalShapes";

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

  it("turns every portal polygon into compatible animated organic paths", () => {
    [...Object.values(CUSTOM_PORTAL_SHAPES), ...Object.values(JOURNEY_PORTAL_CLIPS)].forEach((clip, index) => {
      const points = parsePolygonClip(clip);
      const paths = createOrganicClipPaths(clip, 1987 + index);
      expect(points.length).toBeGreaterThanOrEqual(15);
      expect(paths).toHaveLength(4);
      expect(new Set(paths).size).toBe(3);
      const commandCounts = paths.map(path => (path.match(/ C/g) ?? []).length);
      expect(new Set(commandCounts)).toEqual(new Set([points.length]));
    });
  });
});
