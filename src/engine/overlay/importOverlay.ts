import type { OverlayAsset, OverlayAssetKind } from "./types";

const ACCEPTED_EXTENSIONS = new Set(["png", "webp", "gif", "svg", "json", "lottie"]);

export class OverlayImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverlayImportError";
  }
}

export function classifyOverlayFile(file: Pick<File, "name" | "type">): OverlayAssetKind {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type.toLowerCase();

  if (!ACCEPTED_EXTENSIONS.has(ext) && !isAcceptedMime(mime)) {
    throw new OverlayImportError("Unsupported sticker file. Use PNG, WebP, GIF, SVG, Lottie JSON, or .lottie.");
  }

  if (ext === "json" || mime === "application/json") return "lottie-json";
  if (ext === "lottie" || mime === "application/zip" || mime === "application/x-lottie") return "dotlottie";
  if (ext === "svg" || mime === "image/svg+xml") return "svg";
  if (ext === "gif" || mime === "image/gif") return "gif";
  if (ext === "png" || ext === "webp" || mime === "image/png" || mime === "image/webp") return "raster";

  throw new OverlayImportError("Unsupported sticker file. Use PNG, WebP, GIF, SVG, Lottie JSON, or .lottie.");
}

export async function importOverlayFile(file: File): Promise<OverlayAsset> {
  const kind = classifyOverlayFile(file);

  if (kind === "lottie-json") await validateLottieJson(file);

  const url = URL.createObjectURL(file);
  try {
    const size = isImageKind(kind) ? await readImageSize(url) : undefined;
    const rasterAnimated = kind === "raster" ? await detectRasterAnimation(file) : false;
    return {
      id: crypto.randomUUID(),
      name: file.name,
      kind,
      url,
      mimeType: file.type || fallbackMime(kind),
      width: size?.width,
      height: size?.height,
      animated: rasterAnimated || kind === "gif" || kind === "lottie-json" || kind === "dotlottie",
      createdAt: Date.now(),
      objectUrl: true,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function disposeOverlayAsset(asset: OverlayAsset): void {
  if (asset.objectUrl && asset.url.startsWith("blob:")) URL.revokeObjectURL(asset.url);
}

async function validateLottieJson(file: File): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new OverlayImportError("That JSON file is not valid Lottie animation data.");
  }

  if (!value || typeof value !== "object") throw new OverlayImportError("That JSON file is not valid Lottie animation data.");

  const obj = value as Record<string, unknown>;
  const hasVersion = typeof obj.v === "string";
  const hasFrameRange = typeof obj.ip === "number" && typeof obj.op === "number";
  const hasLayers = Array.isArray(obj.layers);
  if (!hasVersion || !hasFrameRange || !hasLayers) {
    throw new OverlayImportError("That JSON file doesn't look like a Lottie animation.");
  }
}

/**
 * Detect animation without decoding every frame. WebP stores an `ANIM` chunk;
 * APNG stores an `acTL` chunk. Native <img> then handles playback efficiently.
 */
export async function detectRasterAnimation(file: Pick<File, "type" | "arrayBuffer">): Promise<boolean> {
  const mime = file.type.toLowerCase();
  if (mime !== "image/webp" && mime !== "image/png") return false;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const needle = mime === "image/webp" ? [65, 78, 73, 77] : [97, 99, 84, 76]; // ANIM / acTL
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) { match = false; break; }
    }
    if (match) return true;
  }
  return false;
}

function isAcceptedMime(mime: string): boolean {
  return ["image/png", "image/webp", "image/gif", "image/svg+xml", "application/json", "application/zip", "application/x-lottie"].includes(mime);
}

function isImageKind(kind: OverlayAssetKind): boolean {
  return kind === "raster" || kind === "gif" || kind === "svg";
}

function fallbackMime(kind: OverlayAssetKind): string {
  switch (kind) {
    case "svg": return "image/svg+xml";
    case "gif": return "image/gif";
    case "lottie-json": return "application/json";
    case "dotlottie": return "application/zip";
    default: return "application/octet-stream";
  }
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new OverlayImportError("That sticker image couldn't be decoded."));
    image.src = url;
  });
}
