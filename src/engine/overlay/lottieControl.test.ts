import { describe, expect, it } from "vitest";
import { normalizeSegment, resolveLottieReaction } from "./lottieControl";

describe("normalizeSegment", () => {
  it("orders and clamps segment percentages", () => {
    expect(normalizeSegment([0.9, 0.2])).toEqual([0.2, 0.9]);
    expect(normalizeSegment([-1, 2])).toEqual([0, 1]);
  });
});

describe("resolveLottieReaction", () => {
  it("maps reaction deltas to playback speed and normalized position", () => {
    expect(resolveLottieReaction(2, { playbackSpeed: 1.5, playbackPosition: 0.75 })).toEqual({ speed: 3, position: 0.75 });
  });

  it("clamps speed and position safely", () => {
    expect(resolveLottieReaction(4, { playbackSpeed: 10, playbackPosition: 2 })).toEqual({ speed: 8, position: 1 });
  });
});
