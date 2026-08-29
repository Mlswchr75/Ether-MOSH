import { exportCanvas } from "./export";
import { jpegBlobWithDpi } from "./jpegDpi";
import { blobWithDpi } from "./pngDpi";

export type PrintFormat = "png" | "jpg";

export type PrintReadyResult = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  dpi: number;
};

const safeName = (value: string) => value.toLowerCase()
  .replace(/\.[a-z0-9]+$/i, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 72) || "ether-mosh-artwork";

export function printReadyFilename(
  baseName: string,
  width: number,
  height: number,
  dpi: number,
  format: PrintFormat,
): string {
  return `${safeName(baseName)}_${width}x${height}_${dpi}dpi_print-ready.${format === "jpg" ? "jpg" : "png"}`;
}

/**
 * Compose the exact visible still, then resize it off the UI thread using the
 * same high-quality browser resampling that made Image Magic Pro effective.
 */
export async function exportPrintReady(
  canvas: HTMLCanvasElement,
  opts: { longEdge: 5000 | 8000; format?: PrintFormat; dpi?: number; baseName?: string; quality?: number },
): Promise<PrintReadyResult> {
  const dpi = opts.dpi ?? 300;
  const format = opts.format ?? "jpg";
  const sourceBlob = await exportCanvas(canvas, { format: "png", scale: 1, aspect: null });
  const bitmap = await createImageBitmap(sourceBlob);
  const scale = opts.longEdge / Math.max(1, bitmap.width, bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  let encoded: Blob;
  try {
    encoded = await runWorker(bitmap, width, height, format, opts.quality ?? 1);
  } catch {
    bitmap.close();
    encoded = await resizeFallback(sourceBlob, width, height, format, opts.quality ?? 1);
  }
  const blob = format === "png"
    ? await blobWithDpi(encoded, dpi)
    : await jpegBlobWithDpi(encoded, dpi);
  const baseName = opts.baseName ?? `ether-mosh-${Date.now().toString(36)}`;
  return { blob, filename: printReadyFilename(baseName, width, height, dpi, format), width, height, dpi };
}

function runWorker(
  bitmap: ImageBitmap,
  targetW: number,
  targetH: number,
  format: PrintFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./upscaler.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; blob?: Blob; error?: string }>) => {
      worker.terminate();
      event.data.ok && event.data.blob ? resolve(event.data.blob) : reject(new Error(event.data.error || "Upscale failed"));
    };
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ bitmap, targetW, targetH, format, quality }, [bitmap]);
  });
}

async function resizeFallback(
  sourceBlob: Blob,
  width: number,
  height: number,
  format: PrintFormat,
  quality: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Print export canvas unavailable");
  if (format === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => out.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Print export encoding failed")),
    format === "jpg" ? "image/jpeg" : "image/png",
    format === "jpg" ? quality : undefined,
  ));
}
