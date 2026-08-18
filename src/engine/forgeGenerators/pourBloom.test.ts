import { describe, expect, it } from "vitest";
import { POUR_BLOOM, type PourBloomState } from "./pourBloom";

/**
 * jsdom does not implement 2D canvas rendering itself. Pour Bloom's render
 * only touches createImageData/putImageData/getImageData (no gradients or
 * paths), so the polyfill here matches shatterField.test.ts's — see
 * driftField.test.ts for the fuller pattern this is adapted from.
 */
function installCanvas2DPolyfillIfNeeded() {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  if (probe.getContext("2d")) return; // real implementation available.

  class MockCtx2D {
    private buf: Uint8ClampedArray;
    constructor(private canvas: HTMLCanvasElement) {
      this.buf = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    }
    createImageData(w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }
    putImageData(imageData: { data: Uint8ClampedArray }, dx: number, dy: number) {
      if (dx === 0 && dy === 0 && imageData.data.length === this.buf.length) {
        this.buf.set(imageData.data);
      }
    }
    getImageData(sx: number, sy: number, sw: number, sh: number) {
      if (sx === 0 && sy === 0 && sw === this.canvas.width && sh === this.canvas.height) {
        return { data: this.buf };
      }
      return { data: new Uint8ClampedArray(sw * sh * 4) };
    }
  }

  const contexts = new WeakMap<HTMLCanvasElement, MockCtx2D>();
  const original = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    if (type !== "2d") return original.apply(this, [type, ...rest] as never);
    let c = contexts.get(this);
    if (!c) {
      c = new MockCtx2D(this);
      contexts.set(this, c);
    }
    return c;
  };
}

installCanvas2DPolyfillIfNeeded();

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

const AUDIO = { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 };

describe("Pour Bloom generator", () => {
  it("seeds between 5 and 8 blobs with positive radii", () => {
    const state = POUR_BLOOM.createState("seed-a") as PourBloomState;
    expect(state.blobs.length).toBeGreaterThanOrEqual(5);
    expect(state.blobs.length).toBeLessThanOrEqual(8);
    for (const b of state.blobs) expect(b.r).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = POUR_BLOOM.createState("same-seed") as PourBloomState;
    const b = POUR_BLOOM.createState("same-seed") as PourBloomState;
    expect(a.blobs).toEqual(b.blobs);
  });

  it("renders without throwing and produces a fully opaque frame", () => {
    const w = 24, h = 24;
    const ctx = makeCtx(w, h);
    const state = POUR_BLOOM.createState("seed-c");
    POUR_BLOOM.render(
      { ctx, w, h, t: 1, seed: "seed-c", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });
});
