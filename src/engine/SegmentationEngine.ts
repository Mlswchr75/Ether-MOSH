import { FilesetResolver, ImageSegmenter, InteractiveSegmenter } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm";
const SELFIE_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const TOUCH_MODEL  = "https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite";

export type MaskResult     = { data: Float32Array; width: number; height: number };
export type SaliencyPoint  = { x: number; y: number; score: number };
export type SegmentableSource = HTMLVideoElement | HTMLCanvasElement;

class SegmentationEngine {
  private autoSeg: ImageSegmenter | null = null;
  private tapSeg: InteractiveSegmenter | null = null;
  private autoReady = false;
  private tapReady  = false;
  private _salCanvas?: HTMLCanvasElement;

  async loadAuto(): Promise<void> {
    if (this.autoReady) return;
    try {
      const v = await FilesetResolver.forVisionTasks(WASM);
      this.autoSeg = await ImageSegmenter.createFromOptions(v, {
        baseOptions: { modelAssetPath: SELFIE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.autoReady = true;
    } catch (e) { console.warn("[seg] auto load failed", e); }
  }

  async loadTap(): Promise<void> {
    if (this.tapReady) return;
    try {
      const v = await FilesetResolver.forVisionTasks(WASM);
      this.tapSeg = await InteractiveSegmenter.createFromOptions(v, {
        baseOptions: { modelAssetPath: TOUCH_MODEL, delegate: "GPU" },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.tapReady = true;
    } catch (e) { console.warn("[seg] tap load failed", e); }
  }

  segmentAuto(video: HTMLVideoElement, ts: number): MaskResult | null {
    if (!this.autoSeg || !this.autoReady) return null;
    try {
      const res = this.autoSeg.segmentForVideo(video, ts);
      const masks = res.confidenceMasks;
      if (!masks?.length) { res.close(); return null; }
      const m = masks[0];
      const data = m.getAsFloat32Array().slice();
      const w = m.width, h = m.height;
      res.close();
      return { data, width: w, height: h };
    } catch { return null; }
  }

  maskConfidence(mask: Float32Array): number {
    if (!mask.length) return 0;
    let s = 0;
    for (let i = 0; i < mask.length; i++) s += mask[i];
    return s / mask.length;
  }

  /** Analyze a rendered frame for visually interesting regions via color-variance + center-bias saliency. */
  analyzeSaliency(source: SegmentableSource, maxPoints = 3): SaliencyPoint[] {
    const S = 32;
    if (!this._salCanvas) {
      this._salCanvas = document.createElement('canvas');
      this._salCanvas.width = S;
      this._salCanvas.height = S;
    }
    const sc = this._salCanvas;
    const tc = sc.getContext('2d', { willReadFrequently: true });
    if (!tc) return [{ x: 0.5, y: 0.5, score: 1 }];
    tc.drawImage(source, 0, 0, S, S);
    const px = tc.getImageData(0, 0, S, S).data;

    const cells = 8, cs = S / cells;
    const scores: SaliencyPoint[] = [];

    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        let sr = 0, sg = 0, sb = 0, sr2 = 0, sg2 = 0, sb2 = 0, n = 0;
        for (let y = Math.floor(cy * cs); y < Math.floor((cy + 1) * cs); y++) {
          for (let x = Math.floor(cx * cs); x < Math.floor((cx + 1) * cs); x++) {
            const i = (y * S + x) * 4;
            const r = px[i], g = px[i + 1], b = px[i + 2];
            sr += r; sg += g; sb += b;
            sr2 += r * r; sg2 += g * g; sb2 += b * b;
            n++;
          }
        }
        if (!n) continue;
        const variance = ((sr2 - sr * sr / n) + (sg2 - sg * sg / n) + (sb2 - sb * sb / n)) / (n * 3);
        const dx = (cx + 0.5) / cells - 0.5;
        const dy = (cy + 0.5) / cells - 0.5;
        const centerBias = Math.exp(-(dx * dx + dy * dy) / 0.2);
        scores.push({ x: (cx + 0.5) / cells, y: (cy + 0.5) / cells, score: variance * centerBias });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const kept: SaliencyPoint[] = [];
    for (const pt of scores) {
      if (kept.length >= maxPoints) break;
      if (!kept.some(k => Math.hypot(k.x - pt.x, k.y - pt.y) < 0.22)) kept.push(pt);
    }
    return kept.length ? kept : [{ x: 0.5, y: 0.5, score: 1 }];
  }

  async segmentMultiPoint(src: SegmentableSource, points: SaliencyPoint[]): Promise<MaskResult[]> {
    if (!this.tapSeg || !this.tapReady) return [];
    const out: MaskResult[] = [];
    for (const pt of points) {
      const r = await this.segmentFromPoint(src, pt.x, pt.y);
      if (r) out.push(r);
    }
    return out;
  }

  async segmentFromPoint(
    src: SegmentableSource,
    normX: number,
    normY: number,
  ): Promise<MaskResult | null> {
    if (!this.tapSeg || !this.tapReady) return null;
    return new Promise<MaskResult | null>((resolve) => {
      try {
        this.tapSeg!.segment(
          src,
          { keypoint: { x: normX, y: normY } },
          (res) => {
            const masks = res.confidenceMasks;
            if (!masks?.length) { res.close(); resolve(null); return; }
            const m = masks[0];
            const data = m.getAsFloat32Array().slice();
            resolve({ data, width: m.width, height: m.height });
            res.close();
          }
        );
      } catch { resolve(null); }
    });
  }

  isAutoReady() { return this.autoReady; }
  isTapReady()  { return this.tapReady; }
}

export const segmentationEngine = new SegmentationEngine();
