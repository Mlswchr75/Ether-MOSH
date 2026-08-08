/**
 * Force a render into a genuinely seamless tile.
 *
 * Detecting a seam and refusing to export is the wrong trade: the user wanted a
 * pattern, and "no" is less useful than "here, with a note". So rather than
 * gate on the measurement, this repairs the edges.
 *
 * THE METHOD — overlap and cross-fade, then crop.
 *
 * Render a canvas B pixels larger than the target on each axis. The right-hand
 * strip of that oversized render covers the same design territory the left edge
 * will need to continue into, so cross-fading it back over the left band makes
 * the two edges meet by construction. Cropping to the target size then yields a
 * tile whose wrap is exactly as continuous as the interior.
 *
 * Concretely, for x in [0, B):  out(x) = lerp(src(size + x), src(x), x / B)
 * At x = 0 that is src(size) — precisely the pixel that follows src(size - 1),
 * which is the tile's own right edge. The join is therefore continuous rather
 * than merely similar.
 *
 * This is the standard texture-authoring approach, and it is preferred over
 * mirroring (which produces visible bilateral symmetry) and over inpainting
 * (which needs a model and can invent structure that was never in the design).
 *
 * The cost is real and worth stating: detail inside the B-pixel band is a blend
 * of two places rather than one, so a very wide band on a highly structured
 * pattern reads as a soft frame. Keeping B near 6–12% of the tile keeps that
 * invisible on the kind of dense field Forge produces.
 */

/** Band width as a fraction of tile size. Enough to hide a join, small enough
 *  that the blended region does not read as a border. */
export const DEFAULT_HEAL_BAND = 0.09;

/**
 * The pixel maths, separated from canvas plumbing.
 *
 * Pure and array-in/array-out so it can be tested against real numbers rather
 * than against a mock canvas — a stubbed 2D context ends up testing the stub,
 * which is how the first version of these tests failed while the algorithm was
 * already correct.
 */
export function healPixels(
  src: Uint8ClampedArray,
  srcW: number,
  size: number,
  band: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const sAt = (x: number, y: number) => (y * srcW + x) * 4;
  const dAt = (x: number, y: number) => (y * size + x) * 4;

  for (let y = 0; y < size; y++) {
    // 0 at the very edge (take the wrapped material), 1 once past the band.
    const ty = band > 0 && y < band ? y / band : 1;
    for (let x = 0; x < size; x++) {
      const tx = band > 0 && x < band ? x / band : 1;
      const o = dAt(x, y);

      if (tx >= 1 && ty >= 1) {
        const i = sAt(x, y);
        out[o] = src[i]; out[o + 1] = src[i + 1]; out[o + 2] = src[i + 2]; out[o + 3] = 255;
        continue;
      }

      /* Bilinear across all four contributors so the corner, where both bands
         overlap, mixes properly instead of taking whichever axis ran last.

         The wrapped coordinate is only used on an axis that is actually
         blending. Reaching for `y + size` while outside the vertical band walks
         past the end of the source — the overlap is only `band` pixels tall,
         not a whole tile — and reads garbage. Collapsing to the unwrapped
         coordinate makes the corresponding lerp a no-op, which is exactly what
         a weight of 1 already means. */
      const wx = tx < 1 ? x + size : x;
      const wy = ty < 1 ? y + size : y;
      const a = sAt(x, y);
      const bx = sAt(wx, y);
      const by = sAt(x, wy);
      const bxy = sAt(wx, wy);
      for (let c = 0; c < 3; c++) {
        const top = src[bx + c] * (1 - tx) + src[a + c] * tx;
        const bot = src[bxy + c] * (1 - tx) + src[by + c] * tx;
        out[o + c] = top * ty + bot * (1 - ty);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

export type HealResult = {
  canvas: HTMLCanvasElement;
  /** Pixels blended on each axis. 0 means the source already tiled. */
  band: number;
};

/**
 * Crop an oversized render down to `size`, cross-fading the overlap so the
 * result tiles.
 *
 * `src` must be at least `size + band` on both axes — that surplus IS the
 * repair material. Passing an exactly-sized canvas leaves nothing to blend
 * with, so it is returned unchanged rather than silently producing a fake.
 */
export function healToSeamless(
  src: HTMLCanvasElement,
  size: number,
  bandFraction = DEFAULT_HEAL_BAND,
): HealResult {
  const band = Math.max(0, Math.min(
    Math.floor(size * Math.max(0, Math.min(0.35, bandFraction))),
    src.width - size,
    src.height - size,
  ));

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d", { willReadFrequently: true })!;

  if (band <= 0) {
    // Nothing to blend with — copy through rather than pretend to heal.
    octx.drawImage(src, 0, 0, size, size, 0, 0, size, size);
    return { canvas: out, band: 0 };
  }

  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) {
    octx.drawImage(src, 0, 0, size, size, 0, 0, size, size);
    return { canvas: out, band: 0 };
  }

  // Read the whole oversized render once; per-pixel getImageData calls would be
  // thousands of round trips at 4K.
  const s = sctx.getImageData(0, 0, src.width, src.height);
  const sd = s.data;
  const sw = src.width;

  const dst = octx.createImageData(size, size);
  dst.data.set(healPixels(sd, sw, size, band));

  octx.putImageData(dst, 0, 0);
  return { canvas: out, band };
}

/**
 * How much bigger to render so a tile of `size` can be healed.
 * Rendering at exactly `size` leaves no overlap to repair from.
 */
export function renderSizeFor(size: number, bandFraction = DEFAULT_HEAL_BAND): number {
  return size + Math.floor(size * Math.max(0, Math.min(0.35, bandFraction)));
}
