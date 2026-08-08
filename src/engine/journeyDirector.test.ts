import { describe, expect, it } from "vitest";
import {
  DISRUPT_CEILING_MS, DISRUPT_FLOOR_MS,
  moodFrom, nextDisruptionMs, nextHoldMs, pickDisruption,
  type DisruptionKind,
} from "./journeyDirector";
import { EMPTY_FRAME, SILENT_FEATURES, type AudioFeatures, type FrameStats, type Section } from "./journeyCore";

/**
 * Journey's whole promise is a pacing one: never predictable, never static.
 * Both halves are falsifiable, and both fail silently if they regress — a mode
 * that has quietly settled into a 6-second metronome still looks like it is
 * working. So the distribution is tested, not just the bounds.
 */

const SECTIONS: Section[] = ["intro", "build", "peak", "release"];

const features = (over: Partial<AudioFeatures> = {}): AudioFeatures =>
  ({ ...SILENT_FEATURES, energy: 0.4, ...over });
const frame = (over: Partial<FrameStats> = {}): FrameStats =>
  ({ ...EMPTY_FRAME, load: 0.35, ...over });

/** Deterministic RNG so a failure is reproducible rather than a flake. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const club = features({ bpm: 128, regularity: 0.85, density: 2.4, energy: 0.6 });
const drone = features({ bpm: 0, regularity: 0, density: 0.1, energy: 0.2 });

describe("the disruption guarantee", () => {
  it("never leaves the frame untouched for more than ten seconds", () => {
    // This is the promise. If it ever draws above the ceiling, some arrangement
    // somewhere sits dead on screen and the mode looks broken.
    const rand = rng(1);
    for (const section of SECTIONS) {
      for (const f of [club, drone, features({ energy: 1, density: 8 }), SILENT_FEATURES]) {
        for (let i = 0; i < 500; i++) {
          const ms = nextDisruptionMs(section, f, rand);
          expect(ms, `${section}`).toBeLessThanOrEqual(DISRUPT_CEILING_MS);
          expect(ms, `${section}`).toBeGreaterThanOrEqual(DISRUPT_FLOOR_MS);
        }
      }
    }
  });

  it("holds off long enough that a disruption reads as an event, not a strobe", () => {
    const rand = rng(2);
    for (let i = 0; i < 400; i++) {
      expect(nextDisruptionMs("peak", club, rand)).toBeGreaterThanOrEqual(2000);
    }
  });

  it("does not settle into a metronome", () => {
    /* A predictable disruption stops being a disruption — the eye learns the
       period within a minute. Spread has to be wide, not merely non-zero. */
    const rand = rng(3);
    const samples = Array.from({ length: 600 }, () => nextDisruptionMs("build", club, rand));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const sd = Math.sqrt(samples.reduce((a, v) => a + (v - mean) ** 2, 0) / samples.length);
    expect(sd / mean).toBeGreaterThan(0.2);
  });

  it("interferes more often at the peak than in the intro", () => {
    const rand = rng(4);
    const mean = (s: Section) => {
      const v = Array.from({ length: 400 }, () => nextDisruptionMs(s, club, rand));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean("peak")).toBeLessThan(mean("intro"));
  });

  it("interferes more often against busy material than against a drone", () => {
    const rand = rng(5);
    const mean = (f: AudioFeatures) => {
      const v = Array.from({ length: 400 }, () => nextDisruptionMs("build", f, rand));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean(club)).toBeLessThan(mean(drone));
  });
});

describe("composition pacing", () => {
  it("quantises to whole bars when there is a tempo to quantise to", () => {
    // 128 BPM → 1875ms per bar. Every hold must be a whole multiple of it, or
    // the change lands near the music rather than on it.
    const rand = rng(6);
    const bar = (60_000 / 128) * 4;
    for (let i = 0; i < 300; i++) {
      const ms = nextHoldMs("peak", club, rand);
      const bars = ms / bar;
      expect(Math.abs(bars - Math.round(bars)), `${ms}`).toBeLessThan(1e-6);
    }
  });

  it("falls back to seconds when the tempo is untrustworthy", () => {
    const rand = rng(7);
    // Should still produce sane, bounded holds rather than NaN or zero.
    for (let i = 0; i < 200; i++) {
      const ms = nextHoldMs("build", drone, rand);
      expect(ms).toBeGreaterThanOrEqual(2000);
      expect(ms).toBeLessThanOrEqual(60_000);
    }
  });

  it("has fat tails rather than clustering on one length", () => {
    /* Trimodal by design: uniform jitter around a mean produces a suspiciously
       even rhythm. Some holds must be genuinely short and some genuinely long. */
    const rand = rng(8);
    const v = Array.from({ length: 900 }, () => nextHoldMs("build", club, rand));
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    expect(v.filter(x => x < mean * 0.6).length).toBeGreaterThan(80);
    expect(v.filter(x => x > mean * 1.4).length).toBeGreaterThan(80);
  });

  it("cuts the arrangement faster at the peak", () => {
    const rand = rng(9);
    const mean = (s: Section) => {
      const v = Array.from({ length: 400 }, () => nextHoldMs(s, club, rand));
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean("peak")).toBeLessThan(mean("intro"));
  });

  it("stays bounded however extreme the input", () => {
    const rand = rng(10);
    for (const f of [
      features({ bpm: 200, regularity: 1, density: 12, energy: 1 }),
      features({ bpm: 60, regularity: 0.3, density: 0.01, energy: 0 }),
      SILENT_FEATURES,
    ]) {
      for (const s of SECTIONS) {
        for (let i = 0; i < 200; i++) {
          const ms = nextHoldMs(s, f, rand);
          expect(Number.isFinite(ms)).toBe(true);
          expect(ms).toBeGreaterThanOrEqual(2000);
          expect(ms).toBeLessThanOrEqual(60_000);
        }
      }
    }
  });
});

describe("choosing a disruption", () => {
  const kinds = (f: AudioFeatures, fr: FrameStats, s: Section, n = 600) => {
    const rand = rng(11);
    const counts: Partial<Record<DisruptionKind, number>> = {};
    for (let i = 0; i < n; i++) {
      const k = pickDisruption(s, fr, f, rand).kind;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  };

  it("keeps every kind reachable, so the mode never has one trick", () => {
    const c = kinds(club, frame(), "build");
    for (const k of ["churn", "surge", "blend", "swap", "region"] as DisruptionKind[]) {
      expect(c[k] ?? 0, k).toBeGreaterThan(0);
    }
  });

  it("rations the full surge — it is punctuation, not a state", () => {
    // Constant surge is exactly what made the old mode unreadable.
    const c = kinds(club, frame(), "peak", 1000);
    expect((c.surge ?? 0) / 1000).toBeLessThan(0.25);
  });

  it("prefers alterations that don't add ink when the frame is loaded", () => {
    const loaded = kinds(club, frame({ load: 0.9, clipping: 0.8 }), "peak", 800);
    const clear = kinds(club, frame({ load: 0.2 }), "peak", 800);
    const additive = (c: Partial<Record<DisruptionKind, number>>) => (c.churn ?? 0) + (c.surge ?? 0);
    expect(additive(loaded)).toBeLessThan(additive(clear));
  });

  it("throws parameters less far when the frame is already full", () => {
    const rand = rng(12);
    const mean = (fr: FrameStats) => {
      const v = Array.from({ length: 300 }, () => pickDisruption("peak", fr, club, rand).violence);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(mean(frame({ load: 0.9 }))).toBeLessThan(mean(frame({ load: 0.2 })));
  });

  it("always throws far enough to be visible", () => {
    // A disruption nobody can see did not happen, and the guarantee is about
    // the frame visibly changing.
    const rand = rng(13);
    for (const s of SECTIONS) {
      for (const fr of [frame({ load: 0 }), frame({ load: 1, clipping: 1 })]) {
        for (let i = 0; i < 200; i++) {
          const d = pickDisruption(s, fr, SILENT_FEATURES, rand);
          expect(d.violence).toBeGreaterThanOrEqual(0.18);
          expect(d.violence).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("gives a surge a bounded burst and everything else none", () => {
    const rand = rng(14);
    for (let i = 0; i < 500; i++) {
      const d = pickDisruption("peak", frame(), club, rand);
      if (d.kind === "surge") {
        expect(d.burstMs).toBeGreaterThan(300);
        expect(d.burstMs).toBeLessThan(1400);
      } else {
        expect(d.burstMs).toBe(0);
      }
    }
  });

  it("explains itself", () => {
    const d = pickDisruption("peak", frame({ load: 0.9 }), club, rng(15));
    expect(d.reason).toContain("violence");
    expect(d.reason).toContain("loaded");
  });
});

describe("mood translation", () => {
  it("keeps every axis in range for any input", () => {
    for (const f of [club, drone, SILENT_FEATURES, features({ energy: 1, weight: 1, brightness: 1 })]) {
      for (const fr of [frame({ load: 0 }), frame({ load: 1, saturation: 1, contrast: 1 })]) {
        const m = moodFrom(f, fr, 1, 1);
        for (const [k, v] of Object.entries(m)) {
          expect(Number.isFinite(v), k).toBe(true);
          expect(v, k).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("reads a sudden jump in motion as a scene change", () => {
    // Movement well above its own baseline — the same definition Smart uses.
    expect(moodFrom(club, frame(), 0.9, 0.1).sceneChange).toBeGreaterThan(0.5);
    expect(moodFrom(club, frame(), 0.2, 0.2).sceneChange).toBe(0);
  });

  it("carries bass weight and spectral brightness through to the axes", () => {
    const heavy = moodFrom(features({ weight: 0.8, brightness: 0.2, energy: 0.7 }), frame(), 0.3, 0.3);
    const bright = moodFrom(features({ weight: 0.2, brightness: 0.8, energy: 0.7 }), frame(), 0.3, 0.3);
    expect(heavy.bass).toBeGreaterThan(bright.bass);
    expect(bright.treble).toBeGreaterThan(heavy.treble);
  });
});
