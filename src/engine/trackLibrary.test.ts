import { describe, expect, it } from "vitest";
import { SHOWCASE_TRACKS } from "./trackPlayer";

describe("MOSH showcase library", () => {
  it("exposes every bundled audio track as a unique, safe local choice", () => {
    expect(SHOWCASE_TRACKS).toHaveLength(23);
    expect(new Set(SHOWCASE_TRACKS.map(track => track.id)).size).toBe(SHOWCASE_TRACKS.length);
    expect(new Set(SHOWCASE_TRACKS.map(track => track.url)).size).toBe(SHOWCASE_TRACKS.length);
    expect(SHOWCASE_TRACKS.every(track => track.url.startsWith("/audio/") && track.url.endsWith(".mp3"))).toBe(true);
  });
});
