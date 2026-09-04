import { describe, expect, it } from "vitest";
import {
  MASTER_CEILING,
  MASTER_FLOOR,
  bandsFrom,
  defaultAudioMap,
  masterDrive,
  masterGain,
} from "./audioMapping";

const bands = (over: Partial<Record<"bass" | "mid" | "treble" | "overall" | "beat", number>> = {}) => ({
  bass: 0, mid: 0, treble: 0, overall: 0, beat: 0, ...over,
});

describe("defaultAudioMap", () => {
  it("routes params by what they do, not by which effect owns them", () => {
    expect(defaultAudioMap("amount").source).toBe("bass");
    expect(defaultAudioMap("scale").source).toBe("beat");
    expect(defaultAudioMap("hue").source).toBe("treble");
    expect(defaultAudioMap("warp").source).toBe("mid");
    expect(defaultAudioMap("speed").source).toBe("overall");
  });

  it("matches on the name however it is cased", () => {
    expect(defaultAudioMap("Amount")).toEqual(defaultAudioMap("amount"));
  });

  it("leaves nothing fully static — an unrecognised param still breathes", () => {
    const map = defaultAudioMap("qqzzx");
    expect(map.source).toBe("overall");
    expect(map.amount).toBeGreaterThan(0);
  });
});

describe("bandsFrom", () => {
  it("takes the louder of the two overall readings", () => {
    const mic = { bassLevel: 0.1, midLevel: 0.2, trebleLevel: 0.3, overallLevel: 0.4, level: () => 0.7 };
    expect(bandsFrom(mic, 0.5)).toEqual({ bass: 0.1, mid: 0.2, treble: 0.3, overall: 0.7, beat: 0.5 });
  });
});

describe("masterDrive", () => {
  it("reads silence as nothing and a loud room as everything", () => {
    expect(masterDrive(bands())).toBe(0);
    expect(masterDrive(bands({ overall: 1, beat: 1 }))).toBe(1);
  });

  /* A master that moved on beats alone would pump the entire stack in and out
     on every kick. The beat is here to put an edge on the transient. */
  it("leans on the envelope rather than the beat", () => {
    expect(masterDrive(bands({ overall: 0.6 }))).toBeGreaterThan(masterDrive(bands({ beat: 0.6 })));
  });

  it("never leaves 0..1, however hot the input", () => {
    expect(masterDrive(bands({ overall: 4, beat: 4 }))).toBe(1);
    expect(masterDrive(bands({ overall: -2, beat: -2 }))).toBe(0);
  });
});

describe("masterGain", () => {
  /* The guarantee the whole feature rests on: a user who never touches
     reactivity gets exactly the opacity the director set. */
  it("is the fader itself at zero depth, whatever the room is doing", () => {
    for (const drive of [0, 0.5, 1]) {
      expect(masterGain(1, 0, drive)).toBe(1);
      expect(masterGain(0.4, 0, drive)).toBeCloseTo(0.4);
    }
  });

  it("modulates around the fader rather than on top of it", () => {
    // Silence pulls under the parked value, a loud room pushes over it — so
    // turning reactivity up trades a fixed level for a moving one at roughly
    // the same centre, instead of just making everything louder.
    expect(masterGain(1, 1, 0)).toBeCloseTo(MASTER_FLOOR);
    expect(masterGain(1, 1, 1)).toBeCloseTo(MASTER_CEILING);
    expect(MASTER_FLOOR).toBeLessThan(1);
    expect(MASTER_CEILING).toBeGreaterThan(1);
  });

  it("never mutes the stack outright, however quiet the room", () => {
    expect(masterGain(1, 1, 0)).toBeGreaterThan(0);
  });

  /* Reactivity re-scales the fader, it does not replace it — so at any given
     room level the fader still decides how much stack there is. (It does not
     follow that a low fader always sits under a high one: a peak on a fader at
     30% can exceed silence on one at 100%, which is the point of handing the
     master to the room at all.) */
  it("keeps the fader in charge at any one room level", () => {
    for (const drive of [0, 0.35, 0.8, 1]) {
      expect(masterGain(0.3, 1, drive)).toBeLessThan(masterGain(1, 1, drive));
      expect(masterGain(0.3, 0.5, drive)).toBeLessThan(masterGain(1, 0.5, drive));
    }
  });

  it("clamps depth and drive rather than trusting its callers", () => {
    expect(masterGain(1, 5, 5)).toBeCloseTo(MASTER_CEILING);
    expect(masterGain(1, -3, -3)).toBeCloseTo(1);
  });

  it("rises monotonically with the room", () => {
    let previous = -Infinity;
    for (let drive = 0; drive <= 1.0001; drive += 0.1) {
      const gain = masterGain(1, 0.6, drive);
      expect(gain).toBeGreaterThan(previous);
      previous = gain;
    }
  });
});
