// Watches the live canvas for ~3 seconds and snapshots the single frame with
// the highest "visual interest" score (sharpness + colorfulness). Used for
// seamless / mirror exports where the visualizer is in constant motion.

export type BestFrameOptions = {
  durationMs?: number;   // total watch window (default 3000)
  intervalMs?: number;   // sampling cadence (default 100)
  sampleSize?: number;   // downscale for scoring (default 96)
  preferSeamless?: boolean;
  onProgress?: (p: number) => void;
};

export async function captureBestFrame(
  source: HTMLCanvasElement,
  opts: BestFrameOptions = {},
): Promise<HTMLCanvasElement> {
  const duration = opts.durationMs ?? 3000;
  const interval = opts.intervalMs ?? 100;
  const sampleSize = opts.sampleSize ?? 96;
  const preferSeamless = opts.preferSeamless ?? true;

  // Tiny canvas used only for scoring.
  const score = document.createElement("canvas");
  score.width = sampleSize;
  score.height = sampleSize;
  const sctx = score.getContext("2d", { willReadFrequently: true })!;

  // Full-resolution snapshot of the current best frame.
  const best = document.createElement("canvas");
  best.width = source.width;
  best.height = source.height;
  const bctx = best.getContext("2d")!;

  let bestScore = -Infinity;
  let bestTaken = false;
  const start = performance.now();

  return new Promise((resolve) => {
    const tick = () => {
      if (source.width === 0 || source.height === 0) {
        return scheduleNext();
      }
      // Score on a downscaled copy.
      sctx.drawImage(source, 0, 0, sampleSize, sampleSize);
      const data = sctx.getImageData(0, 0, sampleSize, sampleSize).data;
      const s = scoreFrame(data, sampleSize, preferSeamless);

      if (s > bestScore) {
        bestScore = s;
        // Snapshot full-res canvas as the new best.
        if (best.width !== source.width || best.height !== source.height) {
          best.width = source.width;
          best.height = source.height;
        }
        bctx.clearRect(0, 0, best.width, best.height);
        bctx.drawImage(source, 0, 0);
        bestTaken = true;
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      const elapsed = performance.now() - start;
      opts.onProgress?.(Math.min(1, elapsed / duration));
      if (elapsed >= duration) {
        if (!bestTaken) {
          // Fallback: just copy current frame.
          best.width = source.width;
          best.height = source.height;
          bctx.drawImage(source, 0, 0);
        }
        resolve(best);
      } else {
        window.setTimeout(tick, interval);
      }
    };

    tick();
  });
}

// Sharpness (luma laplacian variance) + colorfulness + seam continuity.
function scoreFrame(data: Uint8ClampedArray, n: number, preferSeamless: boolean): number {
  // Build luma map.
  const luma = new Float32Array(n * n);
  let rSum = 0, gSum = 0, bSum = 0;
  let rSq = 0, gSq = 0, bSq = 0;
  for (let i = 0, p = 0; p < n * n; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    luma[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    rSum += r; gSum += g; bSum += b;
    rSq += r * r; gSq += g * g; bSq += b * b;
  }
  const px = n * n;
  const varR = rSq / px - (rSum / px) ** 2;
  const varG = gSq / px - (gSum / px) ** 2;
  const varB = bSq / px - (bSum / px) ** 2;
  const colorfulness = Math.sqrt(Math.max(0, varR + varG + varB));

  // Laplacian variance for sharpness.
  let lSum = 0, lSq = 0, count = 0;
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      const i = y * n + x;
      const l =
        -luma[i - n] - luma[i - 1] + 4 * luma[i] - luma[i + 1] - luma[i + n];
      lSum += l;
      lSq += l * l;
      count++;
    }
  }
  const lapVar = lSq / count - (lSum / count) ** 2;

  // Penalize near-black or near-white frames (low mean luma variance).
  const meanLuma = lSum === 0 ? 128 : (rSum + gSum + bSum) / (3 * px);
  const exposure = 1 - Math.abs(meanLuma - 128) / 128; // 1 best, 0 worst

  const seam = preferSeamless ? seamContinuityScore(data, n) : 0;

  return lapVar * 1.0 + colorfulness * 0.4 + exposure * 50 + seam * 140;
}

function seamContinuityScore(data: Uint8ClampedArray, n: number): number {
  const band = Math.max(2, Math.floor(n * 0.035));
  let err = 0;
  let count = 0;

  const diff = (a: number, b: number) => {
    const dr = data[a] - data[b];
    const dg = data[a + 1] - data[b + 1];
    const db = data[a + 2] - data[b + 2];
    return (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / (3 * 255);
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < band; x++) {
      err += diff((y * n + x) * 4, (y * n + (n - band + x)) * 4);
      count++;
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < band; y++) {
      err += diff((y * n + x) * 4, ((n - band + y) * n + x) * 4);
      count++;
    }
  }

  return 1 - Math.min(1, err / Math.max(1, count));
}
