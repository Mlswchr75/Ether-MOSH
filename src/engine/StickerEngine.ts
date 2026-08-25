import UPNG from 'upng-js';
import { segmentationEngine, type MaskResult, type SegSource } from './SegmentationEngine';

export interface StickerScore {
  value: number;       // 0–1 overall sticker-worthiness
  saturation: number;  // 0–1
  complexity: number;  // 0–1 (mosh activity / edge density)
}

function coverFitMaskAlpha(
  mask: Float32Array, maskW: number, maskH: number,
  canvasX: number, canvasY: number, canvasW: number, canvasH: number
): number {
  const vA = maskW / maskH, cA = canvasW / canvasH;
  let mx: number, my: number;
  if (vA > cA) {
    const sw = maskH * cA, sx = (maskW - sw) / 2;
    mx = (canvasX / canvasW) * sw + sx;
    my = (canvasY / canvasH) * maskH;
  } else {
    const sh = maskW / cA, sy = (maskH - sh) / 2;
    mx = (canvasX / canvasW) * maskW;
    my = (canvasY / canvasH) * sh + sy;
  }
  const mi = Math.round(my) * maskW + Math.round(mx);
  return (mi < 0 || mi >= mask.length) ? 0 : mask[mi];
}

class StickerEngine {
  private busy = false;
  private bestMask: MaskResult | null = null;
  private prevGLPixels: Uint8ClampedArray | null = null;
  private tmpCanvas: HTMLCanvasElement | null = null;
  private tmpCtx: CanvasRenderingContext2D | null = null;

  private getCtx(w: number, h: number) {
    if (!this.tmpCanvas) { this.tmpCanvas = document.createElement('canvas'); }
    if (!this.tmpCtx) { this.tmpCtx = this.tmpCanvas.getContext('2d', { willReadFrequently: true })!; }
    if (this.tmpCanvas.width !== w || this.tmpCanvas.height !== h) {
      this.tmpCanvas.width = w; this.tmpCanvas.height = h;
    }
    return { canvas: this.tmpCanvas, ctx: this.tmpCtx };
  }

  readGLPixels(glCanvas: HTMLCanvasElement): Uint8ClampedArray | null {
    try {
      const { ctx, canvas } = this.getCtx(glCanvas.width, glCanvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(glCanvas, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch { return null; }
  }

  scoreFrame(glCanvas: HTMLCanvasElement): StickerScore {
    const pixels = this.readGLPixels(glCanvas);
    if (!pixels) return { value: 0, saturation: 0, complexity: 0 };
    const w = glCanvas.width, h = glCanvas.height;
    const N = 20;
    let sumSat = 0, sumDiff = 0, count = 0;
    const prev = this.prevGLPixels;
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const px = Math.floor(gx * w / N);
        const py = Math.floor(gy * h / N);
        const i = (py * w + px) * 4;
        const r = pixels[i]/255, g = pixels[i+1]/255, b = pixels[i+2]/255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        sumSat += max > 0 ? (max - min) / max : 0;
        if (prev) {
          const dr = Math.abs(pixels[i] - prev[i]);
          const dg = Math.abs(pixels[i+1] - prev[i+1]);
          const db = Math.abs(pixels[i+2] - prev[i+2]);
          sumDiff += (dr + dg + db) / (3 * 255);
        }
        count++;
      }
    }
    this.prevGLPixels = pixels;
    const saturation = Math.min((sumSat / count) / 0.55, 1);
    const complexity = Math.min((sumDiff / count) * 6, 1);
    return { value: saturation * 0.5 + complexity * 0.5, saturation, complexity };
  }

  async refreshBestMask(source: SegSource): Promise<void> {
    if (this.busy || !segmentationEngine.isTapReady()) return;
    this.busy = true;
    try {
      const pts = segmentationEngine.analyzeSaliency(source, 3);
      const regions = await segmentationEngine.segmentMultiPoint(source, pts);
      if (regions.length) {
        this.bestMask = regions.reduce((best, r) => {
          const ca = r.data.reduce((s, v) => s + (v > 0.4 ? 1 : 0), 0);
          const cb = best.data.reduce((s, v) => s + (v > 0.4 ? 1 : 0), 0);
          return ca > cb ? r : best;
        });
      }
    } finally { this.busy = false; }
  }

  compositeFrame(
    glCanvas: HTMLCanvasElement,
    mask: Float32Array, maskW: number, maskH: number
  ): ImageData | null {
    const pixels = this.readGLPixels(glCanvas);
    if (!pixels) return null;
    const cw = glCanvas.width, ch = glCanvas.height;
    const out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const alpha = coverFitMaskAlpha(mask, maskW, maskH, x, y, cw, ch);
        if (alpha < 0.04) continue;
        const i = (y * cw + x) * 4;
        out[i]   = pixels[i];
        out[i+1] = pixels[i+1];
        out[i+2] = pixels[i+2];
        out[i+3] = Math.round(Math.min(alpha * 1.15, 1) * 255);
      }
    }
    return new ImageData(out, cw, ch);
  }

  cropToBounds(imageData: ImageData, pad = 6): ImageData | null {
    const { data, width, height } = imageData;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 6) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 <= x0 || y1 <= y0) return null;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const si = ((y0 + y) * width + (x0 + x)) * 4;
      const di = (y * nw + x) * 4;
      out[di] = data[si]; out[di+1] = data[si+1]; out[di+2] = data[si+2]; out[di+3] = data[si+3];
    }
    return new ImageData(out, nw, nh);
  }

  enhanceHDR(imageData: ImageData): ImageData {
    const { data, width, height } = imageData;
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i+3]; if (a === 0) { out[i+3] = 0; continue; }
      let r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;
      const lum = 0.2126*r + 0.7152*g + 0.0722*b;
      r = lum + (r - lum) * 1.3; g = lum + (g - lum) * 1.3; b = lum + (b - lum) * 1.3;
      const sc = (v: number) => v < 0.5 ? 2*v*v : 1 - 2*(1-v)*(1-v);
      r = sc(r); g = sc(g); b = sc(b);
      out[i]   = Math.round(Math.max(0, Math.min(255, r * 255)));
      out[i+1] = Math.round(Math.max(0, Math.min(255, g * 255)));
      out[i+2] = Math.round(Math.max(0, Math.min(255, b * 255)));
      out[i+3] = a;
    }
    return new ImageData(out, width, height);
  }

  async exportWebP(imageData: ImageData, scale = 2): Promise<Blob> {
    const { width, height } = imageData;
    const ow = width * scale, oh = height * scale;
    const src = document.createElement('canvas');
    src.width = width; src.height = height;
    src.getContext('2d')!.putImageData(imageData, 0, 0);
    const dst = document.createElement('canvas');
    dst.width = ow; dst.height = oh;
    const dctx = dst.getContext('2d')!;
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    dctx.filter = 'saturate(1.08) contrast(1.04)';
    dctx.drawImage(src, 0, 0, ow, oh);
    dctx.filter = 'none';
    return new Promise((res, rej) => dst.toBlob(b => (b ? res(b) : rej(new Error('toBlob returned null'))), 'image/webp', 0.94));
  }

  async exportAPNG(frames: ImageData[], fps = 28): Promise<Blob> {
    if (!frames.length) throw new Error('no frames');
    const { width, height } = frames[0];
    const bufs: ArrayBuffer[] = [];
    const dels: number[] = [];
    for (const f of frames) {
      let src = f;
      if (f.width !== width || f.height !== height) {
        const tmp = document.createElement('canvas');
        tmp.width = width; tmp.height = height;
        const tc = tmp.getContext('2d')!;
        const s2 = document.createElement('canvas');
        s2.width = f.width; s2.height = f.height;
        s2.getContext('2d')!.putImageData(f, 0, 0);
        tc.drawImage(s2, 0, 0, width, height);
        src = tc.getImageData(0, 0, width, height);
      }
      bufs.push(src.data.buffer.slice(0));
      dels.push(Math.round(1000 / fps));
    }
    const encoded = UPNG.encode(bufs, width, height, 0, dels);
    return new Blob([encoded], { type: 'image/apng' });
  }

  getBestMask() { return this.bestMask; }
  isBusy()     { return this.busy; }
}

export const stickerEngine = new StickerEngine();
