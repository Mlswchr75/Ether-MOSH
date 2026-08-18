import { describe, expect, it } from "vitest";
import { paintForgeSource, createForgeRuntime, TRANSITION_MS } from "./forgeSource";
import type { ForgeState } from "@/store/types";
import { BaseMockCtx2D, getCanvasBuffer, installCanvas2DPolyfillIfNeeded } from "./testHelpers/canvas2dPolyfillBase";

/**
 * jsdom does not implement 2D canvas rendering itself (see
 * testHelpers/canvas2dPolyfillBase.ts for why, and what that shared base
 * covers). paintForgeSource() is the orchestrator on top of every generator
 * plus the kaleidoscope and finishing passes, so its test needs the union of
 * what each of those needed individually:
 *   - ImageData read/write + clearRect (the shared base) — drawSeamless (via
 *     Drift Field) and the two field generators write pixels directly.
 *   - save/restore, transforms (translate/rotate/scale), a clip path built
 *     from moveTo/arc/closePath/clip, and a transform+clip-aware drawImage —
 *     needed by applyKaleidoscope. Modeled after forgeKaleidoscope.test.ts's
 *     mock.
 *   - globalAlpha, globalCompositeOperation, a settable `filter` string, and
 *     a compositing-aware drawImage honoring "screen" blending at partial
 *     alpha — needed by applyFinishingGlow and by this orchestrator's own
 *     crossfade (plain "source-over" drawImage at varying globalAlpha).
 *     Modeled after forgeFinishing.test.ts's mock.
 *   - createRadialGradient/fillStyle/beginPath/arc/fill as no-ops — Drift
 *     Field's blob pass (via drawSeamless) calls these but this test's
 *     assertions never depend on blob visuals, only on "fully opaque" /
 *     "not throwing" / "some content", same as driftField.test.ts's mock.
 */
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

class ForgeSourceMockCtx2D extends BaseMockCtx2D {
  fillStyle: unknown = "#000";
  filter = "none";
  globalCompositeOperation = "source-over";
  globalAlpha = 1;
  private matrixStack: Mat[] = [[1, 0, 0, 1, 0, 0]];
  private clipStack: (Wedge | null)[] = [null];
  private stateStack: Array<{ compositeOperation: string; alpha: number; matrix: Mat; clip: Wedge | null }> = [];
  private pathArc: { cx: number; cy: number; start: number; end: number } | null = null;

  private get matrix(): Mat {
    return this.matrixStack[this.matrixStack.length - 1];
  }
  private set matrix(m: Mat) {
    this.matrixStack[this.matrixStack.length - 1] = m;
  }
  private get clip_(): Wedge | null {
    return this.clipStack[this.clipStack.length - 1];
  }

  save() {
    this.stateStack.push({
      compositeOperation: this.globalCompositeOperation,
      alpha: this.globalAlpha,
      matrix: [...this.matrix] as Mat,
      clip: this.clip_,
    });
    this.matrixStack.push([...this.matrix] as Mat);
    this.clipStack.push(this.clip_);
  }
  restore() {
    const s = this.stateStack.pop();
    if (s) {
      this.globalCompositeOperation = s.compositeOperation;
      this.globalAlpha = s.alpha;
    }
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

  private pathPoints: Array<{ x: number; y: number }> = [];
  beginPath() {
    this.pathPoints = [];
    this.pathArc = null;
  }
  moveTo(x: number, y: number) {
    const [wx, wy] = apply(this.matrix, x, y);
    this.pathPoints.push({ x: wx, y: wy });
  }
  arc(cx: number, cy: number, _r: number, startAngle?: number, endAngle?: number) {
    if (startAngle === undefined || endAngle === undefined) return; // no-op arcs (blob pass)
    const [wx, wy] = apply(this.matrix, cx, cy);
    this.pathArc = { cx: wx, cy: wy, start: startAngle, end: endAngle };
  }
  closePath() {}
  clip() {
    if (!this.pathArc) return;
    this.clipStack[this.clipStack.length - 1] = {
      cx: this.pathArc.cx,
      cy: this.pathArc.cy,
      start: this.pathArc.start,
      end: this.pathArc.end,
    };
  }
  fill() {}
  createRadialGradient() {
    return { addColorStop: () => {} };
  }

  drawImage(source: HTMLCanvasElement, dx: number, dy: number, dw?: number, dh?: number) {
    const srcBuf = getCanvasBuffer(source);
    const destBuf = this.buf;
    const destW = dw ?? source.width;
    const destH = dh ?? source.height;
    const screen = this.globalCompositeOperation === "screen";
    const ga = Math.max(0, Math.min(1, this.globalAlpha));
    const inv = invert(this.matrix);
    const clip = this.clip_;

    for (let py = 0; py < destBuf.height; py++) {
      for (let px = 0; px < destBuf.width; px++) {
        if (clip) {
          const angle = Math.atan2(py + 0.5 - clip.cy, px + 0.5 - clip.cx);
          if (!angleInWedge(angle, clip)) continue;
        }
        const [lx, ly] = apply(inv, px + 0.5, py + 0.5);
        const sxf = ((lx - dx) / destW) * source.width;
        const syf = ((ly - dy) / destH) * source.height;
        const sx = Math.floor(sxf);
        const sy = Math.floor(syf);
        if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;

        const sIdx = (sy * source.width + sx) * 4;
        const dIdx = (py * destBuf.width + px) * 4;
        const sr = srcBuf.data[sIdx];
        const sg = srcBuf.data[sIdx + 1];
        const sb = srcBuf.data[sIdx + 2];
        const sa = srcBuf.data[sIdx + 3];

        if (!screen && ga >= 1) {
          destBuf.data[dIdx] = sr;
          destBuf.data[dIdx + 1] = sg;
          destBuf.data[dIdx + 2] = sb;
          destBuf.data[dIdx + 3] = sa;
          continue;
        }

        const dr = destBuf.data[dIdx];
        const dg = destBuf.data[dIdx + 1];
        const db = destBuf.data[dIdx + 2];
        const da = destBuf.data[dIdx + 3];
        const asrc = (sa / 255) * ga;

        if (screen) {
          const blend = (cb: number, cs: number) => cb + cs - cb * cs;
          const cbR = dr / 255, cbG = dg / 255, cbB = db / 255;
          const csR = sr / 255, csG = sg / 255, csB = sb / 255;
          destBuf.data[dIdx] = ((1 - asrc) * cbR + asrc * blend(cbR, csR)) * 255;
          destBuf.data[dIdx + 1] = ((1 - asrc) * cbG + asrc * blend(cbG, csG)) * 255;
          destBuf.data[dIdx + 2] = ((1 - asrc) * cbB + asrc * blend(cbB, csB)) * 255;
          destBuf.data[dIdx + 3] = Math.max(da, sa * ga);
        } else {
          // Plain source-over at partial alpha — this is the orchestrator's
          // own crossfade compositing.
          destBuf.data[dIdx] = dr * (1 - asrc) + sr * asrc;
          destBuf.data[dIdx + 1] = dg * (1 - asrc) + sg * asrc;
          destBuf.data[dIdx + 2] = db * (1 - asrc) + sb * asrc;
          destBuf.data[dIdx + 3] = Math.max(da, sa * ga);
        }
      }
    }
  }
}

installCanvas2DPolyfillIfNeeded((canvas) => new ForgeSourceMockCtx2D(canvas));

function makeCtx(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable in test environment");
  return ctx;
}

const AUDIO = { treble: 0, beat: 0, bpm: 0, regularity: 0, density: 0, brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0 };

const BASE_FORGE: ForgeState = {
  paletteIdx: 0,
  seed: 42,
  intensity: 0.6,
  seamless: false,
  stack: [],
  baseImage: null,
  baseName: null,
  overlay: 0,
  activeGeneratorId: "driftField",
  kaleidoscopeFolds: null,
  transitionFromGeneratorId: null,
  transitionStartedAt: null,
};

describe("paintForgeSource orchestration", () => {
  it("renders the active generator and produces a fully opaque frame", () => {
    const w = 32, h = 32;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    paintForgeSource(ctx, w, h, 1.0, BASE_FORGE, AUDIO, runtime);
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it("falls back to Drift Field if the active generator id is unknown, without throwing", () => {
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge = { ...BASE_FORGE, activeGeneratorId: "not-a-real-generator" };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
  });

  it("falls back to Drift Field if Volumetric Bloom's WebGL context fails to construct", () => {
    // jsdom has no WebGL, so selecting volumetricBloom must not throw or
    // leave a blank frame — it should render whatever the fallback produces.
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge = { ...BASE_FORGE, activeGeneratorId: "volumetricBloom" };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
    const px = ctx.getImageData(0, 0, w, h).data;
    let sawContent = false;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 0 || px[i + 1] > 0 || px[i + 2] > 0) { sawContent = true; break; }
    }
    expect(sawContent).toBe(true);
  });

  it("blends outgoing and incoming generators during a transition window", () => {
    const w = 16, h = 16;
    const ctx = makeCtx(w, h);
    const runtime = createForgeRuntime();
    const forge: ForgeState = {
      ...BASE_FORGE,
      activeGeneratorId: "shatterField",
      transitionFromGeneratorId: "driftField",
      transitionStartedAt: performance.now(),
    };
    expect(() => paintForgeSource(ctx, w, h, 1.0, forge, AUDIO, runtime)).not.toThrow();
  });

  it("exposes the transition duration for the store to reference", () => {
    expect(TRANSITION_MS).toBeGreaterThan(0);
  });
});
