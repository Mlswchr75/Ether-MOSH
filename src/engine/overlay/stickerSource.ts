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
  copy.width = canvas.width;
  copy.height = canvas.height;
  const ctx = copy.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the Forge render.");
  ctx.drawImage(canvas, 0, 0);
  return new Promise((resolve, reject) => copy.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Could not encode the Forge render.")),
    "image/webp",
    0.94,
  ));
}

export async function assetFromStickerSource(source: Exclude<StickerSource, null>): Promise<{ asset: OverlayAsset; revoke: () => void }> {
  if (source.kind === "overlay") return { asset: source.asset, revoke: () => undefined };

  let blob: Blob;
  let width = source.canvas.width;
  let height = source.canvas.height;
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
