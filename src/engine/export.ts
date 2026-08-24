import { drawOverlayStageInto } from "./overlayCapture";

/** Export the current canvas as PNG/JPG/WEBP. Caller calls renderer.render() right before. */
export async function exportCanvas(
  canvas: HTMLCanvasElement,
  opts: { format: "png" | "jpg" | "webp"; scale?: number; quality?: number; aspect?: number | null; transparent?: boolean },
): Promise<Blob> {
  const scale = opts.scale ?? 1;
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const transparent = !!opts.transparent && opts.format === "png";

  // Build the exact visible performance frame first. OverlayStage entities are
  // DOM media layered above WebGL, so exporting the renderer canvas alone would
  // silently drop Lotties, swarms and AFTER/OWN-FX stickers.
  const composed = document.createElement("canvas");
  composed.width = w;
  composed.height = h;
  const composedCtx = composed.getContext("2d");
  if (!composedCtx) throw new Error("Export canvas unavailable");
  composedCtx.imageSmoothingEnabled = true;
  composedCtx.imageSmoothingQuality = "high";
  composedCtx.drawImage(canvas, 0, 0, w, h);
  drawOverlayStageInto(composedCtx, w, h);

  const out = document.createElement("canvas");
  if (opts.aspect != null) {
    const targetH = Math.round(Math.max(w / opts.aspect, h));
    const targetW = Math.round(targetH * opts.aspect);
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Export canvas unavailable");
    if (!transparent) {
      ctx.fillStyle = "#08080B";
      ctx.fillRect(0, 0, targetW, targetH);
    }
    const srcAspect = w / h;
    let dw = targetW, dh = targetW / srcAspect;
    if (dh > targetH) { dh = targetH; dw = targetH * srcAspect; }
    const dx = (targetW - dw) / 2, dy = (targetH - dh) / 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(composed, dx, dy, dw, dh);
  } else {
    out.width = w; out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("Export canvas unavailable");
    if (!transparent && opts.format !== "png") { ctx.fillStyle = "#08080B"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(composed, 0, 0, w, h);
  }

  const mime =
    opts.format === "jpg" ? "image/jpeg" :
    opts.format === "webp" ? "image/webp" : "image/png";

  return await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (b) => b ? resolve(b) : reject(new Error("toBlob failed")),
      mime,
      opts.format === "png" ? undefined : (opts.quality ?? 0.92),
    );
  });
}

/**
 * Save a PNG while the original tap/key event is still active.
 *
 * `canvas.toBlob()` is asynchronous. If a capture spends time scanning frames
 * first, many mobile browsers no longer consider its later anchor click a
 * user-initiated download and silently discard it. This deliberately uses the
 * synchronous data-URL path for the camera/screenshot trigger only, so the
 * device receives the save request inside the actual gesture.
 */
export function downloadCanvasPngNow(canvas: HTMLCanvasElement, filename: string, scale = 1): void {
  const targetScale = Math.max(0.1, Math.min(1, scale));
  const w = Math.max(1, Math.round(canvas.width * targetScale));
  const h = Math.max(1, Math.round(canvas.height * targetScale));
  const composed = document.createElement("canvas");
  composed.width = w;
  composed.height = h;
  const ctx = composed.getContext("2d");
  if (!ctx) throw new Error("Screenshot canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  drawOverlayStageInto(ctx, w, h);

  const a = document.createElement("a");
  a.href = composed.toDataURL("image/png");
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function remasterCanvas(canvas: HTMLCanvasElement, scale = 2): Promise<HTMLCanvasElement> {
  const maxLongEdge = 4096;
  const requestedScale = Math.max(1, Math.min(4, scale));
  const longEdge = Math.max(canvas.width, canvas.height);
  const targetScale = Math.min(requestedScale, maxLongEdge / Math.max(1, longEdge));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * targetScale));
  out.height = Math.max(1, Math.round(canvas.height * targetScale));
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);

  // Gentle clarity pass after upscale: boosts local contrast without changing the artwork.
  try {
    const image = ctx.getImageData(0, 0, out.width, out.height);
    const src = new Uint8ClampedArray(image.data);
    const d = image.data;
    const w = out.width;
    const h = out.height;
    const amount = 0.18;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const blur = (
            src[i + c - 4] + src[i + c + 4] + src[i + c - w * 4] + src[i + c + w * 4]
          ) * 0.25;
          d[i + c] = Math.max(0, Math.min(255, src[i + c] + (src[i + c] - blur) * amount));
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  } catch {
    // If readback is unavailable, keep the high-quality upscaled render.
  }

  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Keep the link in the document for the click itself. Some mobile browsers
  // ignore a detached link, which made otherwise-successful captures look as
  // though they had vanished.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 10_000);
}

export async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    const item = new (window as any).ClipboardItem({ [blob.type]: blob });
    await (navigator.clipboard as any).write([item]);
    return true;
  } catch {
    return false;
  }
}

export const ASPECT_PRESETS: { label: string; aspect: number | null }[] = [
  { label: "Original",     aspect: null },
  { label: "Square 1:1",   aspect: 1 },
  { label: "Story 9:16",   aspect: 9 / 16 },
  { label: "Reels 9:16",   aspect: 9 / 16 },
  { label: "Portrait 4:5", aspect: 4 / 5 },
  { label: "Landscape 16:9", aspect: 16 / 9 },
  { label: "Cinema 21:9",  aspect: 21 / 9 },
  { label: "Twitter 3:1",  aspect: 3 },
  { label: "Wallpaper",    aspect: 9 / 19.5 },
  { label: "4K UHD 16:9",  aspect: 16 / 9 },
];
