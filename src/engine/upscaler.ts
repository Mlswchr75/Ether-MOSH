/**
 * Async source upscale. Small uploads look mushy when the GPU cover-fits them
 * to a large viewport, so sub-HD images get resampled to 2x off the critical
 * path and swapped in once decoded. Returns null when no upscale is needed.
 */
const UPSCALE_THRESHOLD = 1400; // px — sources at least this wide are left alone
const MAX_DIM = 2800;

export async function upscaleImage(image: HTMLImageElement): Promise<HTMLImageElement | null> {
  const w = image.naturalWidth, h = image.naturalHeight;
  if (!w || !h) return null;
  if (Math.max(w, h) >= UPSCALE_THRESHOLD) return null;

  const scale = Math.min(2, MAX_DIM / Math.max(w, h));
  if (scale <= 1.05) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  try {
    const hi = new Image();
    hi.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      hi.onload = () => resolve();
      hi.onerror = () => reject(new Error("upscale decode failed"));
      hi.src = url;
    });
    return hi;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
