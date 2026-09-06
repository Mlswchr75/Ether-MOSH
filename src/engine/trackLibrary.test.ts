import { describe, expect, it } from "vitest";
import { pickTrackCue, SHOWCASE_TRACKS, TRACK_CUES } from "./trackPlayer";

describe("MOSH showcase library", () => {
  it("exposes every bundled audio track as a unique, safe local choice", () => {
    expect(SHOWCASE_TRACKS).toHaveLength(32);
    expect(new Set(SHOWCASE_TRACKS.map(track => track.id)).size).toBe(SHOWCASE_TRACKS.length);
    expect(new Set(SHOWCASE_TRACKS.map(track => track.url)).size).toBe(SHOWCASE_TRACKS.length);
    expect(SHOWCASE_TRACKS.every(track => track.url.startsWith("/audio/") && track.url.endsWith(".mp3"))).toBe(true);
  });

  it("saves two to five ordered musical cue points for every showcase track", () => {
    expect(Object.keys(TRACK_CUES).sort()).toEqual(SHOWCASE_TRACKS.map(track => track.id).sort());
    for (const track of SHOWCASE_TRACKS) {
      const cues = TRACK_CUES[track.id];
      expect(cues.length).toBeGreaterThanOrEqual(2);
      expect(cues.length).toBeLessThanOrEqual(5);
      expect(cues.every(cue => Number.isFinite(cue.at) && cue.at > 0)).toBe(true);
      expect(cues.map(cue => cue.at)).toEqual([...cues].map(cue => cue.at).sort((a, b) => a - b));
    }
  });

  it("does not immediately repeat the same cue for a song", () => {
    const first = TRACK_CUES.theme[0];
    expect(pickTrackCue("theme", () => 0, first.at)).toEqual(TRACK_CUES.theme[1]);
    expect(pickTrackCue("missing-track", () => 0)).toBeUndefined();
  });
});
