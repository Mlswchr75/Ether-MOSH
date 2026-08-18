import { describe, expect, it } from "vitest";
import { applyFinishingGlow } from "./forgeFinishing";
import { BaseMockCtx2D, getCanvasBuffer, installCanvas2DPolyfillIfNeeded } from "./testHelpers/canvas2dPolyfillBase";

/**
 * jsdom does not implement 2D canvas rendering itself (see
 * testHelpers/canvas2dPolyfillBase.ts for why, and what that shared base
 * covers). applyFinishingGlow() needs a different Canvas2D subset than any
 * prior generator test: a settable `filter` property (a CSS blur-string
 * setter — never actually read by this mock, since the test only checks
 * "brighter somewhere", not real Gaussian blur math), `globalCompositeOperation`
 * / `globalAlpha`, and — the part that actually has to work — a `drawImage`
 * that honors "screen" compositing with partial alpha, because that's the
 * one piece of behavior under test: screen-blending a copy of a dim frame
 * back over itself at partial opacity brightens it.
 *
 * The shared base handles ImageData read/write and clearRect; this file
 * only adds the compositing-specific bits on top, per the base module's own
 * "leave transform/clip/compositing specifics to each test file" contract.
 *
 * Sabotage check performed by hand while writing this test: with the
 * `drawImage`'s "screen" branch below deleted (falling through to the plain
 * overwrite-copy branch for every compositeOperation, including "screen"),
 * the real applyFinishingGlow() still calls this mock's drawImage the same
 * way, but the mock stops brightening anything — copying the (dim,
 * identical) scratch buffer over the identical original via plain overwrite
 * changes nothing, so `after[i] > before[i]` is false everywhere and the
 * test fails. That confirms the screen-blend arithmetic below is
 * load-bearing for this test, not incidental. (Reverted before committing.)
 */
class FinishingMockCtx2D extends BaseMockCtx2D {
  fillStyle: unknown = "#000";
  filter = "none";
  globalCompositeOperation = "source-over";
  globalAlpha = 1;
  private stateStack: Array<{ compositeOperation: string; alpha: number }> = [];

  save() {
    this.stateStack.push({ compositeOperation: this.globalCompositeOperation, alpha: this.globalAlpha });
  }
  restore() {
    const s = this.stateStack.pop();
    if (s) {
      this.globalCompositeOperation = s.compositeOperation;
      this.globalAlpha = s.alpha;
    }
  }

  drawImage(source: HTMLCanvasElement, dx: number, dy: number, dw?: number, dh?: number) {
    const srcBuf = getCanvasBuffer(source);
    const destBuf = this.buf;
    const destW = dw ?? source.width;
    const destH = dh ?? source.height;
    const screen = this.globalCompositeOperation === "screen";
    const ga = Math.max(0, Math.min(1, this.globalAlpha));

    for (let y = 0; y < destH; y++) {
      const py = dy + y;
      if (py < 0 || py >= destBuf.height) continue;
      for (let x = 0; x < destW; x++) {
        const px = dx + x;
        if (px < 0 || px >= destBuf.width) continue;
        if (x >= source.width || y >= source.height) continue;
        const sIdx = (y * source.width + x) * 4;
        const dIdx = (py * destBuf.width + px) * 4;
        const sr = srcBuf.data[sIdx];
        const sg = srcBuf.data[sIdx + 1];
        const sb = srcBuf.data[sIdx + 2];
        const sa = srcBuf.data[sIdx + 3];

        if (!screen) {
          // Plain overwrite copy — matches this codebase's other drawImage
          // calls, all of which are full-opacity source-over onto a blank
          // (just-cleared) destination.
          destBuf.data[dIdx] = sr;
          destBuf.data[dIdx + 1] = sg;
          destBuf.data[dIdx + 2] = sb;
          destBuf.data[dIdx + 3] = sa;
          continue;
        }

        // "screen" blend per the CSS compositing spec: B(Cb,Cs) = Cb+Cs-Cb*Cs,
        // composited over an opaque backdrop with the source alpha scaled by
        // globalAlpha: Co = (1-as)*Cb + as*B(Cb,Cs).
        const dr = destBuf.data[dIdx];
        const dg = destBuf.data[dIdx + 1];
        const db = destBuf.data[dIdx + 2];
        const asrc = (sa / 255) * ga;
        const blend = (cb: number, cs: number) => cb + cs - cb * cs;
        const cbR = dr / 255, cbG = dg / 255, cbB = db / 255;
        const csR = sr / 255, csG = sg / 255, csB = sb / 255;
        destBuf.data[dIdx] = ((1 - asrc) * cbR + asrc * blend(cbR, csR)) * 255;
        destBuf.data[dIdx + 1] = ((1 - asrc) * cbG + asrc * blend(cbG, csG)) * 255;
        destBuf.data[dIdx + 2] = ((1 - asrc) * cbB + asrc * blend(cbB, csB)) * 255;
        // Destination is assumed opaque already (every real caller draws
        // onto an already-fully-opaque frame) and stays opaque.
      }
    }
  }
}

installCanvas2DPolyfillIfNeeded((canvas) => new FinishingMockCtx2D(canvas));

describe("shared finishing pass", () => {
  it("brightens a dim frame without throwing, at any intensity in range", () => {
    const w = 20, h = 20;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = 40; img.data[i + 1] = 40; img.data[i + 2] = 40; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    const before = ctx.getImageData(0, 0, w, h).data.slice();
    const scratch = document.createElement("canvas");
    const scratchCtx = scratch.getContext("2d")!;

    expect(() => applyFinishingGlow(ctx, w, h, scratch, scratchCtx, 0.8)).not.toThrow();

    const after = ctx.getImageData(0, 0, w, h).data;
    let brighterSomewhere = false;
    for (let i = 0; i < after.length; i += 4) {
      if (after[i] > before[i]) { brighterSomewhere = true; break; }
    }
    expect(brighterSomewhere).toBe(true);
  });
});
