import { describe, expect, it } from "vitest";
import { normalizeJourneyPortalConfig, normalizeJourneyPortalShape } from "./JourneyPortal";

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
});
