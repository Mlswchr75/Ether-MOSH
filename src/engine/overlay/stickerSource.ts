import type { MaskResult } from "@/engine/SegmentationEngine";
import { stickerEngine } from "@/engine/StickerEngine";
import type { SourceMode } from "@/store/types";
import type { OverlayAsset, OverlayEntity } from "./types";

export type StickerSource =
  | { kind: "overlay"; asset: OverlayAsset }
  | { kind: "render-subject"; canvas: HTMLCanvasElement; subjects: MaskResult[]; sourceMode: SourceMode }
  | { kind: "render"; canvas: HTMLCanvasElement; sourceMode: SourceMode }
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
  if (!forgeCanvas || forgeCanvas.width <= 0 || forgeCanvas.height <= 0) return null;
  if (isolatedSubjects.length > 0) return { kind: "render-subject", canvas: forgeCanvas, subjects: isolatedSubjects, sourceMode };
  return { kind: "render", canvas: forgeCanvas, sourceMode };
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
  if (source.kind !== "render") return source;
  try {
    const subjects = selectUsableStickerMasks(await isolate(boundedStickerCanvas(source.canvas)));
    return resolveStickerSource({
      selectedOverlay: null,
      sourceMode: source.sourceMode,
      forgeCanvas: source.canvas,
      isolatedSubjects: subjects,
    }) ?? source;
  } catch (error) {
    onFallback?.(error);
    return source;
  }
}

/** Reject near-empty, near-full-frame and duplicate masks, then keep the two
 * strongest distinct objects. This prevents three saliency taps on the same
 * background from producing a loose, almost-full-frame crop. */
export function selectUsableStickerMasks(subjects: MaskResult[]): MaskResult[] {
  const scored = subjects.flatMap(subject => {
    let active = 0, confidence = 0, minX = subject.width, minY = subject.height, maxX = -1, maxY = -1;
    for (let y = 0; y < subject.height; y++) for (let x = 0; x < subject.width; x++) {
      const value = subject.data[y * subject.width + x] ?? 0;
      if (value < 0.42) continue;
      active++; confidence += value;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const coverage = active / Math.max(1, subject.data.length);
    if (coverage < 0.008 || coverage > 0.82 || maxX < minX || maxY < minY) return [];
    const boundsArea = ((maxX-minX+1) * (maxY-minY+1)) / Math.max(1, subject.width * subject.height);
    const solidity = coverage / Math.max(coverage, boundsArea);
    return [{ subject, score: (confidence / active) * 0.55 + solidity * 0.25 + Math.min(coverage / 0.28, 1) * 0.2, box: [minX,minY,maxX,maxY] as const }];
  }).sort((a,b) => b.score-a.score);
  const kept: typeof scored = [];
  for (const candidate of scored) {
    const duplicate = kept.some(existing => {
      const a=candidate.box,b=existing.box;
      const intersection = Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])+1) * Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1])+1);
      const areaA=(a[2]-a[0]+1)*(a[3]-a[1]+1), areaB=(b[2]-b[0]+1)*(b[3]-b[1]+1);
      return intersection / Math.max(1, Math.min(areaA,areaB)) > 0.72;
    });
    if (!duplicate) kept.push(candidate);
    if (kept.length === 2) break;
  }
  return kept.map(item => item.subject);
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

function stickerExportScale(imageData: ImageData) {
  return Math.min(2, 1536 / Math.max(imageData.width, imageData.height));
}

function boundedStickerCanvas(source: HTMLCanvasElement) {
  const mobile = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  const maxDimension = mobile ? 768 : 1152;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(source.width * scale));
  canvas.height = Math.max(2, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function assetFromStickerSource(source: Exclude<StickerSource, null>): Promise<{ asset: OverlayAsset; blob?: Blob; revoke: () => void }> {
  if (source.kind === "overlay") return { asset: source.asset, revoke: () => undefined };

  const workingCanvas = boundedStickerCanvas(source.canvas);
  let blob: Blob;
  let width = workingCanvas.width;
  let height = workingCanvas.height;
  if (source.kind === "render-subject") {
    const mask = mergeSubjects(source.subjects);
    const composited = mask && stickerEngine.compositeFrame(workingCanvas, mask.data, mask.width, mask.height);
    const cropped = composited && stickerEngine.cropToBounds(composited);
    if (!cropped) {
      blob = await blobFromCanvas(workingCanvas);
    } else {
      const enhanced = stickerEngine.enhanceHDR(cropped);
      const scale = stickerExportScale(enhanced);
      blob = await stickerEngine.exportWebP(enhanced, scale);
      width = Math.max(1, Math.round(enhanced.width * scale));
      height = Math.max(1, Math.round(enhanced.height * scale));
    }
  } else {
    const salient = stickerEngine.cropSalientRegion(workingCanvas);
    if (salient) {
      const enhanced = stickerEngine.enhanceHDR(salient);
      const scale = stickerExportScale(enhanced);
      blob = await stickerEngine.exportWebP(enhanced, scale);
      width = Math.max(1, Math.round(enhanced.width * scale));
      height = Math.max(1, Math.round(enhanced.height * scale));
    } else blob = await blobFromCanvas(workingCanvas);
  }

  const url = URL.createObjectURL(blob);
  const id = crypto.randomUUID();
  return {
    blob,
    asset: {
      id: `forge-sticker-${id}`,
      name: source.kind === "render-subject" ? `${source.sourceMode} Subject` : `${source.sourceMode} Salient Crop`,
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
