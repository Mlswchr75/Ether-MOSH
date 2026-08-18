/**
 * Pour Bloom — soft merging colour cells with ink-in-water boundary
 * blending, the "acrylic pour" read rather than gravity-drip streaks.
 * Classic inverse-square metaball field: each blob contributes r^2/dist^2 to
 * a scalar field, and where two blobs' fields are close to the surface
 * threshold together, a bright boundary line appears — the wet-ink edge.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

type PourBlob = { x: number; y: number; vx: number; vy: number; r: number };
export type PourBloomState = { blobs: PourBlob[]; lastT: number | null };

const SURFACE = 1.6;

function toroidalDelta(a: number, b: number): number {
  let d = Math.abs(a - b);
  if (d > 0.5) d = 1 - d;
  return d;
}

function createState(seed: string): PourBloomState {
  const rand = rngFromSeed(seed);
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const ceiling = cpuCount <= 4 ? 6 : 8;
  const count = 4 + Math.floor(rand() * (ceiling - 4 + 1)); // 4..ceiling
  const blobs: PourBlob[] = [];
  for (let i = 0; i < count; i++) {
    blobs.push({
      x: rand(),
      y: rand(),
      vx: (rand() - 0.5) * 0.02,
      vy: (rand() - 0.5) * 0.02,
      r: 0.12 + rand() * 0.14,
    });
  }
  return { blobs, lastT: null };
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as PourBloomState;
  const { ctx, w, h, t, palette, audio } = gctx;

  const dt = s.lastT == null ? 0 : Math.max(0, Math.min(0.25, t - s.lastT));
  s.lastT = t;
  const speed = 1 + audio.dynamics * 1.2;
  for (const b of s.blobs) {
    b.x = ((b.x + b.vx * speed * dt) % 1 + 1) % 1;
    b.y = ((b.y + b.vy * speed * dt) % 1 + 1) % 1;
  }

  const colors = [hexToRgb(palette[0]), hexToRgb(palette[1]), hexToRgb(palette[2])];
  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let field = 0;
      let dominant = 0;
      let dominantWeight = 0;
      for (let i = 0; i < s.blobs.length; i++) {
        const b = s.blobs[i];
        const dx = toroidalDelta(u, b.x);
        const dy = toroidalDelta(v, b.y);
        const distSq = Math.max(1e-5, dx * dx + dy * dy);
        const contribution = (b.r * b.r) / distSq;
        field += contribution;
        if (contribution > dominantWeight) {
          dominantWeight = contribution;
          dominant = i;
        }
      }

      const i4 = (y * w + x) * 4;
      const edge = Math.abs(field - SURFACE);
      const inside = Math.min(1, field / SURFACE);
      const col = colors[dominant % 3];
      const boundaryGlow = Math.max(0, 1 - edge * 4) * 0.5;

      d[i4] = Math.min(255, col[0] * (0.3 + inside * 0.75) + boundaryGlow * 255);
      d[i4 + 1] = Math.min(255, col[1] * (0.3 + inside * 0.75) + boundaryGlow * 200);
      d[i4 + 2] = Math.min(255, col[2] * (0.3 + inside * 0.75) + boundaryGlow * 255);
      d[i4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export const POUR_BLOOM = defineGenerator<PourBloomState>({
  id: "pourBloom",
  name: "Pour Bloom",
  category: "organic",
  blurb: "Soft merging colour cells with ink-in-water boundary blending.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
