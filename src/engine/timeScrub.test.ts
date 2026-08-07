import { describe, expect, it } from "vitest";
import {
  SCRUB_AFTER, SCRUB_BEFORE, SCRUB_SPAN,
  ScrubBuffer, buildWindow, scoreFrame,
} from "./timeScrub";

/** Fill a buffer as if the app had been running steadily at `fps`. */
function running(seconds: number, fps = 60, startAt = 10_000, pulse = () => 0.5) {
  const buf = new ScrubBuffer(Math.ceil(seconds * fps) + 10);
  const n = Math.ceil(seconds * fps);
  for (let i = 0; i < n; i++) {
    const at = startAt + (i / fps) * 1000;
    buf.push(i / fps, pulse(), at);
  }
  return { buf, endAt: startAt + ((n - 1) / fps) * 1000 };
}

describe("scrub buffer", () => {
  it("reports how far back it can actually reach", () => {
    const { buf, endAt } = running(2);
    expect(buf.reachSeconds(endAt)).toBeGreaterThan(1.9);
  });

  it("is honest about a short history rather than inventing one", () => {
    // Pressing the button immediately after load must not claim 1.5s of past.
    const { buf, endAt } = running(0.3);
    expect(buf.reachSeconds(endAt)).toBeLessThan(SCRUB_BEFORE);
  });

  it("drops the oldest samples once full instead of growing without bound", () => {
    const buf = new ScrubBuffer(50);
    for (let i = 0; i < 500; i++) buf.push(i, 0.5, i * 16);
    expect(buf.size).toBe(50);
    expect(buf.latest()!.t).toBe(499);
  });

  it("finds the sample nearest an instant", () => {
    const { buf } = running(2);
    const s = buf.nearest(10_000 + 500)!;
    expect(Math.abs(s.at - 10_500)).toBeLessThan(20);
  });

  it("returns null when nothing has been recorded", () => {
    const buf = new ScrubBuffer();
    expect(buf.latest()).toBeNull();
    expect(buf.nearest(0)).toBeNull();
    expect(buildWindow(buf, 0)).toBeNull();
  });
});

describe("scrub window", () => {
  it("spans 1.5s each side of the press", () => {
    const { buf, endAt } = running(3);
    const w = buildWindow(buf, endAt)!;
    expect(w.frames[0].offset).toBeCloseTo(-SCRUB_BEFORE, 5);
    expect(w.frames[w.frames.length - 1].offset).toBeCloseTo(SCRUB_AFTER, 5);
    expect(SCRUB_SPAN).toBe(3);
  });

  it("puts the pivot at the moment of the press", () => {
    const { buf, endAt } = running(3);
    const w = buildWindow(buf, endAt)!;
    expect(Math.abs(w.frames[w.pivot].offset)).toBeLessThan(0.07);
  });

  it("advances virtual time monotonically across the whole window", () => {
    const { buf, endAt } = running(3);
    const w = buildWindow(buf, endAt)!;
    for (let i = 1; i < w.frames.length; i++) {
      expect(w.frames[i].t, `frame ${i}`).toBeGreaterThan(w.frames[i - 1].t);
    }
  });

  it("computes future time exactly, not approximately", () => {
    // The forward half is arithmetic on a deterministic clock, so +1.5s should
    // land within a frame of where the engine would actually be.
    const { buf, endAt } = running(3);
    const w = buildWindow(buf, endAt)!;
    const now = buf.latest()!;
    const last = w.frames[w.frames.length - 1];
    expect(last.t - now.t).toBeCloseTo(SCRUB_AFTER, 1);
  });

  it("recovers recorded past frames rather than reconstructing them", () => {
    const { buf, endAt } = running(3);
    const w = buildWindow(buf, endAt)!;
    const past = w.frames.filter(f => f.offset < -0.1);
    expect(past.every(f => !f.reconstructed)).toBe(true);
  });

  it("marks frames it had to reconstruct", () => {
    // With only 0.4s of history, most of the backward half is not real.
    const { buf, endAt } = running(0.4);
    const w = buildWindow(buf, endAt)!;
    expect(w.frames.some(f => f.reconstructed)).toBe(true);
    expect(w.reach).toBeLessThan(SCRUB_BEFORE);
  });

  it("settles the pulse toward the mean going forward, since future audio does not exist", () => {
    const { buf, endAt } = running(3, 60, 10_000, () => 0.9);
    const w = buildWindow(buf, endAt)!;
    const far = w.frames[w.frames.length - 1];
    // Mean is 0.9 here, so it should settle there rather than drift anywhere else.
    expect(far.pulse).toBeGreaterThan(0.8);
    expect(far.pulse).toBeLessThanOrEqual(0.91);
  });

  it("keeps every pulse in range whatever was recorded", () => {
    const { buf, endAt } = running(3, 60, 10_000, () => Math.random());
    for (const f of buildWindow(buf, endAt)!.frames) {
      expect(f.pulse).toBeGreaterThanOrEqual(0);
      expect(f.pulse).toBeLessThanOrEqual(1);
    }
  });

  it("honours the requested resolution and never returns fewer than three frames", () => {
    const { buf, endAt } = running(3);
    expect(buildWindow(buf, endAt, 41)!.frames).toHaveLength(41);
    expect(buildWindow(buf, endAt, 1)!.frames.length).toBeGreaterThanOrEqual(3);
  });

  it("tracks a slowed clock instead of assuming real time", () => {
    // Half-rate virtual time — the forward half must extrapolate at that rate,
    // or it lands on a different timeline from the one on screen.
    const buf = new ScrubBuffer(400);
    for (let i = 0; i < 180; i++) buf.push((i / 60) * 0.5, 0.5, 10_000 + (i / 60) * 1000);
    const endAt = 10_000 + (179 / 60) * 1000;
    const w = buildWindow(buf, endAt)!;
    const now = buf.latest()!;
    expect(w.frames[w.frames.length - 1].t - now.t).toBeCloseTo(SCRUB_AFTER * 0.5, 1);
  });
});

describe("frame scoring", () => {
  const fill = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    return d;
  };

  it("rates a flat grey frame near zero", () => {
    expect(scoreFrame(fill(64, 64, () => [128, 128, 128]), 64, 64)).toBeLessThan(0.15);
  });

  it("rates a detailed colourful frame above a flat one", () => {
    const flat = scoreFrame(fill(64, 64, () => [128, 128, 128]), 64, 64);
    const rich = scoreFrame(fill(64, 64, (x, y) => [
      128 + 100 * Math.sin(x * 0.6),
      128 + 100 * Math.cos(y * 0.5),
      128 + 90 * Math.sin((x + y) * 0.4),
    ]), 64, 64);
    expect(rich).toBeGreaterThan(flat);
  });

  it("punishes a clipped frame", () => {
    // Pure black-and-white noise has huge contrast but no recoverable detail.
    const clipped = scoreFrame(fill(64, 64, (x, y) =>
      (x + y) % 2 ? [255, 255, 255] : [0, 0, 0]), 64, 64);
    const clean = scoreFrame(fill(64, 64, (x, y) => [
      128 + 90 * Math.sin(x * 0.5), 128 + 80 * Math.cos(y * 0.5), 140,
    ]), 64, 64);
    expect(clipped).toBeLessThan(clean);
  });

  it("always returns a usable 0..1", () => {
    for (const d of [
      fill(32, 32, () => [0, 0, 0]),
      fill(32, 32, () => [255, 255, 255]),
      fill(32, 32, () => [Math.random() * 255, Math.random() * 255, Math.random() * 255]),
    ]) {
      const s = scoreFrame(d, 32, 32);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("refuses a degenerate buffer rather than guessing", () => {
    expect(scoreFrame(new Uint8ClampedArray(4), 1, 1)).toBe(0);
    expect(scoreFrame(new Uint8ClampedArray(0), 64, 64)).toBe(0);
  });
});
