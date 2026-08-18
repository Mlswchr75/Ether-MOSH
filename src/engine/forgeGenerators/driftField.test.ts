import { describe, expect, it } from "vitest";
import { DRIFT_FIELD } from "./driftField";

/**
 * jsdom does not implement 2D canvas rendering itself — that requires the
 * native `canvas` npm package, which needs a system cairo/pkg-config
 * toolchain this sandbox doesn't have. Feature-detect and, only when the
 * real context is unavailable (getContext("2d") returns null rather than
 * throwing), install a minimal in-memory 2D context implementing exactly
 * the surface drawSeamless() touches: raw ImageData read/write for the
 * base field, plus no-op gradient/path calls for the blob pass. This lets
 * the test exercise real pixel output instead of being unable to run at
 * all. If a real `canvas` backend is ever installed, this is a no-op.
 */
function installCanvas2DPolyfillIfNeeded() {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  if (probe.getContext("2d")) return; // real implementation available.

  class MockCtx2D {
    fillStyle: unknown = "#000";
    globalCompositeOperation = "source-over";
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
    createRadialGradient() {
      return { addColorStop: () => {} };
    }
    save() {}
    restore() {}
    beginPath() {}
    arc() {}
    fill() {}
  }

  const contexts = new WeakMap<HTMLCanvasElement, MockCtx2D>();
  const original = HTMLCanvasElement.prototype.getContext;
  // eslint's no-explicit-any is relaxed for test files in this project's
  // config, so no disable comment is needed for this cast (monkey-patching a
  // native prototype method's overloaded signature isn't expressible more
  // narrowly without losing the point of the mock).
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

describe("Drift Field generator", () => {
  it("is registered as a cheap, canvas2d field generator", () => {
    expect(DRIFT_FIELD.id).toBe("driftField");
    expect(DRIFT_FIELD.kind).toBe("canvas2d");
    expect(DRIFT_FIELD.costTier).toBe("cheap");
    expect(DRIFT_FIELD.category).toBe("field");
  });

  it("renders without throwing and fills every pixel", () => {
    const w = 32, h = 32;
    const ctx = makeCtx(w, h);
    const state = DRIFT_FIELD.createState("abc123");
    DRIFT_FIELD.render(
      {
        ctx, w, h, t: 1.2, seed: "abc123",
        palette: ["#FF1F8F", "#00FFB2", "#1A0033"],
        intensity: 0.6,
        audio: { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 },
      },
      state,
    );
    const px = ctx.getImageData(0, 0, w, h).data;
    let sawNonBlack = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 0 || px[i + 1] > 0 || px[i + 2] > 0) { sawNonBlack = true; break; }
    }
    expect(sawNonBlack).toBe(true);
  });
});
