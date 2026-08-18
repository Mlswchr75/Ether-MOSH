/**
 * Shatter Field — a living Voronoi-like cellular tessellation. Cell centres
 * drift slowly (toroidal wrap, so a cell that exits one edge re-enters the
 * opposite one) and the cracks between them stay visible as thin dark lines.
 * Each cell gets an offset-highlight radial shade — a simulated light source
 * — rather than a flat fill, so it reads as a lit dimensional form in the
 * same visual language as Volumetric Bloom, not a flat vector shape.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

type ShatterCell = { x: number; y: number; vx: number; vy: number };
export type ShatterFieldState = { cells: ShatterCell[]; lastT: number | null };

function toroidalDelta(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

function createState(seed: string): ShatterFieldState {
  const rand = rngFromSeed(seed);
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const ceiling = cpuCount <= 4 ? 9 : 13;
  const count = 6 + Math.floor(rand() * (ceiling - 6 + 1)); // 6..ceiling
  const cells: ShatterCell[] = [];
  for (let i = 0; i < count; i++) {
    cells.push({
      x: rand(),
      y: rand(),
      vx: (rand() - 0.5) * 0.03,
      vy: (rand() - 0.5) * 0.03,
    });
  }
  return { cells, lastT: null };
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as ShatterFieldState;
  const { ctx, w, h, t, palette, audio } = gctx;

  const dt = s.lastT == null ? 0 : Math.max(0, Math.min(0.25, t - s.lastT));
  s.lastT = t;
  const speed = 1 + audio.energy * 1.5;
  for (const cell of s.cells) {
    cell.x = ((cell.x + cell.vx * speed * dt) % 1 + 1) % 1;
    cell.y = ((cell.y + cell.vy * speed * dt) % 1 + 1) % 1;
  }

  const colors = [hexToRgb(palette[0]), hexToRgb(palette[1]), hexToRgb(palette[2])];
  const crackWidth = 0.006 + audio.dynamics * 0.01;

  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let best = Infinity;
      let second = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < s.cells.length; i++) {
        const cell = s.cells[i];
        const dx = toroidalDelta(u, cell.x);
        const dy = toroidalDelta(v, cell.y);
        const dist = dx * dx + dy * dy;
        if (dist < best) {
          second = best;
          best = dist;
          bestIdx = i;
        } else if (dist < second) {
          second = dist;
        }
      }

      const i4 = (y * w + x) * 4;
      if (Math.sqrt(second) - Math.sqrt(best) < crackWidth) {
        d[i4] = 4; d[i4 + 1] = 3; d[i4 + 2] = 6;
      } else {
        const col = colors[bestIdx % 3];
        const cell = s.cells[bestIdx];
        const cdx = toroidalDelta(u, cell.x);
        const cdy = toroidalDelta(v, cell.y);
        const distToCenter = Math.sqrt(cdx * cdx + cdy * cdy);
        const light = Math.max(0, 1 - distToCenter * 3.2);
        d[i4] = Math.min(255, col[0] * (0.55 + light * 0.6));
        d[i4 + 1] = Math.min(255, col[1] * (0.55 + light * 0.6));
        d[i4 + 2] = Math.min(255, col[2] * (0.55 + light * 0.6));
      }
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const SHATTER_FIELD = defineGenerator<ShatterFieldState>({
  id: "shatterField",
  name: "Shatter Field",
  category: "cellular",
  blurb: "A living cellular tessellation, cracks drifting and pulsing over time.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
