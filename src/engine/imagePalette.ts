/**
 * Image palette extraction — Part 1 of v0.2.
 *
 * Public API: `extractPalette(image)` → returns a `PaletteProfile` describing
 * the dominant colors and a "biome" character mapping derived from the image.
 *
 * Heavy lifting (k-means in LAB + edge density) runs in a Web Worker so the
 * UI never stalls. If workers/OffscreenCanvas aren't available we fall back
 * to a synchronous main-thread path with the same algorithm.
 */

export type BiomeId =
  | "analog-warmth"
  | "cyber-fm"
  | "acid-reactor"
  | "dreamwave"
  | "modular-chaos"
  | "industrial-pressure"
  | "celestial-ambient"
  | "arcade-memory";

export type PaletteProfile = {
  dominantColors: Array<[number, number, number]>;
  hexes: string[];
  warmth: number;
  saturation: number;
  brightness: number;
  contrast: number;
  density: number;
  hueSpread: number;
  biome: BiomeId;
  biomeConfidence: number;
};

export const BIOME_LABELS: Record<BiomeId, string> = {
  "analog-warmth":       "ANALOG WARMTH",
  "cyber-fm":            "CYBER FM",
  "acid-reactor":        "ACID REACTOR",
  "dreamwave":           "DREAMWAVE",
  "modular-chaos":       "MODULAR CHAOS",
  "industrial-pressure": "INDUSTRIAL PRESSURE",
  "celestial-ambient":   "CELESTIAL AMBIENT",
  "arcade-memory":       "ARCADE MEMORY",
};

export const BIOME_PROFILES: Record<BiomeId, {
  warmth: number; saturation: number; brightness: number;
  contrast: number; density: number; hueSpread: number;
}> = {
  "analog-warmth":       { warmth: 0.85, saturation: 0.45, brightness: 0.55, contrast: 0.35, density: 0.30, hueSpread: 0.20 },
  "cyber-fm":            { warmth: 0.20, saturation: 0.65, brightness: 0.50, contrast: 0.65, density: 0.55, hueSpread: 0.45 },
  "acid-reactor":        { warmth: 0.55, saturation: 0.95, brightness: 0.60, contrast: 0.75, density: 0.80, hueSpread: 0.75 },
  "dreamwave":           { warmth: 0.65, saturation: 0.55, brightness: 0.45, contrast: 0.30, density: 0.25, hueSpread: 0.50 },
  "modular-chaos":       { warmth: 0.50, saturation: 0.80, brightness: 0.55, contrast: 0.85, density: 0.90, hueSpread: 0.95 },
  "industrial-pressure": { warmth: 0.40, saturation: 0.30, brightness: 0.25, contrast: 0.70, density: 0.55, hueSpread: 0.20 },
  "celestial-ambient":   { warmth: 0.45, saturation: 0.20, brightness: 0.75, contrast: 0.20, density: 0.15, hueSpread: 0.35 },
  "arcade-memory":       { warmth: 0.55, saturation: 0.85, brightness: 0.60, contrast: 0.80, density: 0.60, hueSpread: 0.80 },
};

/** Picks the dominant biome color most useful as a UI accent. */
export function biomeAccentHex(profile: PaletteProfile): string {
  return profile.hexes[0] ?? "#FF1F8F";
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, (p: PaletteProfile) => void>();

function getWorker(): Worker | null {
  if (workerInstance) return workerInstance;
  if (typeof Worker === "undefined") return null;
  try {
    workerInstance = new Worker(
      new URL("./imagePalette.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerInstance.addEventListener("message", (e: MessageEvent) => {
      const { id, profile } = e.data as { id: number; profile: PaletteProfile };
      const cb = pending.get(id);
      if (cb) { pending.delete(id); cb(profile); }
    });
    workerInstance.addEventListener("error", () => {
      // Worker dead. Resolve every in-flight request with the fallback
      // profile — without this, any extractPalette() call already awaiting
      // this worker would hang forever, since nothing else ever settles
      // its promise.
      for (const cb of pending.values()) cb(fallbackProfile());
      pending.clear();
      workerInstance?.terminate();
      workerInstance = null;
    });
    return workerInstance;
  } catch {
    return null;
  }
}

const WORK_SIZE = 64;

async function bitmapFromSource(image: HTMLImageElement | HTMLCanvasElement): Promise<ImageData | null> {
  // We always normalize to a 64×64 RGBA buffer on the main thread, then ship
  // the buffer to the worker. This sidesteps cross-origin / OffscreenCanvas
  // quirks where the worker can't read pixels back from an ImageBitmap.
  try {
    const c = document.createElement("canvas");
    c.width = WORK_SIZE; c.height = WORK_SIZE;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, WORK_SIZE, WORK_SIZE);
    return ctx.getImageData(0, 0, WORK_SIZE, WORK_SIZE);
  } catch {
    return null;
  }
}

export async function extractPalette(
  image: HTMLImageElement | HTMLCanvasElement,
): Promise<PaletteProfile> {
  const data = await bitmapFromSource(image);
  if (!data) {
    return fallbackProfile();
  }
  const w = getWorker();
  if (w) {
    return new Promise((resolve) => {
      const id = nextRequestId++;
      pending.set(id, resolve);
      // Transfer the underlying buffer to avoid a copy.
      w.postMessage(
        { id, width: data.width, height: data.height, pixels: data.data.buffer },
        [data.data.buffer],
      );
    });
  }
  // Fallback: run synchronously in this thread (still fast at 64×64).
  const { computeProfile } = await import("./imagePalette.worker");
  return computeProfile(new Uint8ClampedArray(data.data), data.width, data.height);
}

function fallbackProfile(): PaletteProfile {
  return {
    dominantColors: [[255, 31, 143], [60, 60, 80], [200, 200, 220], [120, 80, 160], [40, 30, 50]],
    hexes: ["#FF1F8F", "#3C3C50", "#C8C8DC", "#7850A0", "#281E32"],
    warmth: 0.5, saturation: 0.6, brightness: 0.5, contrast: 0.5, density: 0.5, hueSpread: 0.5,
    biome: "cyber-fm", biomeConfidence: 0.5,
  };
}
