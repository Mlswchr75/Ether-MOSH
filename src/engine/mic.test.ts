import { describe, expect, it } from "vitest";
import { MicAnalyzer } from "@/engine/mic";

describe("MicAnalyzer extended audio sources", () => {
  it("derives named frequency regions from the analyser bands", () => {
    const mic = new MicAnalyzer();
    mic.bands.set([
      0.2, 0.4, 0.6, 0.8,
      0.1, 0.3, 0.5, 0.7,
      0.2, 0.4, 0.6, 0.8,
      0.1, 0.3, 0.5, 0.7, 0.9, 1,
      0, 0, 0, 0, 0, 0,
    ]);
    mic.overallLevel = 0.42;

    expect(mic.subLevel).toBeCloseTo(0.3);
    expect(mic.kickLevel).toBeCloseTo(0.6);
    expect(mic.lowMidLevel).toBeCloseTo(0.4);
    expect(mic.highMidLevel).toBeCloseTo(0.5);
    expect(mic.presenceLevel).toBeCloseTo(0.5833333);
    expect(mic.energyLevel).toBe(0.42);
  });

  it("normalizes spectral centroid and supplies a quiet-signal fallback", () => {
    const mic = new MicAnalyzer();

    expect(mic.centroidLevel).toBe(0.4);

    mic.bands[23] = 1;
    expect(mic.centroidLevel).toBe(1);
  });
});
