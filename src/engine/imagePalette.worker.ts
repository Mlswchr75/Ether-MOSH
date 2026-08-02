import type { PaletteProfile, BiomeId } from "./imagePalette";
import { BIOME_PROFILES } from "./imagePalette";

// ─── RGB ↔ LAB conversion ───────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToXyz(r: number, g: number, b: number): [number, number, number] {
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  return [x, y, z];
}

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const [x, y, z] = linearToXyz(rl, gl, bl);
  const fx = f(x / 0.95047);
  const fy = f(y / 1.00000);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labDist(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dL = a[0] - b[0], dA = a[1] - b[1], dB = a[2] - b[2];
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

// ─── K-means in LAB space ───────────────────────────────────────────────────

type LabColor = [number, number, number];

function kMeans(
  samples: LabColor[],
  k: number,
  iters = 12,
): LabColor[] {
  if (samples.length === 0) return Array(k).fill([50, 0, 0]);
  const centers: LabColor[] = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i++) centers.push([...samples[(i * step) % samples.length]]);

  for (let iter = 0; iter < iters; iter++) {
    const sums: [number, number, number][] = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (const s of samples) {
      let best = 0, bestDist = Infinity;
      for (let ci = 0; ci < k; ci++) {
        const d = labDist(s, centers[ci]);
        if (d < bestDist) { bestDist = d; best = ci; }
      }
      sums[best][0] += s[0]; sums[best][1] += s[1]; sums[best][2] += s[2];
      counts[best]++;
    }
    for (let ci = 0; ci < k; ci++) {
      if (counts[ci] > 0) {
        centers[ci] = [sums[ci][0] / counts[ci], sums[ci][1] / counts[ci], sums[ci][2] / counts[ci]];
      }
    }
  }
  return centers;
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const finv = (t: number) => t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
  let r = finv(fx) * 0.95047 * 3.2404542 - finv(fy) * 1.00000 * 1.5371385 - finv(fz) * 1.08883 * 0.4985314;
  let g = -finv(fx) * 0.95047 * 0.9692660 + finv(fy) * 1.00000 * 1.8760108 + finv(fz) * 1.08883 * 0.0415560;
  let bv = finv(fx) * 0.95047 * 0.0556434 - finv(fy) * 1.00000 * 0.2040259 + finv(fz) * 1.08883 * 1.0572252;
  const srgb = (c: number) => Math.round(Math.min(255, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)) * 255);
  return [srgb(r), srgb(g), srgb(bv)];
}

function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(c => c.toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rv = r / 255, gv = g / 255, bv = b / 255;
  const max = Math.max(rv, gv, bv), min = Math.min(rv, gv, bv);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rv) h = ((gv - bv) / d + (gv < bv ? 6 : 0)) / 6;
  else if (max === gv) h = ((bv - rv) / d + 2) / 6;
  else h = ((rv - gv) / d + 4) / 6;
  return [h, s, l];
}

// ─── Perceptual metrics ─────────────────────────────────────────────────────

function computeMetrics(pixels: Uint8ClampedArray, w: number, h: number) {
  const n = w * h;
  let warmthSum = 0, satSum = 0, briSum = 0, hues: number[] = [];
  const briValues: number[] = [];

  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    const [hue, sat, lig] = rgbToHsl(r, g, b);
    satSum += sat;
    briSum += lig;
    briValues.push(lig);
    if (sat > 0.1) hues.push(hue);
    const warm = hue < 0.083 || hue > 0.917 || (hue > 0.028 && hue < 0.167) ? 1 : 0;
    warmthSum += warm;
  }

  const warmth = warmthSum / n;
  const saturation = satSum / n;
  const brightness = briSum / n;

  const briMean = brightness;
  const contrast = Math.sqrt(briValues.reduce((s, v) => s + (v - briMean) ** 2, 0) / n);

  // Edge density via simple Sobel approximation
  let edgeSum = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gray = (px: number, py: number) => {
        const idx = (py * w + px) * 4;
        return (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3 / 255;
      };
      const gx = -gray(x-1,y-1) - 2*gray(x-1,y) - gray(x-1,y+1) + gray(x+1,y-1) + 2*gray(x+1,y) + gray(x+1,y+1);
      const gy = -gray(x-1,y-1) - 2*gray(x,y-1) - gray(x+1,y-1) + gray(x-1,y+1) + 2*gray(x,y+1) + gray(x+1,y+1);
      edgeSum += Math.sqrt(gx*gx + gy*gy);
    }
  }
  const density = Math.min(1, edgeSum / ((w - 2) * (h - 2) * 1.5));

  // Hue spread — circular variance
  let sc = 0, ss = 0;
  for (const h of hues) { sc += Math.cos(h * 2 * Math.PI); ss += Math.sin(h * 2 * Math.PI); }
  const R = hues.length > 0 ? Math.sqrt((sc/hues.length)**2 + (ss/hues.length)**2) : 0;
  const hueSpread = 1 - R;

  return { warmth, saturation, brightness, contrast, density, hueSpread };
}

// ─── Biome classification ───────────────────────────────────────────────────

function classifyBiome(metrics: ReturnType<typeof computeMetrics>): { biome: BiomeId; confidence: number } {
  const keys: (keyof typeof BIOME_PROFILES[BiomeId])[] = ["warmth","saturation","brightness","contrast","density","hueSpread"];
  let bestBiome: BiomeId = "cyber-fm";
  let bestScore = Infinity;

  for (const [id, profile] of Object.entries(BIOME_PROFILES) as [BiomeId, typeof BIOME_PROFILES[BiomeId]][]) {
    let dist = 0;
    for (const k of keys) {
      dist += (metrics[k as keyof typeof metrics] as number - profile[k]) ** 2;
    }
    if (dist < bestScore) { bestScore = dist; bestBiome = id; }
  }
  const confidence = Math.max(0, 1 - bestScore / keys.length);
  return { biome: bestBiome, confidence };
}

// ─── Main export ────────────────────────────────────────────────────────────

export function computeProfile(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PaletteProfile {
  const n = width * height;
  const stride = Math.max(1, Math.floor(n / 256));
  const samples: LabColor[] = [];
  for (let i = 0; i < n; i += stride) {
    samples.push(rgbToLab(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]));
  }

  const centers = kMeans(samples, 5);
  const dominantColors = centers.map(([L, a, b]) => labToRgb(L, a, b)) as Array<[number, number, number]>;
  const hexes = dominantColors.map(([r, g, b]) => toHex(r, g, b));

  const metrics = computeMetrics(pixels, width, height);
  const { biome, confidence } = classifyBiome(metrics);

  return {
    dominantColors,
    hexes,
    ...metrics,
    biome,
    biomeConfidence: confidence,
  };
}

// ─── Worker message loop ────────────────────────────────────────────────────

self.addEventListener("message", (e: MessageEvent) => {
  const { id, pixels, width, height } = e.data as {
    id: number;
    pixels: ArrayBuffer;
    width: number;
    height: number;
  };
  const profile = computeProfile(new Uint8ClampedArray(pixels), width, height);
  (self as unknown as Worker).postMessage({ id, profile });
});
