import { describe, expect, it } from "vitest";
import { mapOverlayReactions, smoothReactionValue } from "./reactions";
import type { OverlayReaction } from "./types";

const reaction = (patch: Partial<OverlayReaction> = {}): OverlayReaction => ({
  id: "r1",
  source: "bass",
  target: "scale",
  amount: 1,
  smoothing: 0.25,
  invert: false,
  ...patch,
});

const audio = { bass: 1, mid: 0.5, treble: 0.25, overall: 0.75, beat: 1 };

describe("overlay reactions", () => {
  it("maps bass to scale", () => {
    expect(mapOverlayReactions([reaction()], audio).scale).toBeGreaterThan(1);
  });

  it("supports negative mappings", () => {
    expect(mapOverlayReactions([reaction({ target: "rotation", amount: -1 })], audio).rotation).toBeLessThan(0);
  });

  it("maps playback position into normalized range", () => {
    expect(mapOverlayReactions([reaction({ target: "playback-position", source: "mid" })], audio).playbackPosition).toBeCloseTo(0.5);
  });

  it("smooths toward the next value without overshoot", () => {
    const value = smoothReactionValue(0, 1, 0.75);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});
