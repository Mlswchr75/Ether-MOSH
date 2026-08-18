/**
 * Seamless procedural source for Pattern Forge.
 *
 * The previous source drew a corner-to-corner linear gradient with radial blobs
 * scattered on top. Neither can ever tile: a gradient has a light end and a dark
 * end that meet at the seam, and a blob near an edge is simply cut in half.
 *
 * Everything here is periodic by construction instead:
 *
 *   COLOUR uses trigonometric fields whose arguments are integer multiples of
 *     2π·uv, so the value at u=0 and u=1 is the same number, not merely a
 *     similar one.
 *   BLOBS are drawn nine times, offset by every combination of -1/0/+1 tiles,
 *     so anything crossing an edge reappears on the opposite side. This is the
 *     standard wrap trick and it is cheaper and more exact than trying to
 *     construct blobs that never cross.
 *
 * The result tiles perfectly before any effect touches it, which is what makes
 * the rest of the chain worth constraining.
 */
import { rngFromSeed } from "./seed";

export type SeamlessOpts = {
  colors: [string, string, string];
  seed: string;
  /** Animation phase in seconds. Kept periodic so previews loop cleanly too. */
  t?: number;
  /** Higher = busier field. 1..6 is the useful range. */
  complexity?: number;
};

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const TAU = Math.PI * 2;

/**
 * Paint a seamless field into `ctx` at w x h.
 *
 * Writes pixels directly rather than using canvas gradients: a CanvasGradient
 * cannot be made periodic, and compositing one would reintroduce the seam this
 * whole module exists to avoid.
 */
export function drawSeamless(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SeamlessOpts,
) {
  const { colors, seed } = opts;
  const t = opts.t ?? 0;
  const complexity = Math.max(1, Math.min(6, Math.round(opts.complexity ?? 3)));
  const rng = rngFromSeed(seed);

  // Repeat count for this seed — how many times the field tiles across its
  // own canvas, not just at the outer edge. Since every frequency below is
  // an integer multiple of 2π·uv, multiplying them by an integer repeat
  // keeps the field exactly periodic (still seamless for export) while
  // making it periodic *more often* — the same "zoom out and tile" the
  // canvas already does at its outer boundary, just happening N times
  // instead of once. Weighted toward 2-3: dense enough that a single frame
  // reads as many small motifs instead of one soft blend, but a low chance
  // of 1 keeps the original look in the rotation too.
  const repeatRoll = rng();
  const tileRepeat = repeatRoll < 0.05 ? 1 : repeatRoll < 0.5 ? 2 : repeatRoll < 0.85 ? 3 : 4;

  const c0 = hexToRgb(colors[0]);
  const c1 = hexToRgb(colors[1]);
  const c2 = hexToRgb(colors[2]);

  // Integer frequencies only — a fractional frequency does not close the loop
  // across the tile, and that is exactly what a seam is.
  const waves = Array.from({ length: complexity }, () => ({
    fx: Math.max(1, Math.round(rng() * 3)) * tileRepeat,
    fy: Math.max(1, Math.round(rng() * 3)) * tileRepeat,
    phase: rng() * TAU,
    weight: 0.4 + rng() * 0.6,
  }));

  const img = ctx.createImageData(w, h);
  const d = img.data;

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;

      let a = 0;
      let b = 0;
      let wsum = 0;
      for (const wv of waves) {
        a += Math.sin(TAU * (u * wv.fx) + wv.phase + t * 0.35) * wv.weight;
        b += Math.cos(TAU * (v * wv.fy) + wv.phase * 1.7 + t * 0.28) * wv.weight;
        wsum += wv.weight;
      }
      a = (a / wsum + 1) * 0.5;
      b = (b / wsum + 1) * 0.5;

      // Two independent fields mixed pairwise gives three-colour blending
      // without any of them owning a corner.
      const m = (a * 0.6 + b * 0.4);
      const n = Math.abs(a - b);

      const i = (y * w + x) * 4;
      d[i]     = c0[0] * (1 - m) + c1[0] * m * (1 - n) + c2[0] * n;
      d[i + 1] = c0[1] * (1 - m) + c1[1] * m * (1 - n) + c2[1] * n;
      d[i + 2] = c0[2] * (1 - m) + c1[2] * m * (1 - n) + c2[2] * n;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  /* Wrapped blobs.

     Each blob is stamped nine times — the tile itself plus its eight
     neighbours — so a blob overlapping any edge is completed by its own copy
     coming in from the far side. Only the centre stamp is visible; the other
     eight exist purely to finish the ones that cross. */
  // Count scales with the repeat so each "cell" still gets its own share of
  // blobs instead of the same handful spreading thinner; radius and drift
  // shrink to match so a blob still sits proportionate to its cell rather
  // than swallowing several of them.
  const blobs = (3 + Math.round(rng() * 4)) * tileRepeat;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < blobs; i++) {
    const bx = rng() * w;
    const by = rng() * h;
    const r = (0.08 + rng() * 0.16) * Math.min(w, h) / tileRepeat;
    const col = [colors[0], colors[1], colors[2]][Math.floor(rng() * 3)];
    // Drift stays periodic so an animated preview also loops.
    const dx = Math.sin(t * 0.3 + i) * w * 0.04 / tileRepeat;
    const dy = Math.cos(t * 0.26 + i * 1.3) * h * 0.04 / tileRepeat;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = bx + dx + ox * w;
        const cy = by + dy + oy * h;
        // Skip stamps that cannot reach the tile at all.
        if (cx < -r || cx > w + r || cy < -r || cy > h + r) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, col + "66");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
