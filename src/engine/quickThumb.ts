/**
 * Instant, single-frame thumbnail for favoriting. Deliberately NOT the
 * multi-second best-frame scan used for exports — favoriting has to feel
 * like a tap, not a wait, so this just grabs whatever is on screen right now,
 * downscaled to gallery size.
 */
export function captureQuickThumb(source: HTMLCanvasElement, maxSize = 320): string | undefined {
  if (!source.width || !source.height) return undefined;
  try {
    const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(source, 0, 0, w, h);
    return out.toDataURL("image/jpeg", 0.72);
  } catch {
    // Tainted canvas (cross-origin source) or unsupported — a favorite
    // without a thumbnail is still a working favorite.
    return undefined;
  }
}
