/**
 * Shared base for this project's Canvas2D jsdom polyfills.
 *
 * jsdom does not implement 2D canvas rendering itself — that requires the
 * native `canvas` npm package, which needs a system cairo/pkg-config
 * toolchain unavailable in this sandbox. Four generator test files
 * (driftField, shatterField, pourBloom, forgeKaleidoscope) each built their
 * own from-scratch mock covering only what that test needed, and they
 * drifted apart: driftField's and pourBloom's `getImageData` zero-fills any
 * read that falls outside the canvas bounds, while forgeKaleidoscope's does
 * a real bounds-checked partial copy that only zeroes the truly-out-of-range
 * pixels. That's a genuine behavioral difference for any test that reads a
 * region hanging off the canvas edge.
 *
 * This module factors out only the part that's genuinely common and not
 * generator-specific: ImageData read/write and clearRect, bounds-checked the
 * way forgeKaleidoscope's does it, plus a pixel-buffer registry keyed by
 * canvas element (not by context instance) so a subclass's own drawImage can
 * look up *any* canvas's backing buffer — including a source canvas that
 * belongs to a different mock context, which is exactly what a two-canvas
 * (source + destination) compositing test needs. The registry also
 * re-allocates (and clears, matching real canvas behavior) a canvas's buffer
 * if its width/height have changed since the buffer was created — needed by
 * any test that calls `canvas.getContext("2d")` before setting
 * `canvas.width`/`canvas.height` and only sizes it afterward.
 *
 * Deliberately NOT included here: transforms, clip paths, gradients, blend
 * modes, filters — anything generator- or effect-specific stays in the test
 * file that needs it. This is not a general Canvas2D emulator, just the
 * sliver that was genuinely identical across the existing mocks.
 *
 * Not retrofitted into the four existing test files — each already has a
 * working, reviewed mock, and migrating them is out of scope for the task
 * that introduced this module. A future consolidation pass could move them
 * onto this base and, in doing so, resolve the getImageData divergence
 * described above in one place instead of four.
 */

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const canvasBuffers = new WeakMap<HTMLCanvasElement, PixelBuffer>();

/**
 * Returns the canonical backing buffer for a canvas element, allocating (or
 * re-allocating, if the canvas's dimensions changed since last time) as
 * needed. Re-allocation clears the buffer, matching real `<canvas>` resize
 * semantics — this is what lets a test call `getContext("2d")` on a
 * default-sized (300x150) canvas and only size it afterward.
 */
export function getCanvasBuffer(canvas: HTMLCanvasElement): PixelBuffer {
  const existing = canvasBuffers.get(canvas);
  if (existing && existing.width === canvas.width && existing.height === canvas.height) {
    return existing;
  }
  const fresh: PixelBuffer = {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(canvas.width * canvas.height * 4),
  };
  canvasBuffers.set(canvas, fresh);
  return fresh;
}

/** Minimal ImageData-shaped object our mocks pass around instead of a real ImageData. */
export interface MockImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class BaseMockCtx2D {
  constructor(protected canvas: HTMLCanvasElement) {}

  /** Always resolved fresh so a mid-test canvas resize is picked up correctly. */
  protected get buf(): PixelBuffer {
    return getCanvasBuffer(this.canvas);
  }

  createImageData(w: number, h: number): MockImageData {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  putImageData(imageData: MockImageData, dx: number, dy: number) {
    const buf = this.buf;
    if (dx === 0 && dy === 0 && imageData.data.length === buf.data.length) {
      buf.data.set(imageData.data);
      return;
    }
    for (let y = 0; y < imageData.height; y++) {
      const py = dy + y;
      if (py < 0 || py >= buf.height) continue;
      for (let x = 0; x < imageData.width; x++) {
        const px = dx + x;
        if (px < 0 || px >= buf.width) continue;
        const srcIdx = (y * imageData.width + x) * 4;
        const dstIdx = (py * buf.width + px) * 4;
        buf.data[dstIdx] = imageData.data[srcIdx];
        buf.data[dstIdx + 1] = imageData.data[srcIdx + 1];
        buf.data[dstIdx + 2] = imageData.data[srcIdx + 2];
        buf.data[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray } {
    const buf = this.buf;
    if (sx === 0 && sy === 0 && sw === buf.width && sh === buf.height) {
      return { data: buf.data };
    }
    const out = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const srcX = sx + x;
        const srcY = sy + y;
        if (srcX < 0 || srcY < 0 || srcX >= buf.width || srcY >= buf.height) continue;
        const srcIdx = (srcY * buf.width + srcX) * 4;
        const dstIdx = (y * sw + x) * 4;
        out[dstIdx] = buf.data[srcIdx];
        out[dstIdx + 1] = buf.data[srcIdx + 1];
        out[dstIdx + 2] = buf.data[srcIdx + 2];
        out[dstIdx + 3] = buf.data[srcIdx + 3];
      }
    }
    return { data: out };
  }

  clearRect(x: number, y: number, w: number, h: number) {
    const buf = this.buf;
    for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(buf.height, Math.ceil(y + h)); yy++) {
      for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(buf.width, Math.ceil(x + w)); xx++) {
        const idx = (yy * buf.width + xx) * 4;
        buf.data[idx] = 0;
        buf.data[idx + 1] = 0;
        buf.data[idx + 2] = 0;
        buf.data[idx + 3] = 0;
      }
    }
  }
}

/**
 * Shared install plumbing: feature-detects a real Canvas2D implementation
 * and, only if unavailable, monkey-patches `HTMLCanvasElement.prototype
 * .getContext` to hand back one mock instance per canvas (via `createCtx`).
 * Identical across all of this project's Canvas2D test polyfills except for
 * which mock class `createCtx` instantiates, so it lives here rather than
 * being copy-pasted again.
 */
export function installCanvas2DPolyfillIfNeeded(createCtx: (canvas: HTMLCanvasElement) => unknown) {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  if (probe.getContext("2d")) return; // real implementation available.

  const contexts = new WeakMap<HTMLCanvasElement, unknown>();
  const original = HTMLCanvasElement.prototype.getContext;
  // @typescript-eslint/no-explicit-any is off project-wide (see eslint
  // config), so no disable comment is needed for this cast — monkey-patching
  // a native prototype method's overloaded signature isn't expressible more
  // narrowly without losing the point of the mock.
  (HTMLCanvasElement.prototype as any).getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    if (type !== "2d") return original.apply(this, [type, ...rest] as never);
    let c = contexts.get(this);
    if (!c) {
      c = createCtx(this);
      contexts.set(this, c);
    }
    return c;
  };
}
