export type VectorSuitability = {
  score: number;
  recommendation: "vector" | "universal";
  metrics: {
    alphaOccupancy: number;
    edgeDensity: number;
    colorComplexity: number;
    contourComplexity: number;
  };
};

const VECTOR_THRESHOLD = 0.72;

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

function quantKey(r: number, g: number, b: number) {
  return `${r >> 5}:${g >> 5}:${b >> 5}`;
}

export function scoreVectorSuitability(imageData: ImageData): VectorSuitability {
  const { width, height, data } = imageData;
  if (!width || !height) return { score: 0, recommendation: "universal", metrics: { alphaOccupancy: 0, edgeDensity: 0, colorComplexity: 0, contourComplexity: 0 } };

  const step = Math.max(1, Math.ceil(Math.max(width, height) / 256));
  let opaque = 0;
  let samples = 0;
  let edgeCount = 0;
  let edgeChecks = 0;
  const colors = new Set<string>();
  let transitions = 0;
  let transitionChecks = 0;

  const alphaAt = (x: number, y: number) => data[(y * width + x) * 4 + 3] / 255;

  for (let y = 0; y < height; y += step) {
    let prevOn = false;
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const on = a > 0.08;
      samples++;
      if (on) {
        opaque++;
        colors.add(quantKey(data[i], data[i + 1], data[i + 2]));
      }
      if (x > 0) {
        transitionChecks++;
        if (on !== prevOn) transitions++;
      }
      prevOn = on;

      if (x + step < width) {
        edgeChecks++;
        const a2 = alphaAt(x + step, y) > 0.08;
        if (a2 !== on) edgeCount++;
      }
      if (y + step < height) {
        edgeChecks++;
        const a2 = alphaAt(x, y + step) > 0.08;
        if (a2 !== on) edgeCount++;
      }
    }
  }

  const alphaOccupancy = samples ? opaque / samples : 0;
  if (opaque === 0) return { score: 0, recommendation: "universal", metrics: { alphaOccupancy: 0, edgeDensity: 0, colorComplexity: 0, contourComplexity: 0 } };

  const edgeDensity = edgeChecks ? edgeCount / edgeChecks : 0;
  const contourComplexity = transitionChecks ? transitions / transitionChecks : 0;
  const colorComplexity = clamp01(colors.size / 48);

  const occupancyFit = 1 - Math.min(1, Math.abs(alphaOccupancy - 0.45) / 0.55);
  const edgeFit = 1 - clamp01(edgeDensity / 0.22);
  const contourFit = 1 - clamp01(contourComplexity / 0.18);
  const colorFit = 1 - colorComplexity;
  const score = clamp01(0.2 * occupancyFit + 0.3 * edgeFit + 0.25 * contourFit + 0.25 * colorFit);

  return {
    score,
    recommendation: score >= VECTOR_THRESHOLD ? "vector" : "universal",
    metrics: { alphaOccupancy, edgeDensity, colorComplexity, contourComplexity },
  };
}

export { VECTOR_THRESHOLD };
