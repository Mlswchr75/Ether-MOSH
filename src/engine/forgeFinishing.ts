/**
 * Shared finishing pass — runs on every generator's output, regardless of
 * which one produced it, so a Canvas2D generator reads as lit and dimensional
 * in the same visual language as Volumetric Bloom rather than looking flat
 * next to it. A cheap "poor man's bloom": blur a copy of the frame, then
 * screen-composite it back over the original at partial opacity.
 */
export function applyFinishingGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scratch: HTMLCanvasElement,
  scratchCtx: CanvasRenderingContext2D,
  intensity: number,
) {
  scratch.width = w;
  scratch.height = h;
  scratchCtx.clearRect(0, 0, w, h);
  scratchCtx.drawImage(ctx.canvas, 0, 0, w, h);
  scratchCtx.filter = `blur(${Math.max(2, Math.round(w * 0.02))}px)`;
  scratchCtx.drawImage(ctx.canvas, 0, 0, w, h);
  scratchCtx.filter = "none";

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.25 + Math.max(0, Math.min(1, intensity)) * 0.25;
  ctx.drawImage(scratch, 0, 0, w, h);
  ctx.restore();
}
