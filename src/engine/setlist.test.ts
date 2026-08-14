import { describe, expect, it } from "vitest";
import {
  SETLIST_SLOTS,
  cueCount,
  cueFromUrl,
  exportSetlist,
  importSetlist,
  setlistFilename,
  setlistToJson,
} from "./setlist";
import { EFFECTS_BY_ID } from "./effects";
import type { Layer } from "@/store/types";

/**
 * A setlist is carried to a venue and loaded minutes before a show. The tests
 * that matter are the ones about surviving that: a damaged file must cost one
 * cue, never the set.
 */

function layerOf(effectId: string, opacity = 0.8): Layer {
  const def = EFFECTS_BY_ID[effectId];
  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = p.default;
  return {
    id: "x", effectId, hidden: false, locked: false, opacity, blend: "normal",
    params,
    mods: Object.fromEntries(def.params.map(p => [p.key, null])),
    audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
  };
}

const sparseSlots = () => {
  const slots: (Layer[] | null)[] = new Array(SETLIST_SLOTS).fill(null);
  slots[0] = [layerOf("rgbShift"), layerOf("bloom", 0.4)];
  slots[3] = [layerOf("vignette")];
  slots[8] = [layerOf("kaleidoscope")];
  return slots;
};

describe("setlist round trip", () => {
  it("preserves cues and their positions", () => {
    const back = importSetlist(setlistToJson(exportSetlist(sparseSlots(), "Friday")))!;
    expect(back).not.toBeNull();
    expect(back.name).toBe("Friday");
    expect(back.slots).toHaveLength(SETLIST_SLOTS);
    expect(back.slots[0]!.map(l => l.effectId)).toEqual(["rgbShift", "bloom"]);
    expect(back.slots[3]!.map(l => l.effectId)).toEqual(["vignette"]);
    expect(back.slots[8]!.map(l => l.effectId)).toEqual(["kaleidoscope"]);
  });

  it("keeps empty slots empty", () => {
    const back = importSetlist(setlistToJson(exportSetlist(sparseSlots())))!;
    for (const i of [1, 2, 4, 5, 6, 7]) expect(back.slots[i], `slot ${i}`).toBeNull();
    expect(cueCount(back.slots)).toBe(3);
  });

  it("preserves layer settings through the trip", () => {
    const back = importSetlist(setlistToJson(exportSetlist(sparseSlots())))!;
    expect(back.slots[0]![1].opacity).toBeCloseTo(0.4, 2);
  });

  it("preserves explicit grade and finish roles through export and import", () => {
    const slots: (Layer[] | null)[] = new Array(SETLIST_SLOTS).fill(null);
    slots[0] = [layerOf("filmicTone"), layerOf("bloom")];
    slots[0][0].role = "grade";
    slots[0][1].role = "finish";

    const back = importSetlist(setlistToJson(exportSetlist(slots)))!;
    expect(back.slots[0]!.map(layer => layer.role)).toEqual(["grade", "finish"]);
  });

  it("handles a completely empty rig", () => {
    const back = importSetlist(setlistToJson(exportSetlist(new Array(SETLIST_SLOTS).fill(null))))!;
    expect(back.slots.every(s => s === null)).toBe(true);
    expect(cueCount(back.slots)).toBe(0);
  });
});

describe("setlist import robustness", () => {
  it("always returns nine slots regardless of what the file held", () => {
    const short = importSetlist(JSON.stringify({ v: 1, name: "s", cues: [null, null] }))!;
    expect(short.slots).toHaveLength(SETLIST_SLOTS);
    const long = importSetlist(JSON.stringify({ v: 1, name: "l", cues: new Array(50).fill(null) }))!;
    expect(long.slots).toHaveLength(SETLIST_SLOTS);
  });

  it("drops a corrupted cue without losing the rest of the set", () => {
    // The property that matters at a venue: one bad cue costs one cue.
    const set = exportSetlist(sparseSlots());
    set.cues[0] = "!!!not-a-valid-preset!!!";
    const back = importSetlist(setlistToJson(set))!;
    expect(back).not.toBeNull();
    expect(back.slots[0]).toBeNull();
    expect(back.slots[3]!.map(l => l.effectId)).toEqual(["vignette"]);
    expect(back.slots[8]).not.toBeNull();
  });

  it("rejects a newer format rather than half-reading it", () => {
    expect(importSetlist(JSON.stringify({ v: 99, cues: [] }))).toBeNull();
  });

  it("never throws on junk", () => {
    for (const j of ["", "{", "null", "[]", "12", '{"v":1}', '{"v":1,"cues":"no"}', "a".repeat(3000)]) {
      expect(() => importSetlist(j)).not.toThrow();
    }
  });

  it("falls back to a usable name", () => {
    const back = importSetlist(JSON.stringify({ v: 1, name: "   ", cues: [] }))!;
    expect(back.name).toBeTruthy();
  });
});

describe("cue deep links", () => {
  it("reads 1-based cue numbers as printed on a controller", () => {
    expect(cueFromUrl("https://x.dev/?cue=1")).toBe(0);
    expect(cueFromUrl("https://x.dev/?cue=9")).toBe(8);
  });

  it("refuses out-of-range and nonsense", () => {
    for (const q of ["cue=0", "cue=10", "cue=-2", "cue=abc", "cue="]) {
      expect(cueFromUrl(`https://x.dev/?${q}`), q).toBeNull();
    }
  });

  it("returns null when no cue is present, and never throws", () => {
    expect(cueFromUrl("https://x.dev/")).toBeNull();
    expect(() => cueFromUrl("not a url")).not.toThrow();
    expect(cueFromUrl("not a url")).toBeNull();
  });
});

describe("setlist filenames", () => {
  it("sanitises a name into something a filesystem accepts", () => {
    expect(setlistFilename('Friday // "Warehouse" set?')).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("survives a name with nothing usable in it", () => {
    expect(setlistFilename("///")).toContain("mosh-set");
  });

  it("uses an identifiable extension", () => {
    expect(setlistFilename("gig")).toMatch(/\.moshset\.json$/);
  });
});
