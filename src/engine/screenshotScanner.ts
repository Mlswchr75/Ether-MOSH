/**
 * Analyzes canvas frames to find the crispest, most visually appealing frame
 * for screenshot capture. Scores based on edge density (sharpness) and
 * luminance variance (visual interest).
 */

interface FrameScore {
  timestamp: number;
  sharpness: number;
  interest: number;
  overall: number;
}

/**
 * Quick edge detection via Sobel-like approximation on a downsampled copy.
 * We don't need perfection, just relative scores between frames.
 */
function computeSharpness(canvas: HTMLCanvasElement): number {
  const w = Math.min(canvas.width, 256);
  const h = Math.min(canvas.height, 256);

  // Draw to temp canvas for analysis
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // Greyscale luminance
  const grey = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i += 4) {
    grey[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // Estimate edge strength via local variance
  let edgeSum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const center = grey[idx];
      const sobelX =
        grey[(y - 1) * w + (x - 1)] - grey[(y - 1) * w + (x + 1)] +
        2 * grey[y * w + (x - 1)] - 2 * grey[y * w + (x + 1)] +
        grey[(y + 1) * w + (x - 1)] - grey[(y + 1) * w + (x + 1)];
      const sobelY =
        grey[(y - 1) * w + (x - 1)] - grey[(y + 1) * w + (x - 1)] +
        2 * grey[(y - 1) * w + x] - 2 * grey[(y + 1) * w + x] +
        grey[(y - 1) * w + (x + 1)] - grey[(y + 1) * w + (x + 1)];
      edgeSum += Math.hypot(sobelX, sobelY);
      count++;
    }
  }

  return count > 0 ? edgeSum / count : 0;
}

/**
 * Measure visual interest via luminance variance.
 * Flat frames score low; complex, high-contrast frames score high.
 */
function computeInterest(canvas: HTMLCanvasElement): number {
  const w = Math.min(canvas.width, 256);
  const h = Math.min(canvas.height, 256);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0;

  ctx.drawImage(canvas, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // Greyscale
  const grey = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i += 4) {
    grey[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // Variance = measure of diversity in brightness
  let sum = 0;
  for (let i = 0; i < grey.length; i++) sum += grey[i];
  const mean = sum / grey.length;
  let variance = 0;
  for (let i = 0; i < grey.length; i++) {
    const delta = grey[i] - mean;
    variance += delta * delta;
  }
  variance /= grey.length;

  return Math.sqrt(variance); // Standard deviation as interest score
}

export type ScreenshotScanResult = {
  bestCanvas: HTMLCanvasElement;
  score: FrameScore;
};

/**
 * Scan the canvas for the next N milliseconds and return the frame with
 * the highest combined sharpness + interest score.
 *
 * Lightweight analysis: ~256x256 downsampled edge detection + variance.
 */
export async function scanForBestFrame(
  sourceCanvas: HTMLCanvasElement,
  durationMs: number = 750,
  onProgress?: (progress: number) => void,
): Promise<ScreenshotScanResult> {
  const frames: FrameScore[] = [];
  let bestScore: FrameScore | null = null;
  let bestCanvas: HTMLCanvasElement | null = null;

  const startTime = performance.now();
  const frameInterval = 1000 / 24; // ~24 FPS analysis

  return new Promise((resolve) => {
    let lastFrameTime = startTime;

    const analyzeFrame = () => {
      const now = performance.now();
      const elapsed = now - startTime;

      // Throttle analysis to ~24 FPS
      if (now - lastFrameTime < frameInterval) {
        if (elapsed < durationMs) {
          requestAnimationFrame(analyzeFrame);
        }
        return;
      }

      const sharpness = computeSharpness(sourceCanvas);
      const interest = computeInterest(sourceCanvas);
      const overall = sharpness * 0.6 + interest * 0.4; // Weight sharpness slightly higher

      const score: FrameScore = { timestamp: elapsed, sharpness, interest, overall };
      frames.push(score);

      // Copy canvas if this is the best so far
      if (!bestScore || score.overall > bestScore.overall) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = sourceCanvas.width;
        tempCanvas.height = sourceCanvas.height;
        const ctx = tempCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(sourceCanvas, 0, 0);
          bestCanvas = tempCanvas;
          bestScore = score;
        }
      }

      onProgress?.(elapsed / durationMs);
      lastFrameTime = now;

      if (elapsed < durationMs) {
        requestAnimationFrame(analyzeFrame);
      } else {
        // Done
        resolve({
          bestCanvas: bestCanvas || sourceCanvas,
          score: bestScore || frames[frames.length - 1] || { timestamp: 0, sharpness: 0, interest: 0, overall: 0 },
        });
      }
    };

    requestAnimationFrame(analyzeFrame);
  });
}
