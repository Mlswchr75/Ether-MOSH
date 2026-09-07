import { describe, expect, it } from "vitest";
import {
  ALL_STATION,
  availableStations,
  createRadioRotation,
  radioFromUrl,
  resolveStation,
} from "./radio";
import type { ShowcaseTrack } from "./trackPlayer";

/**
 * A station runs for hours with nobody watching it. The tests that matter are
 * the ones about that: a rotation that quietly starves half the library, or a
 * URL typo that answers with silence, is only ever discovered by the audience.
 */

const track = (id: string, tags?: string[]): ShowcaseTrack => ({
  id, url: `/audio/${id}.mp3`, title: id, artist: "MOSH", ...(tags ? { tags } : {}),
});

const LIBRARY = [
  track("a", ["flow"]),
  track("b", ["flow", "unreleased"]),
  track("c"),
  track("d", ["Unreleased"]),
];

const U = (path: string) => `https://ether-mosh.online${path}`;

describe("radioFromUrl", () => {
  it("is off for ordinary pages", () => {
    expect(radioFromUrl(U("/")).active).toBe(false);
    expect(radioFromUrl(U("/edit")).active).toBe(false);
    expect(radioFromUrl(U("/edit?overlay=1")).active).toBe(false);
  });

  it("activates on the /radio path and on ?radio=1 anywhere", () => {
    expect(radioFromUrl(U("/radio")).active).toBe(true);
    expect(radioFromUrl(U("/radio/")).active).toBe(true);
    for (const v of ["1", "true", "on", "yes", ""]) {
      expect(radioFromUrl(U(`/edit?radio=${v}`)).active, v).toBe(true);
    }
  });

  it("lets an explicit ?radio=0 neuter a /radio bookmark", () => {
    expect(radioFromUrl(U("/radio?radio=0")).active).toBe(false);
    expect(radioFromUrl(U("/radio?radio=false")).active).toBe(false);
  });

  it("carries the station and the HUD switch", () => {
    const c = radioFromUrl(U("/radio?station=FLOW&hud=0"));
    expect(c.station).toBe("flow");
    expect(c.hud).toBe(false);
    expect(radioFromUrl(U("/radio")).station).toBe(ALL_STATION);
    expect(radioFromUrl(U("/radio")).hud).toBe(true);
  });

  it("never throws on junk", () => {
    expect(radioFromUrl("not a url").active).toBe(false);
    expect(radioFromUrl("").active).toBe(false);
  });
});

describe("resolveStation", () => {
  it("plays the whole library by default", () => {
    expect(resolveStation(ALL_STATION, LIBRARY).tracks).toHaveLength(4);
  });

  it("filters on a tag, case-insensitively", () => {
    expect(resolveStation("flow", LIBRARY).tracks.map(t => t.id)).toEqual(["a", "b"]);
    expect(resolveStation("unreleased", LIBRARY).tracks.map(t => t.id)).toEqual(["b", "d"]);
  });

  it("falls back to the whole library rather than to silence", () => {
    const resolved = resolveStation("typo", LIBRARY);
    expect(resolved.fellBack).toBe(true);
    expect(resolved.id).toBe(ALL_STATION);
    expect(resolved.tracks).toHaveLength(4);
  });

  it("lists the tags a station picker could offer", () => {
    expect(availableStations(LIBRARY)).toEqual([ALL_STATION, "flow", "unreleased"]);
  });
});

describe("createRadioRotation", () => {
  it("plays every track once before repeating any", () => {
    const rotation = createRadioRotation(LIBRARY);
    const cycle = [rotation.next(), rotation.next(), rotation.next(), rotation.next()];
    expect(new Set(cycle.map(t => t.id)).size).toBe(4);
  });

  it("never plays the same track twice in a row across a reshuffle", () => {
    // Deterministic and adversarial: this rand always shuffles to the same
    // order, so without the re-cut the deck boundary would repeat every cycle.
    const rotation = createRadioRotation(LIBRARY, { rand: () => 0.999999 });
    let previous = "";
    for (let i = 0; i < 40; i++) {
      const id = rotation.next().id;
      expect(id, `play ${i}`).not.toBe(previous);
      previous = id;
    }
  });

  it("peeks at the next track without consuming it", () => {
    const rotation = createRadioRotation(LIBRARY);
    const peeked = rotation.peek();
    expect(rotation.next().id).toBe(peeked.id);
  });

  it("survives a one-track station", () => {
    const rotation = createRadioRotation([track("only")]);
    expect(rotation.next().id).toBe("only");
    expect(rotation.next().id).toBe("only");
  });

  it("opens on a requested track without dealing it twice", () => {
    const rotation = createRadioRotation(LIBRARY, { startWith: "c" });
    expect(rotation.next().id).toBe("c");
    const rest = [rotation.next(), rotation.next(), rotation.next()].map(t => t.id);
    expect(rest).not.toContain("c");
    expect(new Set(rest).size).toBe(3);
  });

  it("refuses an empty rotation loudly rather than dying mid-broadcast", () => {
    expect(() => createRadioRotation([])).toThrow();
  });
});
