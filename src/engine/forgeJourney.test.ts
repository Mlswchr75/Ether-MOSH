import { describe, expect, it } from "vitest";
import {
  EMPTY_FRAME, SILENT_FEATURES,
  analyseFrame, barMs, centroidOf, classifyStyle, nextSection, planMove, tempoFrom,
  type AudioFeatures, type FrameStats,
} from "./forgeJourney";

/**
 * The journey mode runs unattended for long stretches — that is the whole
 * pitch. So the failures that matter are the slow ones: a director that
 * ratchets intensity until everything is a smear, or that cuts off-beat, or
 * that reports a tempo it does not have. Those are all decidable from pure
 * functions, which is why the judgement lives outside the driver.
 */

const features = (over: Partial<AudioFeatures> = {}): AudioFeatures =>
  ({ ...SILENT_FEATURES, energy: 0.4, ...over });

const frame = (over: Partial<FrameStats> = {}): FrameStats =>
  ({ ...EMPTY_FRAME, load: 0.35, ...over });

/** Onsets at a fixed BPM, optionally jittered. */
function beats(bpm: number, count: number, jitterMs = 0, seed = 1) {
  const period = 60_000 / bpm;
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i * period + (rnd() - 0.5) * 2 * jitterMs);
  return out;
}

describe("spectral centroid", () => {
  it("sits low when energy is in the bottom bins", () => {
    const b = new Float32Array(24);
    b[1] = 1; b[2] = 0.8;
    expect(centroidOf(b)).toBeLessThan(0.2);
  });

  it("sits high when energy is in the top bins", () => {
    const b = new Float32Array(24);
    b[21] = 1; b[22] = 0.9;
    expect(centroidOf(b)).toBeGreaterThan(0.8);
  });

  it("returns a neutral value for silence rather than dividing by zero", () => {
    expect(centroidOf(new Float32Array(24))).toBe(0.4);
    expect(Number.isFinite(centroidOf(new Float32Array(0)))).toBe(true);
  });
});

describe("tempo", () => {
  it("recovers a steady tempo", () => {
    expect(tempoFrom(beats(128, 20)).bpm).toBe(128);
  });

  it("folds a half-time reading into the musical range", () => {
    // 64 BPM onsets are the same grid as 128 — reporting 64 would halve every
    // bar length and make the mode cut at the wrong rate.
    expect(tempoFrom(beats(64, 20)).bpm).toBe(128);
  });

  it("rates a drum machine as more regular than a loose player", () => {
    const tight = tempoFrom(beats(128, 24, 3)).regularity;
    const loose = tempoFrom(beats(128, 24, 70)).regularity;
    expect(tight).toBeGreaterThan(loose);
    expect(tight).toBeGreaterThan(0.7);
  });

  it("survives a missed onset instead of calling the track sloppy", () => {
    // A dropped beat leaves a double-length gap. Folding onto multiples of the
    // median is what stops that reading as jitter.
    const b = beats(128, 24, 2);
    b.splice(10, 1);
    const r = tempoFrom(b);
    expect(r.bpm).toBe(128);
    expect(r.regularity).toBeGreaterThan(0.6);
  });

  it("declines to guess from too few onsets", () => {
    expect(tempoFrom([]).bpm).toBe(0);
    expect(tempoFrom([0, 500]).bpm).toBe(0);
  });
});

describe("style reading", () => {
  it("calls silence silence rather than ambient", () => {
    // Conflating them makes the mode look broken before the music starts.
    expect(classifyStyle(features({ energy: 0.01 })).style).toBe("silence");
  });

  it("reads an unpulsed field as ambient", () => {
    expect(classifyStyle(features({ density: 0.2, bpm: 0, energy: 0.3 })).style).toBe("ambient");
  });

  it("separates techno from house by spectrum, not tempo", () => {
    const base = { bpm: 128, regularity: 0.8, density: 2.2, energy: 0.5 };
    expect(classifyStyle(features({ ...base, brightness: 0.3, weight: 0.55 })).style).toBe("techno");
    expect(classifyStyle(features({ ...base, brightness: 0.62, weight: 0.35 })).style).toBe("house");
  });

  it("reads fast regular material as breaks", () => {
    expect(classifyStyle(features({
      bpm: 172, regularity: 0.6, density: 3, energy: 0.6,
    })).style).toBe("breaks");
  });

  it("reads slow bass-heavy material as hiphop", () => {
    expect(classifyStyle(features({
      bpm: 92, regularity: 0.5, density: 1.6, weight: 0.55, energy: 0.45,
    })).style).toBe("hiphop");
  });

  it("reads a confident tempo with human drift as a band", () => {
    expect(classifyStyle(features({
      bpm: 138, regularity: 0.35, density: 2.4, weight: 0.3, brightness: 0.5, energy: 0.5,
    })).style).toBe("band");
  });

  it("never claims a BPM it does not have", () => {
    const label = classifyStyle(features({ bpm: 0, density: 0.2 })).label;
    expect(label).not.toMatch(/BPM/);
  });

  it("reports the BPM it does have", () => {
    const label = classifyStyle(features({ bpm: 124, regularity: 0.8, density: 2 })).label;
    expect(label).toContain("124 BPM");
  });
});

describe("frame analysis", () => {
  const fill = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    return d;
  };

  it("reports a flat frame as unloaded", () => {
    expect(analyseFrame(fill(64, 64, () => [90, 90, 110]), null, 64, 64).load).toBeLessThan(0.15);
  });

  it("reports a dense noisy frame as loaded", () => {
    const noisy = fill(64, 64, () => {
      const v = Math.random() * 255;
      return [v, 255 - v, (v * 3) % 255];
    });
    expect(analyseFrame(noisy, null, 64, 64).load).toBeGreaterThan(0.5);
  });

  it("measures motion between frames and zero without a previous one", () => {
    const a = fill(64, 64, (x) => [x * 3, 40, 90]);
    const b = fill(64, 64, (x) => [255 - x * 3, 200, 20]);
    expect(analyseFrame(b, a, 64, 64).motion).toBeGreaterThan(0.2);
    expect(analyseFrame(b, null, 64, 64).motion).toBe(0);
  });

  it("refuses a degenerate buffer rather than reporting a black frame", () => {
    expect(analyseFrame(new Uint8ClampedArray(0), null, 64, 64)).toEqual(EMPTY_FRAME);
    expect(analyseFrame(new Uint8ClampedArray(4), null, 1, 1)).toEqual(EMPTY_FRAME);
  });

  it("keeps every measurement in range", () => {
    for (const d of [
      fill(48, 48, () => [0, 0, 0]),
      fill(48, 48, () => [255, 255, 255]),
      fill(48, 48, (x, y) => [(x * y) % 256, x * 5, y * 5]),
    ]) {
      const s = analyseFrame(d, null, 48, 48);
      for (const [k, v] of Object.entries(s)) {
        expect(v, k).toBeGreaterThanOrEqual(0);
        expect(v, k).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("sections", () => {
  it("promotes on a real lift in energy whatever the clock says", () => {
    expect(nextSection("intro", 0.5, 0.3, 200)).toBe("build");
  });

  it("reaches the peak on a large lift", () => {
    expect(nextSection("build", 0.7, 0.4, 500)).toBe("peak");
  });

  it("treats a sustained fall from the peak as a breakdown", () => {
    expect(nextSection("peak", 0.2, 0.32, 6000)).toBe("release");
  });

  it("holds rather than flickering on noise", () => {
    expect(nextSection("build", 0.31, 0.3, 500)).toBe("build");
  });

  it("moves on eventually even when the energy never changes", () => {
    // Otherwise a steady loop would sit in intro forever.
    expect(nextSection("intro", 0.2, 0.2, 20_000)).toBe("build");
    expect(nextSection("peak", 0.3, 0.3, 30_000)).toBe("release");
  });
});

describe("planning a move", () => {
  const plan = (f: AudioFeatures, fr: FrameStats, s: Parameters<typeof planMove>[3] = "build") =>
    planMove(classifyStyle(f), f, fr, s, () => 0.5);

  it("holds whole bars when the tempo is trustworthy", () => {
    const f = features({ bpm: 120, regularity: 0.8, density: 2.2 });
    // 120 BPM → 2s per bar. Peak holds 2 bars.
    expect(barMs(f)).toBeCloseTo(2000, 5);
    expect(plan(f, frame(), "peak").holdMs).toBeCloseTo(4000, 5);
  });

  it("refuses to quantise to a tempo it does not trust", () => {
    expect(barMs(features({ bpm: 128, regularity: 0.1 }))).toBeNull();
    expect(barMs(features({ bpm: 0, regularity: 0.9 }))).toBeNull();
  });

  it("cuts faster at the peak than in the intro", () => {
    const f = features({ bpm: 128, regularity: 0.8, density: 2.4 });
    expect(plan(f, frame(), "peak").holdMs).toBeLessThan(plan(f, frame(), "intro").holdMs);
  });

  it("holds slowly against unpulsed material", () => {
    // Cutting fast over a drone reads as a fault, not a decision.
    const amb = plan(features({ density: 0.1, bpm: 0, energy: 0.2 }), frame());
    const club = plan(features({ bpm: 128, regularity: 0.85, density: 2.4 }), frame());
    expect(amb.holdMs).toBeGreaterThan(club.holdMs);
  });

  it("eases off when the frame is already loaded", () => {
    // This is the guard against the slow ratchet into grey mud.
    const f = features({ bpm: 128, regularity: 0.8, density: 2.4, energy: 0.6 });
    const loaded = plan(f, frame({ load: 0.95, detail: 0.95, clipping: 0.8 }), "peak");
    const clear = plan(f, frame({ load: 0.2 }), "peak");
    expect(loaded.intensity).toBeLessThan(clear.intensity);
  });

  it("pushes when the frame has gone thin", () => {
    const f = features({ energy: 0.3, bpm: 120, regularity: 0.7, density: 2 });
    expect(plan(f, frame({ load: 0.05 })).intensity)
      .toBeGreaterThan(plan(f, frame({ load: 0.4 })).intensity);
  });

  it("never leaves the usable range, however extreme the inputs", () => {
    for (const f of [
      features({ energy: 1, bpm: 180, regularity: 1, density: 8, weight: 1, brightness: 1, dynamics: 1 }),
      features({ energy: 0, bpm: 0, regularity: 0, density: 0, weight: 0, brightness: 0 }),
    ]) {
      for (const fr of [frame({ load: 0 }), frame({ load: 1, clipping: 1, detail: 1 })]) {
        for (const s of ["intro", "build", "peak", "release"] as const) {
          const m = planMove(classifyStyle(f), f, fr, s, () => 0.5);
          expect(m.intensity).toBeGreaterThan(0);
          expect(m.intensity).toBeLessThanOrEqual(1);
          expect(m.holdMs).toBeGreaterThanOrEqual(1400);
          expect(m.holdMs).toBeLessThanOrEqual(40_000);
          for (const w of Object.values(m.bias)) expect(w).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("leans on corruption for heavy material and atmosphere for quiet material", () => {
    const heavy = plan(features({
      bpm: 130, regularity: 0.85, density: 2.6, weight: 0.6, brightness: 0.3, energy: 0.7,
    }), frame({ load: 0.3 }), "peak");
    const quiet = plan(features({ density: 0.15, bpm: 0, energy: 0.15 }), frame({ load: 0.3 }));
    expect(heavy.bias.corruption).toBeGreaterThan(quiet.bias.corruption);
    expect(quiet.bias.atmosphere).toBeGreaterThan(heavy.bias.atmosphere);
  });

  it("explains itself in the readout", () => {
    // The mode is unattended; an opaque one is indistinguishable from a broken
    // one, so every move states its section, its reading and its reasoning.
    const m = plan(features({ bpm: 124, regularity: 0.8, density: 2.2 }), frame({ load: 0.9 }), "peak");
    expect(m.reason).toContain("peak");
    expect(m.reason).toContain("124 BPM");
    expect(m.reason).toMatch(/loaded/);
  });
});
