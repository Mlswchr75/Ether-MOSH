import { describe, expect, it } from "vitest";
import {
  buildEncodedFrameSequenceLottie,
  contentFrameSize,
  renderOrganicStickerFrame,
  FIELD_SIZE,
  type OrganicFocus,
} from "./lottieStickerMode";
import { BaseMockCtx2D, getCanvasBuffer, installCanvas2DPolyfillIfNeeded } from "../testHelpers/canvas2dPolyfillBase";

/**
 * jsdom does not implement 2D canvas rendering itself (see
 * testHelpers/canvas2dPolyfillBase.ts for why, and what that shared base
 * covers). renderOrganicStickerFrame needs one thing the base doesn't
 * provide: a `drawImage` that actually crops and scales from a *separate*
 * source canvas into this one (the 9-argument form), since that's the whole
 * mechanism under test — the mask has to end up over the right pixels of a
 * real crop, not just any blank buffer. Nearest-neighbor is fine here; the
 * test only checks alpha, never color fidelity.
 */
class StickerMockCtx2D extends BaseMockCtx2D {
  drawImage(
    source: HTMLCanvasElement,
    sx: number, sy: number, sw: number, sh: number,
    dx: number, dy: number, dw: number, dh: number,
  ) {
    const srcBuf = getCanvasBuffer(source);
    const destBuf = this.buf;
    for (let y = 0; y < dh; y++) {
      const py = Math.round(dy + y);
      if (py < 0 || py >= destBuf.height) continue;
      const srcY = Math.min(source.height - 1, Math.max(0, Math.round(sy + (y / dh) * sh)));
      for (let x = 0; x < dw; x++) {
        const px = Math.round(dx + x);
        if (px < 0 || px >= destBuf.width) continue;
        const srcX = Math.min(source.width - 1, Math.max(0, Math.round(sx + (x / dw) * sw)));
        const sIdx = (srcY * source.width + srcX) * 4;
        const dIdx = (py * destBuf.width + px) * 4;
        destBuf.data[dIdx] = srcBuf.data[sIdx];
        destBuf.data[dIdx + 1] = srcBuf.data[sIdx + 1];
        destBuf.data[dIdx + 2] = srcBuf.data[sIdx + 2];
        destBuf.data[dIdx + 3] = 255; // the source is opaque; alpha comes entirely from the mask below
      }
    }
  }
}

installCanvas2DPolyfillIfNeeded((canvas) => new StickerMockCtx2D(canvas));

function makeOpaqueSource(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  const buf = getCanvasBuffer(canvas);
  buf.data.fill(255); // opaque white — irrelevant to these tests, which only read alpha
  return canvas;
}

/** A field with a single value everywhere except a filled rectangle, for
 *  building focuses with a known, deliberate shape. */
function fieldWithRect(hot: number, cold: number, rect: { x0: number; y0: number; x1: number; y1: number }): Float32Array {
  const field = new Float32Array(FIELD_SIZE * FIELD_SIZE).fill(cold);
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      field[y * FIELD_SIZE + x] = hot;
    }
  }
  return field;
}

const baseFocus = (field: Float32Array): OrganicFocus => ({
  left: 0, right: 1, top: 0, bottom: 1,
  field, threshold: .5, jaggedness: 1, // jaggedness: 1 → thinnest feather, sharpest read
  flowX: 0, flowY: 0, phase: 0,
});

describe("Lottie Sticker content-aware mask", () => {
  it("sizes the output frame from the content's own bounding box aspect, not a fixed landscape assumption", () => {
    const tall: OrganicFocus = { ...baseFocus(new Float32Array(FIELD_SIZE * FIELD_SIZE)), left: .4, right: .5, top: .1, bottom: .9 };
    const { width, height } = contentFrameSize(tall, 360);
    expect(height).toBe(360);
    expect(width).toBeLessThan(height);
    expect(width).toBeCloseTo(Math.round(360 * ((.5 - .4) / (.9 - .1))), 0);

    const wide: OrganicFocus = { ...baseFocus(new Float32Array(FIELD_SIZE * FIELD_SIZE)), left: .1, right: .9, top: .45, bottom: .55 };
    const { width: w2, height: h2 } = contentFrameSize(wide, 360);
    expect(w2).toBe(360);
    expect(h2).toBeLessThan(w2);
  });

  it("never reaches the crop's own edge while keeping a substantial center", () => {
    const source = makeOpaqueSource(64, 64);
    const focus = baseFocus(new Float32Array(FIELD_SIZE * FIELD_SIZE).fill(1)); // content everywhere
    const frame = renderOrganicStickerFrame(source, focus, 64, 64, 0);
    const alphaAt = (x: number, y: number) => frame.data[(y * 64 + x) * 4 + 3];
    for (const p of [0, 5, 63]) {
      expect(alphaAt(p, 0)).toBe(0);
      expect(alphaAt(p, 63)).toBe(0);
      expect(alphaAt(0, p)).toBe(0);
      expect(alphaAt(63, p)).toBe(0);
    }
    expect(alphaAt(32, 32)).toBeGreaterThan(200);
  });

  it("cuts two disconnected regions and stays transparent between them — impossible for a single radius-per-angle contour", () => {
    // Two separated hot squares, one near the left edge, one near the right,
    // nothing in between. A star-convex-from-one-center model (what this
    // mask used to be) cannot represent this at all: a ray from any single
    // center can only cross the boundary twice, so it can never carve out a
    // gap and pick back up again further out.
    const field = new Float32Array(FIELD_SIZE * FIELD_SIZE).fill(0);
    const left = fieldWithRect(1, 0, { x0: 10, y0: 40, x1: 25, y1: 55 });
    const right = fieldWithRect(1, 0, { x0: 70, y0: 40, x1: 85, y1: 55 });
    for (let i = 0; i < field.length; i++) field[i] = Math.max(left[i], right[i]);

    const focus = baseFocus(field);
    const source = makeOpaqueSource(96, 96);
    const frame = renderOrganicStickerFrame(source, focus, 96, 96, 0);
    const alphaAt = (x: number, y: number) => frame.data[(y * 96 + x) * 4 + 3];

    expect(alphaAt(17, 47)).toBeGreaterThan(150); // inside the left square
    expect(alphaAt(77, 47)).toBeGreaterThan(150); // inside the right square
    expect(alphaAt(48, 47)).toBe(0); // the gap between them
  });

  it("builds a transparent raster-sequence Lottie with one timed layer per frame", () => {
    const frames = [0, 1].map(index => ({ width: 4, height: 4, dataUrl: `data:image/png;base64,frame${index}` }));
    const json = buildEncodedFrameSequenceLottie("test", frames, 10);
    expect(json.fr).toBe(10);
    expect(json.op).toBe(2);
    expect(json.assets).toHaveLength(2);
    expect(json.layers).toHaveLength(2);
    expect(json.assets[0].p).toMatch(/^data:image\/png;base64,/);
  });
});
