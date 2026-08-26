import { describe, expect, it } from "vitest";
import {
  FORGE_JOURNEY_PREVIEW_MS,
  elapsedForgeJourneyMs,
  formatForgeJourneyRemaining,
  readForgeJourneyPreview,
  remainingForgeJourneyMs,
  startForgeJourneyPreview,
  stopForgeJourneyPreview,
} from "./forgeJourneyPreview";

describe("Forge Journey preview", () => {
  it("allows five minutes total and stops exactly at the limit", () => {
    const started = startForgeJourneyPreview({ usedMs: 0, startedAt: null }, 1_000);
    expect(remainingForgeJourneyMs(started, 61_000)).toBe(FORGE_JOURNEY_PREVIEW_MS - 60_000);
    expect(elapsedForgeJourneyMs(started, 1_000 + FORGE_JOURNEY_PREVIEW_MS + 1)).toBe(FORGE_JOURNEY_PREVIEW_MS);
    expect(remainingForgeJourneyMs(started, 1_000 + FORGE_JOURNEY_PREVIEW_MS + 1)).toBe(0);
  });

  it("persists only active time across separate preview runs", () => {
    const first = stopForgeJourneyPreview(startForgeJourneyPreview({ usedMs: 0, startedAt: null }, 1_000), 31_000);
    const second = startForgeJourneyPreview(first, 100_000);
    expect(stopForgeJourneyPreview(second, 145_000)).toEqual({ usedMs: 75_000, startedAt: null });
  });

  it("rejects malformed browser storage and formats the countdown", () => {
    expect(readForgeJourneyPreview("not-json")).toEqual({ usedMs: 0, startedAt: null });
    expect(formatForgeJourneyRemaining(60_000)).toBe("1:00");
    expect(formatForgeJourneyRemaining(1)).toBe("0:01");
  });
});
