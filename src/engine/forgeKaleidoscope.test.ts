import { describe, expect, it } from "vitest";
import { applyKaleidoscope, KALEIDOSCOPE_FOLD_OPTIONS } from "./forgeKaleidoscope";

/**
 * jsdom does not implement 2D canvas rendering itself — that requires the
 * native `canvas` npm package, which needs a system cairo/pkg-config
 * toolchain this sandbox doesn't have. Feature-detect and, only when the
 * real context is unavailable (getContext("2d") returns null rather than
 * throwing), install an in-memory 2D context.
 *
 * applyKaleidoscope() needs materially more of the Canvas2D surface than
 * prior generator tests: transforms (translate/rotate/scale), a clip path
 * built from arc()/moveTo()/closePath(), and drawImage() of another canvas.
 * For the test's assertions to be meaningful, this mock has to actually
 * honor those semantics rather than stub them out:
 *   - the transform stack (translate/rotate/scale, save/restore) is tracked
 *     as a real 2x3 matrix, composed in call order, exactly as the spec
 *     requires;
 *   - clip() intersects the current path's winding against future draws —
 *     modeled as a wedge test (angle-from-clip-origin-in-[startAngle,
 *     endAngle) unioned across nested clips via intersection);
 *   - drawImage() samples the source canvas's own backing pixel buffer by
 *     inverse-mapping each destination pixel through the current transform,
 *     and only writes pixels that fall inside the active clip.
 * This mock's transform/clip/drawImage math is faithful enough that a wrong
 * rotation angle, mirror scale, or wedge clip bound genuinely does move
 * source pixels to a different device pixel than the correct implementation
 * would. But *faithful semantics* is not the same as *tests that exercise
 * them*: whether a given bug is actually caught depends on what the source
 * canvas looks like and which pixels a test samples.
 *   - A solid-colour source (see "preserves a solid-colour source" below) is
 *     invariant under rotation and mirroring — every wedge samples the same
 *     content regardless of orientation — so that test's single center-pixel
 *     check can only catch a wedge ending up completely unwritten at the
 *     canvas center, never a wrong rotation direction or a wrong/missing
 *     mirror condition. Flipping `if (i % 2 === 1) ctx.scale(1, -1)` to an
 *     unconditional `scale(1, -1)`, or negating the rotation angle, leaves
 *     that test's assertions unchanged and passing.
 *   - Catching orientation bugs (wrong mirror condition, wrong rotation
 *     direction) requires a source that is *not* rotationally/mirror
 *     symmetric, sampled at specific hand-derived pixel coordinates whose
 *     expected color differs between the correct and the buggy math. See
 *     "distinguishes mirrored wedges from unmirrored wedges" below, which
 *     was verified (by literally introducing both bugs and watching it fail)
 *     to catch both an unconditional mirror and a negated rotation angle.
 *   - Catching a wedge whose *angular span* is wrong — narrower than claimed
 *     (e.g. a clip end angle off by a fraction of a radian) or entirely
 *     skipped (e.g. an off-by-one loop bound) — requires sampling many
 *     points spread across each wedge's claimed range, including points
 *     close to its start/end edges, not just its center or two isolated
 *     hand-picked points. Neither of the two tests above does this: the
 *     solid-colour test only ever looks at the canvas center (which happens
 *     to fall inside wedge 0 regardless of how any *other* wedge is
 *     mis-clipped), and the asymmetric-source test's two sample points were
 *     chosen for orientation, not boundary, coverage. See "paints every
 *     wedge's full claimed angular span" below, which was verified (by
 *     literally introducing a 0.3-rad wedge-narrowing bug and a skip-last-
 *     wedge off-by-one bug, one at a time, and watching it fail both times)
 *     to catch both, while the tests above stayed green for both.
 */
function installCanvas2DPolyfillIfNeeded() {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  if (probe.getContext("2d")) return; // real implementation available.

  type Mat = [number, number, number, number, number, number]; // a b c d e f

  function multiply(m1: Mat, m2: Mat): Mat {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1,
    ];
  }

  function invert(m: Mat): Mat {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    const ia = d / det;
    const ib = -b / det;
    const ic = -c / det;
    const id = a / det;
    const ie = -(ia * e + ic * f);
    const if_ = -(ib * e + id * f);
    return [ia, ib, ic, id, ie, if_];
  }

  function apply(m: Mat, x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = m;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  interface Wedge {
    cx: number;
    cy: number;
    start: number;
    end: number;
  }

  interface PixelBuffer {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }

  const canvasBuffers = new WeakMap<HTMLCanvasElement, PixelBuffer>();

  function getBuffer(canvas: HTMLCanvasElement): PixelBuffer {
    let buf = canvasBuffers.get(canvas);
    if (!buf) {
      buf = { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4) };
      canvasBuffers.set(canvas, buf);
    }
    return buf;
  }

  function normalizeAngle(a: number): number {
    const twoPi = Math.PI * 2;
    let r = a % twoPi;
    if (r < 0) r += twoPi;
    return r;
  }

  function angleInWedge(angle: number, wedge: Wedge): boolean {
    const a = normalizeAngle(angle);
    const start = normalizeAngle(wedge.start);
    let end = normalizeAngle(wedge.end);
    if (end <= start) end += Math.PI * 2;
    let aa = a;
    if (aa < start) aa += Math.PI * 2;
    return aa >= start - 1e-9 && aa <= end + 1e-9;
  }

  class MockCtx2D {
    fillStyle: unknown = "#000";
    globalCompositeOperation = "source-over";
    private buf: PixelBuffer;
    private matrixStack: Mat[] = [[1, 0, 0, 1, 0, 0]];
    private clipStack: (Wedge | null)[] = [null];
    // Path-building state, used to derive a clip wedge on clip().
    private pathPoints: Array<{ x: number; y: number }> = [];
    private pathArc: { cx: number; cy: number; start: number; end: number } | null = null;

    constructor(private canvas: HTMLCanvasElement) {
      this.buf = getBuffer(canvas);
    }

    private get matrix(): Mat {
      return this.matrixStack[this.matrixStack.length - 1];
    }
    private set matrix(m: Mat) {
      this.matrixStack[this.matrixStack.length - 1] = m;
    }
    private get clip_(): Wedge | null {
      return this.clipStack[this.clipStack.length - 1];
    }

    createImageData(w: number, h: number) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    }
    putImageData(imageData: { data: Uint8ClampedArray }, dx: number, dy: number) {
      if (dx === 0 && dy === 0 && imageData.data.length === this.buf.data.length) {
        this.buf.data.set(imageData.data);
      }
    }
    getImageData(sx: number, sy: number, sw: number, sh: number) {
      if (sx === 0 && sy === 0 && sw === this.canvas.width && sh === this.canvas.height) {
        return { data: this.buf.data };
      }
      const out = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const srcX = sx + x;
          const srcY = sy + y;
          if (srcX < 0 || srcY < 0 || srcX >= this.buf.width || srcY >= this.buf.height) continue;
          const srcIdx = (srcY * this.buf.width + srcX) * 4;
          const dstIdx = (y * sw + x) * 4;
          out[dstIdx] = this.buf.data[srcIdx];
          out[dstIdx + 1] = this.buf.data[srcIdx + 1];
          out[dstIdx + 2] = this.buf.data[srcIdx + 2];
          out[dstIdx + 3] = this.buf.data[srcIdx + 3];
        }
      }
      return { data: out };
    }

    save() {
      this.matrixStack.push([...this.matrix] as Mat);
      this.clipStack.push(this.clip_);
    }
    restore() {
      if (this.matrixStack.length > 1) this.matrixStack.pop();
      if (this.clipStack.length > 1) this.clipStack.pop();
    }

    translate(x: number, y: number) {
      this.matrix = multiply(this.matrix, [1, 0, 0, 1, x, y]);
    }
    rotate(rad: number) {
      const c = Math.cos(rad), s = Math.sin(rad);
      this.matrix = multiply(this.matrix, [c, s, -s, c, 0, 0]);
    }
    scale(sx: number, sy: number) {
      this.matrix = multiply(this.matrix, [sx, 0, 0, sy, 0, 0]);
    }

    beginPath() {
      this.pathPoints = [];
      this.pathArc = null;
    }
    moveTo(x: number, y: number) {
      const [wx, wy] = apply(this.matrix, x, y);
      this.pathPoints.push({ x: wx, y: wy });
    }
    arc(cx: number, cy: number, _r: number, startAngle: number, endAngle: number) {
      const [wx, wy] = apply(this.matrix, cx, cy);
      this.pathArc = { cx: wx, cy: wy, start: startAngle, end: endAngle };
    }
    closePath() {
      // no-op for wedge purposes
    }
    clip() {
      if (!this.pathArc) return;
      const wedge: Wedge = {
        cx: this.pathArc.cx,
        cy: this.pathArc.cy,
        start: this.pathArc.start,
        end: this.pathArc.end,
      };
      // Intersect with any existing clip (kaleidoscope only ever nests one
      // wedge at a time per save/restore cycle, so last-wedge-wins is
      // sufficient and still lets a wrong wedge bound be caught).
      this.clipStack[this.clipStack.length - 1] = wedge;
    }

    clearRect(x: number, y: number, w: number, h: number) {
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.buf.height, Math.ceil(y + h)); yy++) {
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.buf.width, Math.ceil(x + w)); xx++) {
          const idx = (yy * this.buf.width + xx) * 4;
          this.buf.data[idx] = 0;
          this.buf.data[idx + 1] = 0;
          this.buf.data[idx + 2] = 0;
          this.buf.data[idx + 3] = 0;
        }
      }
    }

    drawImage(source: HTMLCanvasElement, dx: number, dy: number, dw?: number, dh?: number) {
      const srcBuf = getBuffer(source);
      const destW = dw ?? source.width;
      const destH = dh ?? source.height;
      const inv = invert(this.matrix);
      const clip = this.clip_;
      for (let py = 0; py < this.buf.height; py++) {
        for (let px = 0; px < this.buf.width; px++) {
          if (clip) {
            const angle = Math.atan2(py + 0.5 - clip.cy, px + 0.5 - clip.cx);
            if (!angleInWedge(angle, clip)) continue;
          }
          // Inverse-map destination pixel (in device space) through the
          // current transform to find where it lands in local draw space,
          // then account for the drawImage(dx,dy,dw,dh) placement.
          const [lx, ly] = apply(inv, px + 0.5, py + 0.5);
          const sxf = ((lx - dx) / destW) * source.width;
          const syf = ((ly - dy) / destH) * source.height;
          const sx = Math.floor(sxf);
          const sy = Math.floor(syf);
          if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
          const srcIdx = (sy * source.width + sx) * 4;
          const dstIdx = (py * this.buf.width + px) * 4;
          this.buf.data[dstIdx] = srcBuf.data[srcIdx];
          this.buf.data[dstIdx + 1] = srcBuf.data[srcIdx + 1];
          this.buf.data[dstIdx + 2] = srcBuf.data[srcIdx + 2];
          this.buf.data[dstIdx + 3] = srcBuf.data[srcIdx + 3];
        }
      }
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

function solidCanvas(w: number, h: number, rgba: [number, number, number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rgba[0]; img.data[i + 1] = rgba[1]; img.data[i + 2] = rgba[2]; img.data[i + 3] = rgba[3];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

describe("kaleidoscope modifier", () => {
  it("offers only even fold counts, so the mirror trick lines up at wedge seams", () => {
    for (const f of KALEIDOSCOPE_FOLD_OPTIONS) expect(f % 2).toBe(0);
  });

  it("preserves a solid-colour source (every wedge samples the same content)", () => {
    // NOTE: a solid colour is invariant under rotation/mirroring, so this
    // only checks that the canvas center (inside wedge 0) is opaque — it
    // says nothing about any *other* wedge's coverage, and nothing about
    // orientation. It cannot detect a wrong mirror condition or a wrong
    // rotation direction — see "distinguishes mirrored wedges from
    // unmirrored wedges" below for that — and it cannot detect a narrowed
    // or skipped wedge unless that bug happens to blank this exact center
    // pixel — see "paints every wedge's full claimed angular span" below,
    // which samples every wedge's boundary region directly instead of
    // relying on that kind of coincidence.
    const w = 20, h = 20;
    const source = solidCanvas(w, h, [10, 20, 30, 255]);
    const dest = document.createElement("canvas");
    dest.width = w; dest.height = h;
    const ctx = dest.getContext("2d")!;
    applyKaleidoscope(ctx, w, h, 4, source);
    const px = ctx.getImageData(0, 0, w, h).data;
    // Center pixels should be fully covered and close to the source colour —
    // interpolation at wedge edges means "close", not exact, everywhere.
    const centerIdx = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
    expect(px[centerIdx + 3]).toBeGreaterThan(0);
  });

  it("distinguishes mirrored wedges from unmirrored wedges via an asymmetric source (catches a wrong mirror condition or a wrong rotation direction)", () => {
    // A solid-colour source can't tell a mirrored wedge from an unmirrored
    // one, or a wedge rotated the right way from one rotated the wrong way —
    // it looks the same either way. This test uses a source with two small,
    // distinct, off-center marker blocks on a black background, so a
    // specific device pixel's sampled color depends on the *exact* rotation
    // + mirror math, not just "did some source pixel land here."
    //
    // Geometry, worked out by hand for w=h=40 (cx=cy=20), folds=4
    // (wedgeAngle=90°), and confirmed empirically by running
    // applyKaleidoscope against a coordinate-encoding source (pixel (x,y) =
    // color (x,y,0,255)) and reading back what source pixel each test point
    // actually sampled:
    //
    //   Device pixel (5,25) falls in wedge i=1 (angle range [90°,180°), an
    //   ODD wedge, so mirroring applies for both the correct and the
    //   mirror-condition-sabotaged implementation — only a wrong rotation
    //   DIRECTION changes this point's sampled source pixel:
    //     correct (rotate(i*90°), mirror on):        source (25,5)
    //     rotate(-i*90°) [negated rotation, sabotage]: source (14,34)
    //   So this point is the rotation-direction check.
    //
    //   Device pixel (10,5) falls in wedge i=2 (angle range [180°,270°), an
    //   EVEN wedge, so it is NOT mirrored correctly — only an unconditional
    //   `ctx.scale(1, -1)` (mirroring every wedge, sabotage) changes this
    //   point's sampled source pixel; rotation direction doesn't affect it:
    //     correct (rotate(i*90°), mirror off):        source (29,34)
    //     unconditional mirror [sabotage]:             source (29,5)
    //   So this point is the mirror-condition check.
    //
    // Each marker is painted as a 3x3 block (not a single pixel) so the
    // assertion samples the block's interior with a 1px margin, insulating
    // it from any edge-adjacent antialiasing if this ever runs against a
    // real (non-polyfilled) Canvas2D implementation.
    const w = 40, h = 40;
    const source = document.createElement("canvas");
    source.width = w; source.height = h;
    const sctx = source.getContext("2d")!;
    const img = sctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255;
    }
    const paintBlock = (bx: number, by: number, rgba: [number, number, number, number]) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const idx = ((by + dy) * w + (bx + dx)) * 4;
          img.data[idx] = rgba[0]; img.data[idx + 1] = rgba[1]; img.data[idx + 2] = rgba[2]; img.data[idx + 3] = rgba[3];
        }
      }
    };
    const red: [number, number, number, number] = [220, 20, 20, 255]; // wedge-1 (rotation check) marker
    const blue: [number, number, number, number] = [20, 20, 220, 255]; // wedge-2 (mirror check) marker
    paintBlock(25, 5, red);
    paintBlock(29, 34, blue);
    sctx.putImageData(img, 0, 0);

    const dest = document.createElement("canvas");
    dest.width = w; dest.height = h;
    const ctx = dest.getContext("2d")!;
    applyKaleidoscope(ctx, w, h, 4, source);
    const px = ctx.getImageData(0, 0, w, h).data;

    const wedge1Idx = (25 * w + 5) * 4; // device (5,25) -> should sample source (25,5) -> red
    expect(Array.from(px.slice(wedge1Idx, wedge1Idx + 4))).toEqual(red);

    const wedge2Idx = (5 * w + 10) * 4; // device (10,5) -> should sample source (29,34) -> blue
    expect(Array.from(px.slice(wedge2Idx, wedge2Idx + 4))).toEqual(blue);
  });

  it("does not throw for every supported fold count", () => {
    const w = 16, h = 16;
    const source = solidCanvas(w, h, [200, 100, 50, 255]);
    const dest = document.createElement("canvas");
    dest.width = w; dest.height = h;
    const ctx = dest.getContext("2d")!;
    for (const folds of KALEIDOSCOPE_FOLD_OPTIONS) {
      expect(() => applyKaleidoscope(ctx, w, h, folds, source)).not.toThrow();
    }
  });

  it("paints every wedge's full claimed angular span, including near its start/end edges (catches a narrowed or skipped wedge)", () => {
    // The tests above sample only wedge centers (the solid-colour test) or
    // two hand-picked points chosen to distinguish rotation/mirror math (the
    // asymmetric-source test). Neither samples near a wedge's *angular
    // boundary*, so neither catches a wedge whose clip is narrower than
    // claimed, or a wedge that's skipped outright — both were verified (by
    // literally applying each edit below and rerunning the then-4-test
    // suite) to leave every existing test green:
    //
    //   1. Narrowing every wedge's clip end angle by 0.3 rad:
    //        ctx.arc(cx, cy, reach, i * wedgeAngle, (i + 1) * wedgeAngle - 0.3)
    //      instead of
    //        ctx.arc(cx, cy, reach, i * wedgeAngle, (i + 1) * wedgeAngle)
    //   2. Off-by-one loop bound that drops the last wedge entirely:
    //        for (let i = 0; i < folds - 1; i++)
    //      instead of
    //        for (let i = 0; i < folds; i++)
    //
    // Both are angular-coverage bugs: some sub-range of a wedge's claimed
    // [i*wedgeAngle, (i+1)*wedgeAngle) span ends up unpainted (alpha 0,
    // since applyKaleidoscope clearRect()s the canvas before drawing). This
    // test samples 8 points per wedge — spread from close to the start edge
    // to close to the end edge, not just the middle — at a fixed radius
    // from center, for every wedge of every supported fold count, and
    // asserts each one is fully painted with the (invariant-under-rotation)
    // solid source colour.
    //
    // Why these specific offsets catch bug #1: two of the eight points sit
    // 0.15 rad in from each wedge edge. 0.15 rad is comfortably inside the
    // true wedge, but a wedge narrowed by 0.3 rad has its end edge pulled in
    // by exactly 0.3 rad — since 0.15 < 0.3, the near-end point (start +
    // wedgeAngle - 0.15) falls *outside* the narrowed clip and is never
    // drawn by any wedge's pass (wedge i+1's own clip starts only at
    // (i+1)*wedgeAngle, which is further along than this point). This holds
    // for every supported fold count: the smallest wedge angle (folds=8) is
    // ~0.785 rad, so a 0.15 rad margin from each edge never crosses the
    // wedge's own midpoint or collides with the near-start/near-end pair.
    //
    // Why these offsets aren't just pixel-quantization noise: at the chosen
    // radius (r=80 in a 200x200 canvas), one pixel subtends roughly 1/80 =
    // 0.0125 rad. A 0.15 rad (and even the tighter 0.05 rad) offset from an
    // edge is 4-12x that, so a correctly-clipped wedge paints these points
    // solidly with margin to spare — this isn't a coincidental pass the way
    // the single center-pixel check in the solid-colour test was for a
    // 0.05 rad sliver wedge.
    //
    // Why this catches bug #2: every wedge (including the last) is sampled,
    // so if the last wedge is skipped, all 8 of its sample points read back
    // alpha 0 rather than the source colour.
    const w = 200, h = 200;
    const cx = w / 2, cy = h / 2;
    const r = 80;
    const rgba: [number, number, number, number] = [10, 20, 30, 255];

    for (const folds of KALEIDOSCOPE_FOLD_OPTIONS) {
      const source = solidCanvas(w, h, rgba);
      const dest = document.createElement("canvas");
      dest.width = w; dest.height = h;
      const ctx = dest.getContext("2d")!;
      applyKaleidoscope(ctx, w, h, folds, source);
      const px = ctx.getImageData(0, 0, w, h).data;

      const wedgeAngle = (Math.PI * 2) / folds;
      for (let i = 0; i < folds; i++) {
        const start = i * wedgeAngle;
        const offsets = [
          0.05,
          0.15,
          wedgeAngle * 0.25,
          wedgeAngle * 0.4,
          wedgeAngle * 0.6,
          wedgeAngle * 0.75,
          wedgeAngle - 0.15,
          wedgeAngle - 0.05,
        ];
        for (const offset of offsets) {
          const angle = start + offset;
          const sx = Math.round(cx + r * Math.cos(angle) - 0.5);
          const sy = Math.round(cy + r * Math.sin(angle) - 0.5);
          const idx = (sy * w + sx) * 4;
          expect(Array.from(px.slice(idx, idx + 4))).toEqual(rgba);
        }
      }
    }
  });
});
