import { describe, expect, it } from "vitest";
import {
  analyzeOrganicFocus,
  buildEncodedFrameSequenceLottie,
  contentFrameSize,
  isolateOrganicFocus,
  renderOrganicStickerFrame,
  FIELD_SIZE,
  type OrganicFocus,
} from "./lottieStickerMode";
import { BaseMockCtx2D, getCanvasBuffer, installCanvas2DPolyfillIfNeeded, type PixelBuffer } from "../testHelpers/canvas2dPolyfillBase";

/**
 * jsdom does not implement 2D canvas rendering itself (see
 * testHelpers/canvas2dPolyfillBase.ts for why, and what that shared base
 * covers). renderOrganicStickerFrame needs one thing the base doesn't
 * provide: a `drawImage` that actually crops and scales from a *separate*
 * source canvas into this one, since that's the whole mechanism under test
 * — the mask has to end up over the right pixels of a real crop, not just
 * any blank buffer. Nearest-neighbor is fine here; most of these tests only
 * check alpha, never color fidelity.
 *
 * Two call shapes reach this mock: the 9-argument crop form
 * (sx,sy,sw,sh,dx,dy,dw,dh) that renderOrganicStickerFrame uses, and the
 * 5-argument whole-image-scaled form (dx,dy,dWidth,dHeight) that
 * analyzeOrganicFocus uses to downsample the live source into its fixed
 * FIELD_SIZE grid. `d` is only ever provided by the 9-arg form, so its
 * presence disambiguates which shape this call is.
 */
class StickerMockCtx2D extends BaseMockCtx2D {
  drawImage(
    source: HTMLCanvasElement,
    a: number, b: number, c: number, d: number,
    dx?: number, dy?: number, dw?: number, dh?: number,
  ) {
    const nineArg = dw !== undefined && dh !== undefined;
    const sx = nineArg ? a : 0;
    const sy = nineArg ? b : 0;
    const sw = nineArg ? c : source.width;
    const sh = nineArg ? d : source.height;
    const ddx = nineArg ? (dx as number) : a;
    const ddy = nineArg ? (dy as number) : b;
    const ddw = nineArg ? (dw as number) : c;
    const ddh = nineArg ? (dh as number) : d;
    const srcBuf = getCanvasBuffer(source);
    const destBuf = this.buf;
    for (let y = 0; y < ddh; y++) {
      const py = Math.round(ddy + y);
      if (py < 0 || py >= destBuf.height) continue;
      const srcY = Math.min(source.height - 1, Math.max(0, Math.round(sy + (y / ddh) * sh)));
      for (let x = 0; x < ddw; x++) {
        const px = Math.round(ddx + x);
        if (px < 0 || px >= destBuf.width) continue;
        const srcX = Math.min(source.width - 1, Math.max(0, Math.round(sx + (x / ddw) * sw)));
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

/** A flat, uniform-color source canvas — the "background" every blob below gets painted onto. */
function makeFlatSource(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  canvas.getContext("2d"); // forces the mock to allocate this canvas's buffer
  const buf = getCanvasBuffer(canvas);
  for (let i = 0; i < buf.data.length; i += 4) { buf.data[i] = 8; buf.data[i + 1] = 8; buf.data[i + 2] = 8; buf.data[i + 3] = 255; }
  return canvas;
}

/**
 * Paints a disc onto `buf` with a genuinely FLAT (zero internal edge/chroma
 * signal) interior and a textured rim — the shape of a sphere's own body
 * and highlight, and exactly the case that used to read as "background" at
 * its center: a pure per-pixel energy cut has nothing to grab onto in a
 * flat interior no matter how solidly it's part of the subject.
 */
function paintFlatBlob(buf: PixelBuffer, size: number, cx: number, cy: number, innerR: number, outerR: number) {
  const y0 = Math.max(0, Math.floor(cy - outerR)), y1 = Math.min(size, Math.ceil(cy + outerR));
  const x0 = Math.max(0, Math.floor(cx - outerR)), x1 = Math.min(size, Math.ceil(cx + outerR));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > outerR) continue;
    const idx = (y * size + x) * 4;
    if (r > innerR) {
      // Textured rim — a per-pixel checkerboard, standing in for a
      // sphere's rim highlight/shading. Every adjacent pixel pair differs
      // by the full amplitude, so the ring stays densely, uniformly hot
      // after downsampling to FIELD_SIZE regardless of exact resampling
      // alignment — an angular band pattern instead left tangential gaps
      // sparse enough for the enclosed-hole fill's flood fill to leak
      // through.
      const band = (x + y) % 2 === 0 ? 235 : 40;
      buf.data[idx] = band; buf.data[idx + 1] = band; buf.data[idx + 2] = Math.min(255, band + 20); buf.data[idx + 3] = 255;
    } else {
      // Perfectly flat interior — one solid color, no internal variation.
      buf.data[idx] = 140; buf.data[idx + 1] = 90; buf.data[idx + 2] = 200; buf.data[idx + 3] = 255;
    }
  }
}

const baseFocus = (field: Float32Array): OrganicFocus => ({
  left: 0, right: 1, top: 0, bottom: 1,
  field, threshold: .5, jaggedness: 1, // jaggedness: 1 → thinnest feather, sharpest read
  flowX: 0, flowY: 0, phase: 0,
});

/**
 * Same idea as paintFlatBlob, but the rim has a handful of short, periodic
 * LOW-CONTRAST gaps — modeling a real soft-gradient rim (or FX dithering
 * that happens to thin out at a few points) rather than a uniformly dense
 * texture. Regression coverage for combining the small connectivity bridge
 * with the enclosed-hole flood fill: the flood fill *alone* leaks straight
 * through gaps like these and reads the whole interior as background.
 */
function paintGappyRimBlob(buf: PixelBuffer, size: number, cx: number, cy: number, innerR: number, outerR: number) {
  const y0 = Math.max(0, Math.floor(cy - outerR)), y1 = Math.min(size, Math.ceil(cy + outerR));
  const x0 = Math.max(0, Math.floor(cx - outerR)), x1 = Math.min(size, Math.ceil(cx + outerR));
  const twoPi = Math.PI * 2, period = twoPi / 8; // 8 gaps evenly spaced around the ring
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > outerR) continue;
    const idx = (y * size + x) * 4;
    if (r > innerR) {
      const angle = (Math.atan2(dy, dx) + twoPi) % twoPi;
      const inGap = (angle % period) < 0.08; // a short flat break in an otherwise dense rim
      if (inGap) {
        buf.data[idx] = 140; buf.data[idx + 1] = 90; buf.data[idx + 2] = 200; buf.data[idx + 3] = 255;
      } else {
        const band = (x + y) % 2 === 0 ? 235 : 40;
        buf.data[idx] = band; buf.data[idx + 1] = band; buf.data[idx + 2] = Math.min(255, band + 20); buf.data[idx + 3] = 255;
      }
    } else {
      buf.data[idx] = 140; buf.data[idx + 1] = 90; buf.data[idx + 2] = 200; buf.data[idx + 3] = 255;
    }
  }
}

/**
 * Paints a disc with a genuinely SMOOTH, purely angular gradient rim — no
 * per-pixel texture anywhere, so adjacent pixels differ by well under one
 * unit and local edge/chroma-range energy is essentially zero across the
 * entire rim. This is a directionally-lit sphere's own shading: bright
 * near a highlight, gradually darker on the far side, but even at its
 * darkest the rim color is still clearly not the background color. Regression
 * coverage for the background-color-distance term: edge/chroma-range signal
 * alone finds nothing here, since there is no local edge to find.
 */
function paintSmoothShadedBlob(buf: PixelBuffer, size: number, cx: number, cy: number, innerR: number, outerR: number) {
  const y0 = Math.max(0, Math.floor(cy - outerR)), y1 = Math.min(size, Math.ceil(cy + outerR));
  const x0 = Math.max(0, Math.floor(cx - outerR)), x1 = Math.min(size, Math.ceil(cx + outerR));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x - cx, dy = y - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > outerR) continue;
    const idx = (y * size + x) * 4;
    if (r > innerR) {
      const angle = Math.atan2(dy, dx);
      const lightness = Math.min(1, Math.max(0, 0.15 + 0.7 * Math.max(0, Math.cos(angle - 0.9))));
      const val = Math.round(40 + lightness * 180); // darkest point (val=67) is still well above background (8)
      buf.data[idx] = val; buf.data[idx + 1] = Math.round(val * 0.6); buf.data[idx + 2] = Math.round(val * 0.9); buf.data[idx + 3] = 255;
    } else {
      buf.data[idx] = 140; buf.data[idx + 1] = 90; buf.data[idx + 2] = 200; buf.data[idx + 3] = 255;
    }
  }
}

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

  it("can isolate one disconnected element by tap or retain a ranked layer ensemble", () => {
    const field = new Float32Array(FIELD_SIZE * FIELD_SIZE);
    const left = fieldWithRect(1, 0, { x0: 8, y0: 35, x1: 30, y1: 62 });
    const right = fieldWithRect(.9, 0, { x0: 66, y0: 38, x1: 88, y1: 60 });
    for (let i = 0; i < field.length; i++) field[i] = Math.max(left[i], right[i]);
    const base = baseFocus(field);

    const tapped = isolateOrganicFocus(base, "tap", { x: .82, y: .5 });
    const layered = isolateOrganicFocus(base, "layers");
    const sample = (focus: OrganicFocus, x: number, y: number) => focus.field[y * FIELD_SIZE + x];

    expect(sample(tapped, 77, 48)).toBeGreaterThan(.5);
    expect(sample(tapped, 18, 48)).toBeLessThan(.1);
    expect(sample(layered, 77, 48)).toBeGreaterThan(.5);
    expect(sample(layered, 18, 48)).toBeGreaterThan(.5);
  });

  it("fills a large, flat-colored interior instead of carving a hole in it — the sphere-body case", () => {
    const size = 200;
    const source = makeFlatSource(size);
    paintFlatBlob(getCanvasBuffer(source), size, size / 2, size / 2, size * 0.28, size * 0.42);
    const focus = analyzeOrganicFocus(source);

    // The box should reach out to roughly the textured rim's own extent —
    // not collapse down to a thin ring with a hole where the flat body is.
    expect(focus.right - focus.left).toBeGreaterThan(0.55);
    expect(focus.bottom - focus.top).toBeGreaterThan(0.55);

    // Dead center sits inside the flat interior, which has essentially zero
    // edge/chroma energy of its own. A pure threshold cut reads this as
    // background and carves it out; the enclosed-hole fill should read it
    // solidly opaque instead.
    const f = FIELD_SIZE, mid = Math.floor(f / 2);
    expect(focus.field[mid * f + mid]).toBeGreaterThan(0.5);
  });

  it("fills the interior even when the rim's own hot ring has small connectivity gaps", () => {
    const size = 200;
    const source = makeFlatSource(size);
    paintGappyRimBlob(getCanvasBuffer(source), size, size / 2, size / 2, size * 0.28, size * 0.42);
    const focus = analyzeOrganicFocus(source);

    expect(focus.right - focus.left).toBeGreaterThan(0.55);
    expect(focus.bottom - focus.top).toBeGreaterThan(0.55);
    const f = FIELD_SIZE, mid = Math.floor(f / 2);
    expect(focus.field[mid * f + mid]).toBeGreaterThan(0.5);
  });

  it("fills the interior of a smoothly-shaded blob whose far side has essentially zero local edge signal", () => {
    // The real-world case this whole feature was tuned against: a
    // directionally-lit sphere reads as fully hot near its highlight but,
    // on the far/shadow side, has a rim so gradual that edge/chroma-range
    // energy alone finds nothing — only genuine color distance from the
    // background tells that side apart from empty space.
    const size = 200;
    const source = makeFlatSource(size);
    paintSmoothShadedBlob(getCanvasBuffer(source), size, size / 2, size / 2, size * 0.28, size * 0.42);
    const focus = analyzeOrganicFocus(source);

    expect(focus.right - focus.left).toBeGreaterThan(0.55);
    expect(focus.bottom - focus.top).toBeGreaterThan(0.55);
    const f = FIELD_SIZE, mid = Math.floor(f / 2);
    expect(focus.field[mid * f + mid]).toBeGreaterThan(0.5);
    // The box has to reach up near the disc's true geometric top (0.08,
    // for a center at 0.5 and outerR 0.42) even though that side of the
    // rim — opposite the angle-0.9 highlight — has essentially no local
    // edge signal of its own to trigger on.
    expect(focus.top).toBeLessThan(0.3);
  });

  it("still keeps two genuinely separate blobs disconnected after the enclosed-hole fill", () => {
    const size = 200;
    const source = makeFlatSource(size);
    const buf = getCanvasBuffer(source);
    paintFlatBlob(buf, size, size * 0.22, size * 0.5, size * 0.09, size * 0.16);
    paintFlatBlob(buf, size, size * 0.78, size * 0.5, size * 0.09, size * 0.16);
    const focus = analyzeOrganicFocus(source);

    const f = FIELD_SIZE;
    const sampleAt = (u: number, v: number) => {
      const x = Math.min(f - 1, Math.max(0, Math.round(u * f)));
      const y = Math.min(f - 1, Math.max(0, Math.round(v * f)));
      return focus.field[y * f + x];
    };
    expect(sampleAt(0.22, 0.5)).toBeGreaterThan(0.5); // inside the left blob's flat body
    expect(sampleAt(0.78, 0.5)).toBeGreaterThan(0.5); // inside the right blob's flat body
    expect(sampleAt(0.5, 0.5)).toBeLessThan(0.5); // the real background between them stays open
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
