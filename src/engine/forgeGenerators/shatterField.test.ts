import { describe, expect, it } from "vitest";
import { SHATTER_FIELD, type ShatterFieldState } from "./shatterField";

/**
 * jsdom does not implement 2D canvas rendering itself. Shatter Field's
 * render only touches createImageData/putImageData/getImageData (no
 * gradients or paths), so the polyfill here is smaller than driftField's —
 * see driftField.test.ts for the fuller pattern this is adapted from.
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

describe("Shatter Field generator", () => {
  it("seeds between 6 and 13 drifting cells depending on device tier", () => {
    const state = SHATTER_FIELD.createState("seed-a") as ShatterFieldState;
    expect(state.cells.length).toBeGreaterThanOrEqual(6);
    expect(state.cells.length).toBeLessThanOrEqual(13);
    for (const c of state.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(1);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(1);
    }
  });

  it("actually reaches the stated per-tier ceiling, not ceiling-1", () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "hardwareConcurrency");
    try {
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
      let lowMax = 0;
      for (let i = 0; i < 60; i++) {
        const state = SHATTER_FIELD.createState(`low-${i}`) as ShatterFieldState;
        lowMax = Math.max(lowMax, state.cells.length);
      }
      expect(lowMax).toBe(9);

      Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
      let highMax = 0;
      for (let i = 0; i < 60; i++) {
        const state = SHATTER_FIELD.createState(`high-${i}`) as ShatterFieldState;
        highMax = Math.max(highMax, state.cells.length);
      }
      expect(highMax).toBe(13);
    } finally {
      if (original) Object.defineProperty(navigator, "hardwareConcurrency", original);
      else delete (navigator as { hardwareConcurrency?: number }).hardwareConcurrency;
    }
  });

  it("advances cell positions between frames using elapsed time, wrapping at the edges", () => {
    const state = SHATTER_FIELD.createState("seed-b") as ShatterFieldState;
    const before = state.cells.map(c => ({ x: c.x, y: c.y }));
    const ctx = makeCtx(16, 16);
    SHATTER_FIELD.render(
      { ctx, w: 16, h: 16, t: 0, seed: "seed-b", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    SHATTER_FIELD.render(
      { ctx, w: 16, h: 16, t: 2, seed: "seed-b", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    let moved = false;
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i].x !== before[i].x || state.cells[i].y !== before[i].y) { moved = true; break; }
      expect(state.cells[i].x).toBeGreaterThanOrEqual(0);
      expect(state.cells[i].x).toBeLessThan(1);
    }
    expect(moved).toBe(true);
  });

  it("renders without throwing and fills every pixel", () => {
    const w = 24, h = 24;
    const ctx = makeCtx(w, h);
    const state = SHATTER_FIELD.createState("seed-c");
    SHATTER_FIELD.render(
      { ctx, w, h, t: 1, seed: "seed-c", palette: ["#FF1F8F", "#00FFB2", "#1A0033"], intensity: 0.6, audio: AUDIO },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    expect(px.length).toBe(w * h * 4);
    expect(px[3]).toBe(255); // fully opaque
  });
});
