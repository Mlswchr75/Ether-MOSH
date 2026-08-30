/**
 * Contour Bands — a smooth noise field quantized into discrete color bands,
 * with a glowing neon contour line traced along every threshold crossing.
 *
 * Distinct from Shatter Field: that one is point-distance (Voronoi) cells
 * with soft radial shading and thin dark cracks. This is a continuous field
 * (fbm2) posterized into hard bands, with a *bright, emissive* line at each
 * boundary instead of a dark one — the "hard color bands + glowing contour
 * line" look reads as a topographic map or a cel-shaded terrain, a genuinely
 * different visual language from the cellular generators.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { fbm2, hashSeedToInt } from "../forgeNoise";
import { hexToRgb } from "../seamlessSource";

export type ContourBandsState = { seedNum: number };

function createState(seed: string): ContourBandsState {
  return { seedNum: hashSeedToInt(seed) };
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as ContourBandsState;
  const { ctx, w, h, t, palette, intensity, audio } = gctx;

  const colors = [hexToRgb(palette[0]), hexToRgb(palette[1]), hexToRgb(palette[2])];
  // More bands at higher intensity/treble — a busier contour map reads as
  // "more active" the same way Shatter Field's crack count does.
  const bandCount = 5 + Math.round(intensity * 5 + audio.treble * 3);
  // Field scale: a couple of noise "hills" across the frame, drifting slowly
  // with time so the bands migrate rather than sitting static.
  const scale = 2.2 + audio.density * 0.6;
  const drift = t * (0.05 + audio.energy * 0.08);
  // Contour width in band-fraction units — audio-reactive glow thickness,
  // pulses wider on beat energy without ever fully swallowing a band's fill.
  const contourWidth = 0.05 + audio.beat * 0.06;

  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y / h) * scale;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * scale + drift;
      const n = fbm2(u, v, s.seedNum, 3);

      const scaled = n * bandCount;
      const band = Math.floor(scaled);
      const frac = scaled - band;
      // Distance to the nearest threshold (0 or 1 edge of this band), so the
      // glow is symmetric around every boundary rather than only trailing
      // one side of it.
      const edgeDist = Math.min(frac, 1 - frac);
      const glow = 1 - Math.min(1, edgeDist / contourWidth);

      const fill = colors[((band % 3) + 3) % 3];
      const i4 = (y * w + x) * 4;
      if (glow > 0) {
        // Contour line color cycles through the palette too (offset by one)
        // so it reads as its own accent rather than a fixed white/neon that
        // would fight every palette MOSH hands Forge.
        const line = colors[((band + 1) % 3 + 3) % 3];
        const g = glow * glow; // sharpen the falloff — a thin bright line, not a soft band
        d[i4] = fill[0] * (1 - g) + Math.min(255, line[0] * 1.6) * g;
        d[i4 + 1] = fill[1] * (1 - g) + Math.min(255, line[1] * 1.6) * g;
        d[i4 + 2] = fill[2] * (1 - g) + Math.min(255, line[2] * 1.6) * g;
      } else {
        d[i4] = fill[0]; d[i4 + 1] = fill[1]; d[i4 + 2] = fill[2];
      }
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const CONTOUR_BANDS = defineGenerator<ContourBandsState>({
  id: "contourBands",
  name: "Contour Bands",
  category: "field",
  blurb: "Posterized noise bands with a glowing contour line at every threshold.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
