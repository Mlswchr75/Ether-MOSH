import { drawSeamless } from "./seamlessSource";
import { FORGE_PALETTES } from "./forgePalettes";

export type ForgeSourceOpts = {
  paletteIdx: number;
  seed: number;
  /** 0..1 */
  intensity: number;
  baseImage: HTMLImageElement | null;
  /** How much of the generated field sits over `baseImage`, 0..1. */
  overlay: number;
};

/**
 * Forge's source texture — a procedural pattern, or that pattern composited
 * over an optional base photo. Shared by the live editor (GlCanvas, one
 * frame at a time) and the print export (one high-res frame, off-screen), so
 * an exported tile always matches what shuffling to it looked like on canvas.
 */
export function paintForgeSource(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  forge: ForgeSourceOpts,
  reactive: { treble: number; beat: number } = { treble: 0, beat: 0 },
) {
  const palette = FORGE_PALETTES[forge.paletteIdx] ?? FORGE_PALETTES[0];
  if (forge.baseImage) {
    const img = forge.baseImage;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (forge.overlay > 0.01) {
      const layer = document.createElement("canvas");
      layer.width = w; layer.height = h;
      const lctx = layer.getContext("2d");
      if (lctx) {
        drawSeamless(lctx, w, h, {
          colors: palette.colors,
          seed: forge.seed.toString(36),
          t,
          complexity: 2 + Math.round(forge.intensity * 4),
        });
        ctx.save();
        ctx.globalAlpha = forge.overlay;
        ctx.globalCompositeOperation = "overlay";
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
    }
    return;
  }
  const reactiveComplexity = Math.min(6, 2 + Math.round(forge.intensity * 4 + reactive.treble * 2));
  const beatKick = reactive.beat * 1.4;
  drawSeamless(ctx, w, h, {
    colors: palette.colors,
    seed: forge.seed.toString(36),
    t: t + beatKick,
    complexity: reactiveComplexity,
  });
}
