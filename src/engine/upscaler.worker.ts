/// <reference lib="webworker" />
/**
 * Image upscaler worker — multi-pass high-quality bicubic resampling on an
 * OffscreenCanvas. Runs entirely off the main thread so the live render loop
 * is never starved. We step at most 2x per pass (the sweet spot for the
 * browser's built-in "high" smoothing kernel) until we reach the target.
 */
type Req = {
  bitmap: ImageBitmap;
  targetW: number;
  targetH: number;
  format?: "png" | "jpg";
  quality?: number;
};

self.onmessage = async (e: MessageEvent<Req>) => {
  const { bitmap, targetW, targetH, format = "png", quality = 1 } = e.data;
  try {
    let srcW = bitmap.width;
    let srcH = bitmap.height;
    let src: ImageBitmap | OffscreenCanvas = bitmap;

    // Step up by ≤2x per pass for best quality with the built-in kernel.
    while (srcW < targetW || srcH < targetH) {
      const nextW = Math.min(targetW, Math.floor(srcW * 2));
      const nextH = Math.min(targetH, Math.floor(srcH * 2));
      const off = new OffscreenCanvas(nextW, nextH);
      const ctx = off.getContext("2d", { alpha: format === "png" });
      if (!ctx) break;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // drawImage accepts ImageBitmap or OffscreenCanvas as source.
      ctx.drawImage(src, 0, 0, nextW, nextH);
      if (src instanceof ImageBitmap) src.close();
      src = off;
      srcW = nextW; srcH = nextH;
    }

    // Final pass: ensure exact target dims (in case last step hit the cap exactly).
    let outCanvas: OffscreenCanvas;
    if (src instanceof OffscreenCanvas && src.width === targetW && src.height === targetH) {
      outCanvas = src;
    } else {
      outCanvas = new OffscreenCanvas(targetW, targetH);
      const ctx = outCanvas.getContext("2d", { alpha: format === "png" });
      if (!ctx) throw new Error("no 2d context");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // drawImage accepts ImageBitmap or OffscreenCanvas as source.
      ctx.drawImage(src, 0, 0, targetW, targetH);
      if (src instanceof ImageBitmap) src.close();
    }

    if (format === "jpg") {
      // JPEG has no alpha. A white print substrate matches Image Magic Pro and
      // avoids browser-dependent black transparency fills.
      const flattened = new OffscreenCanvas(targetW, targetH);
      const ctx = flattened.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("no jpeg context");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(outCanvas, 0, 0);
      outCanvas = flattened;
    }
    const blob = await outCanvas.convertToBlob({
      type: format === "jpg" ? "image/jpeg" : "image/png",
      quality: format === "jpg" ? quality : undefined,
    });
    (self as unknown as Worker).postMessage({ ok: true, blob });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};
