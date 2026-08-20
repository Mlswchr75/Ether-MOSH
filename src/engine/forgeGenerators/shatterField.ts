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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
  // Blend band width in the same normalized-distance units as crackWidth,
  // sized to read as ~1.5 screen px regardless of the source canvas'
  // resolution — keeps cracks a clean thin line instead of stair-stepping.
  const aaBand = 1.5 / Math.max(w, h);

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
      const col = colors[bestIdx % 3];
      const cell = s.cells[bestIdx];
      const cdx = toroidalDelta(u, cell.x);
      const cdy = toroidalDelta(v, cell.y);
      const distToCenter = Math.sqrt(cdx * cdx + cdy * cdy);
      const light = Math.max(0, 1 - distToCenter * 3.2);
      const cellR = Math.min(255, col[0] * (0.55 + light * 0.6));
      const cellG = Math.min(255, col[1] * (0.55 + light * 0.6));
      const cellB = Math.min(255, col[2] * (0.55 + light * 0.6));

      // Smoothly blend into the crack color across a thin band instead of a
      // hard threshold — the same Voronoi boundary, just anti-aliased.
      const edgeDist = Math.sqrt(second) - Math.sqrt(best);
      const crackMix = 1 - smoothstep(crackWidth - aaBand, crackWidth + aaBand, edgeDist);
      d[i4] = crackMix * 4 + (1 - crackMix) * cellR;
      d[i4 + 1] = crackMix * 3 + (1 - crackMix) * cellG;
      d[i4 + 2] = crackMix * 6 + (1 - crackMix) * cellB;
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
