// Captures ~N seconds of the live canvas, then encodes a seamlessly looping GIF.
// Strategy: sample frames at a fixed cadence into raw RGBA buffers, then search
// the tail of the capture for the frame most similar to frame 0 (pixel diff on
// a downscaled luma map). Trim the loop there so start == end and the GIF loops
// cleanly. Encoded with gifenc (pure JS, no worker required).

import { GIFEncoder, quantize, applyPalette } from "gifenc";

export type GifCaptureOptions = {
  durationMs?: number;      // total capture window (default 7000)
  fps?: number;             // sample rate (default 12)
  maxWidth?: number;        // output width cap (default 480)
  onProgress?: (phase: "capture" | "encode", p: number) => void;
};

export type GifCaptureResult = {
  blob: Blob;
  frameCount: number;
  fps: number;
  loopScore: number;        // 0..1, higher = tighter loop
};

export async function captureLoopingGif(
  source: HTMLCanvasElement,
  opts: GifCaptureOptions = {},
): Promise<GifCaptureResult> {
  const durationMs = opts.durationMs ?? 7000;
  const fps = opts.fps ?? 12;
  const maxWidth = opts.maxWidth ?? 480;
  const frameInterval = 1000 / fps;
  const targetFrames = Math.floor(durationMs / frameInterval);

  // Compute output dimensions (preserve aspect, cap width, ensure even).
  const scale = Math.min(1, maxWidth / source.width);
  const outW = Math.max(2, Math.floor(source.width * scale / 2) * 2);
  const outH = Math.max(2, Math.floor(source.height * scale / 2) * 2);

  const work = document.createElement("canvas");
  work.width = outW;
  work.height = outH;
  const wctx = work.getContext("2d", { willReadFrequently: true })!;

  // Tiny luma canvas for loop-point search.
  const LUMA_N = 32;
  const luma = document.createElement("canvas");
  luma.width = LUMA_N;
  luma.height = LUMA_N;
  const lctx = luma.getContext("2d", { willReadFrequently: true })!;

  const frames: Uint8ClampedArray[] = [];
  const lumaMaps: Float32Array[] = [];

  // ————— capture phase —————
  const start = performance.now();
  let nextAt = start;

  await new Promise<void>((resolve) => {
    const tick = () => {
      const now = performance.now();
      if (now >= nextAt && frames.length < targetFrames) {
        wctx.drawImage(source, 0, 0, outW, outH);
        frames.push(wctx.getImageData(0, 0, outW, outH).data);

        lctx.drawImage(source, 0, 0, LUMA_N, LUMA_N);
        const ld = lctx.getImageData(0, 0, LUMA_N, LUMA_N).data;
        const lm = new Float32Array(LUMA_N * LUMA_N);
        for (let i = 0, p = 0; p < LUMA_N * LUMA_N; i += 4, p++) {
          lm[p] = 0.299 * ld[i] + 0.587 * ld[i + 1] + 0.114 * ld[i + 2];
        }
        lumaMaps.push(lm);

        nextAt += frameInterval;
      }
      const elapsed = now - start;
      opts.onProgress?.("capture", Math.min(1, elapsed / durationMs));
      if (elapsed >= durationMs || frames.length >= targetFrames) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  // ————— find best loop point —————
  // Compare frames in the tail 40% against frame 0. Pick the one with smallest
  // per-pixel luma diff. Trim to [0, bestIdx] inclusive.
  let bestIdx = frames.length - 1;
  let bestDiff = Infinity;
  const first = lumaMaps[0];
  const tailStart = Math.max(1, Math.floor(frames.length * 0.6));
  for (let i = tailStart; i < frames.length; i++) {
    const m = lumaMaps[i];
    let d = 0;
    for (let k = 0; k < first.length; k++) {
      const v = m[k] - first[k];
      d += v * v;
    }
    if (d < bestDiff) { bestDiff = d; bestIdx = i; }
  }
  // Normalize: perfect match = 1, worst-case (mean-square 255^2) → 0.
  const mse = bestDiff / first.length;
  const loopScore = Math.max(0, Math.min(1, 1 - mse / (255 * 255 * 0.15)));

  const loopFrames = frames.slice(0, bestIdx + 1);

  // ————— encode phase —————
  const gif = GIFEncoder();
  const delayMs = Math.round(frameInterval);
  let lastPalette: number[][] | null = null;
  for (let i = 0; i < loopFrames.length; i++) {
    const data = loopFrames[i];
    // Re-quantize every few frames so slow color drift doesn't shred the palette.
    if (i === 0 || i % 4 === 0) {
      lastPalette = quantize(data, 256, { format: "rgb444" });
    }
    const indexed = applyPalette(data, lastPalette!, "rgb444");
    gif.writeFrame(indexed, outW, outH, {
      palette: lastPalette!,
      delay: delayMs,
      // GIF loops forever by default when writeFrame is called multiple times.
    });
    opts.onProgress?.("encode", (i + 1) / loopFrames.length);
    // Yield to the event loop so the UI can update.
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  const bytes = gif.bytes();
  // gifenc returns a Uint8Array over a resizable buffer; copy to a fresh
  // ArrayBuffer so Blob doesn't reject it in strict environments.
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "image/gif" });

  return { blob, frameCount: loopFrames.length, fps, loopScore };
}
