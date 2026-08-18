/**
 * Kaleidoscope — not a generator, a modifier. Folds any generator's already-
 * rendered output into N-fold radial mirror symmetry by clipping to each
 * angular wedge and stamping a rotated (and, on alternating wedges, mirrored)
 * copy of the full source frame into it. Even fold counts only, so the
 * mirrored copies line up cleanly at wedge boundaries instead of leaving a
 * visible seam.
 */

export const KALEIDOSCOPE_FOLD_OPTIONS = [4, 6, 8] as const;

export function applyKaleidoscope(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  folds: number,
  source: HTMLCanvasElement,
) {
  const cx = w / 2;
  const cy = h / 2;
  const wedgeAngle = (Math.PI * 2) / folds;
  // Wedge/mirror geometry assumes a square canvas (w === h), which is what every
  // real caller uses (Forge's source canvas is fixed at 256x256). A non-square
  // canvas wouldn't mirror cleanly at wedge seams.
  const reach = Math.hypot(w, h);

  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < folds; i++) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, reach, i * wedgeAngle, (i + 1) * wedgeAngle);
    ctx.closePath();
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(i * wedgeAngle);
    if (i % 2 === 1) ctx.scale(1, -1);
    ctx.translate(-cx, -cy);

    ctx.drawImage(source, 0, 0, w, h);
    ctx.restore();
  }
}
