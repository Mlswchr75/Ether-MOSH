import type { MaskResult } from "@/engine/SegmentationEngine";
import { stickerEngine } from "@/engine/StickerEngine";
import type { SourceMode } from "@/store/types";
import type { OverlayAsset, OverlayEntity } from "./types";

export type StickerSource =
  | { kind: "overlay"; asset: OverlayAsset }
  | { kind: "forge-subject"; canvas: HTMLCanvasElement; subjects: MaskResult[] }
  | { kind: "forge-render"; canvas: HTMLCanvasElement }
  | null;

type StickerSourceInput = {
  selectedOverlay: OverlayEntity | null;
  sourceMode: SourceMode;
  forgeCanvas: HTMLCanvasElement | null;
  isolatedSubjects?: MaskResult[];
};

/** Resolve once at the action boundary so button eligibility and saving use
 * the exact same priority order. Subject arrays deliberately stay intact: a
 * future subject picker can pass one or several selections without changing
 * the Vault or overlay asset pipeline. */
export function resolveStickerSource({
  selectedOverlay,
  sourceMode,
  forgeCanvas,
  isolatedSubjects = [],
}: StickerSourceInput): StickerSource {
  if (selectedOverlay) return { kind: "overlay", asset: selectedOverlay.asset };
  if (sourceMode !== "forge" || !forgeCanvas || forgeCanvas.width <= 0 || forgeCanvas.height <= 0) return null;
  if (isolatedSubjects.length > 0) return { kind: "forge-subject", canvas: forgeCanvas, subjects: isolatedSubjects };
  return { kind: "forge-render", canvas: forgeCanvas };
}

/** Subject isolation improves a Forge capture, but must never be a hard
 * dependency for saving it. Mobile browsers can reject or run out of memory
 * while loading the segmentation model; in that case the complete rendered
 * composition remains a valid sticker source. */
export async function withOptionalForgeIsolation(
  source: Exclude<StickerSource, null>,
  isolate: (canvas: HTMLCanvasElement) => Promise<MaskResult[]>,
  onFallback?: (error: unknown) => void,
): Promise<Exclude<StickerSource, null>> {
  if (source.kind !== "forge-render") return source;
  try {
    const subjects = await isolate(source.canvas);
    return resolveStickerSource({
      selectedOverlay: null,
      sourceMode: "forge",
      forgeCanvas: source.canvas,
      isolatedSubjects: subjects,
    }) ?? source;
  } catch (error) {
    onFallback?.(error);
    return source;
  }
}

function mergeSubjects(subjects: MaskResult[]): MaskResult | null {
  const first = subjects[0];
  if (!first) return null;
  const compatible = subjects.filter(subject => subject.width === first.width && subject.height === first.height);
  const data = new Float32Array(first.data.length);
  for (const subject of compatible) {
    for (let index = 0; index < data.length; index++) data[index] = Math.max(data[index], subject.data[index] ?? 0);
  }
  return { data, width: first.width, height: first.height };
}

async function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const copy = document.createElement("canvas");
  const maxDimension = 1536;
  const scale = Math.min(1, maxDimension / Math.max(canvas.width, canvas.height));
  copy.width = Math.max(1, Math.round(canvas.width * scale));
  copy.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the Forge render.");
  ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
  const encode = (type: string, quality?: number) => new Promise<Blob | null>(resolve => copy.toBlob(resolve, type, quality));
  const webp = await encode("image/webp", 0.9);
  if (webp) return webp;
  const png = await encode("image/png");
  if (png) return png;
  throw new Error("This browser could not encode the Forge render.");
}

export async function assetFromStickerSource(source: Exclude<StickerSource, null>): Promise<{ asset: OverlayAsset; blob?: Blob; revoke: () => void }> {
  if (source.kind === "overlay") return { asset: source.asset, revoke: () => undefined };

  let blob: Blob;
  let width = Math.min(source.canvas.width, Math.round(source.canvas.width * Math.min(1, 1536 / Math.max(source.canvas.width, source.canvas.height))));
  let height = Math.min(source.canvas.height, Math.round(source.canvas.height * Math.min(1, 1536 / Math.max(source.canvas.width, source.canvas.height))));
  if (source.kind === "forge-subject") {
    const mask = mergeSubjects(source.subjects);
    const composited = mask && stickerEngine.compositeFrame(source.canvas, mask.data, mask.width, mask.height);
    const cropped = composited && stickerEngine.cropToBounds(composited);
    if (!cropped) {
      blob = await blobFromCanvas(source.canvas);
    } else {
      const enhanced = stickerEngine.enhanceHDR(cropped);
      blob = await stickerEngine.exportWebP(enhanced, 2);
      width = enhanced.width * 2;
      height = enhanced.height * 2;
    }
  } else {
    blob = await blobFromCanvas(source.canvas);
  }

  const url = URL.createObjectURL(blob);
  const id = crypto.randomUUID();
  return {
    blob,
    asset: {
      id: `forge-sticker-${id}`,
      name: source.kind === "forge-subject" ? "Forge Subject" : "Forge Composition",
      kind: "raster",
      url,
      mimeType: blob.type || "image/webp",
      width,
      height,
      animated: false,
      createdAt: Date.now(),
      objectUrl: true,
    },
    revoke: () => URL.revokeObjectURL(url),
  };
}
