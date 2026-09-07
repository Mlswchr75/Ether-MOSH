import { describe, expect, it } from "vitest";
import { SHOWCASE_TRACKS } from "@/engine/trackPlayer";
import { knownRadioTracks, radioLink, radioRequest } from "./radioLinks";

describe("radio references", () => {
  it("round-trips a song and an ordered shared playlist", () => {
    const tracks = [SHOWCASE_TRACKS[4], SHOWCASE_TRACKS[2], SHOWCASE_TRACKS[8]];
    const url = radioLink({ tracks, name: "My mix & friends", track: tracks[1] });
    const parsed = radioRequest(url);
    expect(parsed.tracks.map(t => t.id)).toEqual(tracks.map(t => t.id));
    expect(parsed.track?.id).toBe(tracks[1].id);
    expect(parsed.name).toBe("My mix & friends");
  });
  it("rejects arbitrary URLs and unknown IDs while retaining valid tracks", () => {
    expect(knownRadioTracks(["https://evil.example/test.mp3", SHOWCASE_TRACKS[0].id, "<script>", SHOWCASE_TRACKS[0].id])).toEqual([SHOWCASE_TRACKS[0]]);
    expect(radioRequest("https://ether-mosh.online/radio?track=unknown").track).toBeUndefined();
  });
});
