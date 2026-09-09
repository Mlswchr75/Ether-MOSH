import { describe, expect, it } from "vitest";
import {
  CAPTURE_FRAMES, SCRUB_AFTER, SCRUB_BEFORE,
  ScrubCapture, bestFrameIndex, exportSize, projectLayers,
} from "./scrubCapture";
import { scrubExportFilename } from "./scrubExport";
import type { RenderLayer } from "./Renderer";
import type { Layer } from "@/store/types";
import { EFFECTS_BY_ID } from "./effects";

/**
 * The failure this guards against is a quiet one: a scrub that *looks* like it
 * is showing you a moment from a second ago while actually showing the newest
 * frame at every position. Everything below is about the timeline carrying
 * genuinely distinct, correctly-attributed moments — and about the bitmaps
 * being released, since those live outside the JS heap where no ordinary leak
 * check will find them.
 */

type FakeBitmap = ImageBitmap & { id: number; closed: boolean };

/** Stand-in for ImageBitmap; records whether it was closed. */
function fakeBitmap(id: number): FakeBitmap {
  const bm = { id, width: 1280, height: 720, closed: false, close: () => { bm.closed = true; } };
  return bm as unknown as FakeBitmap;
}

const renderLayer = (over: Partial<RenderLayer> = {}): RenderLayer => ({
  id: "l1", effectId: "hueRotate", hidden: false, opacity: 1,
  blend: "normal", params: { amount: 0.5 }, region: null, ...over,
});

/** A store layer whose one param is driven by a sine modulator. */
const modulated = (): Layer => ({
  id: "l1", effectId: "hueRotate", hidden: false, locked: false,
  opacity: 1, blend: "normal",
  params: { amount: 0.5 },
  mods: { amount: { type: "sine", speed: 1, depth: 0.4, offset: 0 } },
  audioMaps: {},
  region: null,
});

/** Fill a capture as if the app had been running steadily. */
function running(seconds: number, startAt = 10_000, hz = 15) {
  const cap = new ScrubCapture();
  const n = Math.ceil(seconds * hz);
  const bitmaps: FakeBitmap[] = [];
  for (let i = 0; i < n; i++) {
    const at = startAt + (i / hz) * 1000;
    const bm = fakeBitmap(i);
    bitmaps.push(bm);
    cap.push(i / hz, 0.5, at, bm, [renderLayer({ params: { amount: i / 100 } })]);
  }
  return { cap, bitmaps, endAt: startAt + ((n - 1) / hz) * 1000 };
}

describe("scrub capture", () => {
  it("keeps distinct moments rather than one repeated instant", () => {
    // The live loop reuses its layer objects between frames, so storing the
    // reference would give every sample the newest params.
    const cap = new ScrubCapture();
    const shared = renderLayer({ params: { amount: 0.1 } });
    cap.push(0, 0.5, 1000, fakeBitmap(1), [shared]);
    shared.params.amount = 0.9;
    cap.push(1, 0.5, 1100, fakeBitmap(2), [shared]);

    const take = cap.take(1100, [], 5)!;
    const amounts = new Set(take.frames.map(f => f.layers[0]?.params.amount));
    expect(amounts.size).toBeGreaterThan(1);
  });

  it("throttles capture instead of storing every frame", () => {
    const cap = new ScrubCapture();
    expect(cap.due(0)).toBe(true);
    cap.push(0, 0.5, 1000, null, []);
    expect(cap.due(1004)).toBe(false); // ~60fps: far too soon
    expect(cap.due(1100)).toBe(true);  // past the 1/15s interval
  });

  it("bounds memory and closes the bitmaps it evicts", () => {
    // ImageBitmaps hold memory outside the JS heap; an unclosed ring is
    // invisible to every ordinary leak check.
    const { cap, bitmaps } = running(6);
    expect(cap.size).toBeLessThanOrEqual(CAPTURE_FRAMES);
    const evicted = bitmaps.slice(0, bitmaps.length - cap.size);
    expect(evicted.length).toBeGreaterThan(0);
    expect(evicted.every(b => b.closed)).toBe(true);
  });

  it("releases every bitmap on clear", () => {
    const { cap, bitmaps } = running(1);
    cap.clear();
    expect(bitmaps.every(b => b.closed)).toBe(true);
    expect(cap.size).toBe(0);
  });

  it("stops recording when paused, keeping what it already holds", () => {
    /* Load-bearing, not an optimisation: the ring holds ~2s and the freeze ramp
       runs 1.5s, so recording through the ramp would evict almost all of the
       history the user tapped to look at. */
    const { cap } = running(1);
    const before = cap.size;
    cap.pause();
    expect(cap.claim(99_999)).toBe(false);
    expect(cap.size).toBe(before);
    cap.resume();
    expect(cap.claim(99_999)).toBe(true);
  });

  it("preserves the pre-tap history across a pause", () => {
    const { cap, bitmaps, endAt } = running(1.4);
    cap.pause();
    // Whatever the app does next, the frames that were there must survive.
    for (let i = 0; i < 40; i++) {
      if (cap.claim(endAt + i * 100)) throw new Error("claimed while paused");
    }
    const take = cap.take(endAt, [], 25)!;
    const ids = new Set(take.frames.filter(f => !f.reconstructed)
      .map(f => (f.source as unknown as { id: number })?.id));
    expect(ids.size).toBeGreaterThan(3);
    expect(bitmaps.filter(b => b.closed).length).toBeLessThan(bitmaps.length);
  });

  it("returns null rather than an empty timeline when nothing was captured", () => {
    expect(new ScrubCapture().take(0, [])).toBeNull();
  });

  it("is honest about a short history", () => {
    const { cap, endAt } = running(0.3);
    expect(cap.reachSeconds(endAt)).toBeLessThan(SCRUB_BEFORE);
  });
});

describe("the take", () => {
  it("spans 1.5s each side of the freeze", () => {
    const { cap, endAt } = running(3);
    const take = cap.take(endAt, [])!;
    expect(take.frames[0].offset).toBeCloseTo(-SCRUB_BEFORE, 5);
    expect(take.frames[take.frames.length - 1].offset).toBeCloseTo(SCRUB_AFTER, 5);
  });

  it("gives backward frames their own recorded source", () => {
    // The point of the whole feature: -1.2s must not be the newest frame.
    const { cap, endAt } = running(3);
    const take = cap.take(endAt, [], 25)!;
    const past = take.frames.filter(f => f.offset < -0.2);
    const ids = new Set(past.map(f => (f.source as unknown as { id: number })?.id));
    expect(ids.size).toBeGreaterThan(3);
  });

  it("marks recorded frames as real and computed ones as reconstructed", () => {
    const { cap, endAt } = running(3);
    const take = cap.take(endAt, [], 25)!;
    expect(take.frames.filter(f => f.offset < -0.2).every(f => !f.reconstructed)).toBe(true);
    expect(take.frames.filter(f => f.offset > 0.1).every(f => f.reconstructed)).toBe(true);
  });

  it("admits when the ring could not reach that far back", () => {
    // With 0.4s of history, most of the backward half is not real, and saying
    // otherwise would let someone export a "recorded" moment that never was.
    const { cap, endAt } = running(0.4);
    const take = cap.take(endAt, [], 25)!;
    expect(take.frames.some(f => f.offset < -0.5 && f.reconstructed)).toBe(true);
  });

  it("holds the source still going forward but keeps the effects moving", () => {
    const { cap, endAt } = running(3);
    const take = cap.take(endAt, [modulated()], 25)!;
    const future = take.frames.filter(f => f.offset > 0.1);
    const sources = new Set(future.map(f => f.source));
    expect(sources.size).toBe(1);
    const amounts = new Set(future.map(f => f.layers[0].params.amount));
    expect(amounts.size).toBeGreaterThan(3);
  });

  it("advances virtual time monotonically across the whole window", () => {
    const { cap, endAt } = running(3);
    const take = cap.take(endAt, [])!;
    for (let i = 1; i < take.frames.length; i++) {
      expect(take.frames[i].t, `frame ${i}`).toBeGreaterThanOrEqual(take.frames[i - 1].t);
    }
  });

  it("falls back to the last real layers when the stack is empty", () => {
    const { cap, endAt } = running(2);
    const take = cap.take(endAt, [], 9)!;
    expect(take.frames.every(f => f.layers.length === 1)).toBe(true);
  });
});

describe("projecting modulators forward", () => {
  it("moves a modulated param as time advances", () => {
    const a = projectLayers([modulated()], 0, 0.5);
    const b = projectLayers([modulated()], 0.25, 0.5);
    expect(a[0].params.amount).not.toBeCloseTo(b[0].params.amount, 4);
  });

  it("is deterministic — the same time gives the same frame", () => {
    // This is what makes the forward half exact rather than estimated.
    expect(projectLayers([modulated()], 1.234, 0.5))
      .toEqual(projectLayers([modulated()], 1.234, 0.5));
  });

  it("never leaves a param outside the shader's declared range", () => {
    const wild: Layer = {
      ...modulated(),
      params: { amount: 1 },
      mods: { amount: { type: "sine", speed: 3, depth: 1, offset: 1 } },
    };
    const def = EFFECTS_BY_ID.hueRotate.params.find(p => p.key === "amount")!;
    for (let t = 0; t < 4; t += 0.05) {
      const v = projectLayers([wild], t, 1)[0].params.amount;
      expect(v).toBeGreaterThanOrEqual(def.min);
      expect(v).toBeLessThanOrEqual(def.max);
    }
  });

  it("scales opacity by the master and keeps it in range", () => {
    expect(projectLayers([modulated()], 0, 0, 0.5)[0].opacity).toBeCloseTo(0.5, 5);
    expect(projectLayers([modulated()], 0, 0, 4)[0].opacity).toBe(1);
  });

  it("carries the layer's region through untouched", () => {
    const l = { ...modulated(), region: { mode: "radial" as const, scale: 3 } };
    expect(projectLayers([l], 0, 0)[0].region).toEqual({ mode: "radial", scale: 3 });
  });

  it("survives a layer whose effect no longer exists", () => {
    const gone = { ...modulated(), effectId: "notAnEffect" };
    expect(() => projectLayers([gone], 1, 0.5)).not.toThrow();
  });
});

describe("export sizing", () => {
  it("clears 3000 on BOTH edges, not just the long one", () => {
    // Scaling the long edge would hand back 3000x1688 from a 16:9 frame, which
    // does not meet "minimum 3000x3000".
    const { width, height } = exportSize(1920, 1080);
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(3000);
    expect(width).toBe(5333);
    expect(height).toBe(3000);
  });

  it("handles a square source", () => {
    expect(exportSize(1024, 1024)).toEqual({ width: 3000, height: 3000 });
  });

  it("handles a portrait source", () => {
    const { width, height } = exportSize(1080, 1920);
    expect(Math.min(width, height)).toBeGreaterThanOrEqual(3000);
    expect(width).toBe(3000);
  });

  it("preserves the aspect ratio", () => {
    const { width, height } = exportSize(1920, 1080);
    expect(width / height).toBeCloseTo(1920 / 1080, 2);
  });

  it("caps an extreme ratio rather than asking for a canvas the GPU refuses", () => {
    const { width, height } = exportSize(8000, 500, 3000, 8192);
    expect(Math.max(width, height)).toBeLessThanOrEqual(8192);
  });

  it("never returns a zero or fractional dimension", () => {
    for (const [w, h] of [[0, 0], [1, 1], [3, 5000], [7, 7]]) {
      const s = exportSize(w, h);
      expect(Number.isInteger(s.width)).toBe(true);
      expect(Number.isInteger(s.height)).toBe(true);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });
});

describe("supporting bits", () => {
  it("finds the strongest frame", () => {
    expect(bestFrameIndex([0.1, 0.9, 0.3])).toBe(1);
    expect(bestFrameIndex([])).toBe(0);
  });

  it("names the file so a print shop can read what it is", () => {
    expect(scrubExportFilename(-1.5, 5333, 3000, 300))
      .toBe("ether-mosh_scrub-1.50s_5333x3000_300dpi.png");
    expect(scrubExportFilename(0.75, 3000, 3000, 300)).toContain("+0.75s");
  });
});
