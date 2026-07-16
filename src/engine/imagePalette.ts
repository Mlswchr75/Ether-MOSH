/**
 * Palette / biome extraction. Downsamples the loaded image, pulls the
 * dominant hues, and classifies the vibe into a "biome" that tints the UI
 * accent color. Pure Canvas2D — runs async, never blocks the render loop.
 */
export type BiomeId = "ember" | "neon" | "glacier" | "verdant" | "dusk" | "chrome";

export type PaletteProfile = {
  biome: BiomeId;
  /** dominant swatches, hex strings, most-common first */
  swatches: string[];
  /** average hue 0..360, saturation 0..1, lightness 0..1 */
  hue: number;
  saturation: number;
  lightness: number;
};

export const BIOME_LABELS: Record<BiomeId, string> = {
  ember: "EMBER — heat + rust",
  neon: "NEON — synthetic bloom",
  glacier: "GLACIER — cold static",
  verdant: "VERDANT — organic drift",
  dusk: "DUSK — violet haze",
  chrome: "CHROME — desaturated steel",
};

const BIOME_ACCENTS: Record<BiomeId, string> = {
  ember: "#ff5c33",
  neon: "#ff2ea6",
  glacier: "#4fd8ff",
  verdant: "#3dff9e",
  dusk: "#b06bff",
  chrome: "#c9ced6",
};

export function biomeAccentHex(profile: PaletteProfile): string {
  return BIOME_ACCENTS[profile.biome];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function classify(hue: number, sat: number, light: number): BiomeId {
  if (sat < 0.12) return "chrome";
  if (sat > 0.55 && light > 0.35 && (hue >= 280 || hue < 20)) return "neon";
  if (hue >= 20 && hue < 70) return "ember";
  if (hue >= 70 && hue < 170) return "verdant";
  if (hue >= 170 && hue < 250) return "glacier";
  return "dusk";
}

export async function extractPalette(image: HTMLImageElement): Promise<PaletteProfile> {
  const SIZE = 48;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(image, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  // 4-bit-per-channel histogram of sufficiently opaque pixels.
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  let hx = 0, hy = 0, satSum = 0, lightSum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++; bin.r += r; bin.g += g; bin.b += b;
    bins.set(key, bin);
    const [h, s, l] = rgbToHsl(r, g, b);
    // average hue on the circle, weighted by saturation so grays don't drag it
    hx += Math.cos((h * Math.PI) / 180) * s;
    hy += Math.sin((h * Math.PI) / 180) * s;
    satSum += s; lightSum += l; n++;
  }
  if (!n) throw new Error("empty image");

  const swatches = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(({ count, r, g, b }) => {
      const hex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
      return `#${hex(r)}${hex(g)}${hex(b)}`;
    });

  const hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
  const saturation = satSum / n;
  const lightness = lightSum / n;

  return { biome: classify(hue, saturation, lightness), swatches, hue, saturation, lightness };
}
