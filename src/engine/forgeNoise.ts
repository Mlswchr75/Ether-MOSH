/**
 * Small shared value-noise kit for Forge generators that need a smooth,
 * continuous 2D field (Contour Bands' posterized bands, Drift Field's mesh
 * warp) rather than the point-distance math Shatter Field/Pour Bloom use.
 *
 * Hand-rolled rather than a library, matching every other generator in this
 * folder — no noise/perlin package is a dependency anywhere in this repo.
 * Classic value noise: hash the four corners of the cell a point falls in,
 * bilinear-interpolate with a smootherstep easing (Perlin's improved fade
 * curve — zero first *and* second derivative at the cell boundary, so
 * adjacent cells never show a visible seam even under a posterize/threshold,
 * which a plain lerp or smoothstep can). fbm2 layers a few octaves for
 * richer, less obviously-grid-aligned detail.
 */

function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Single-octave value noise, continuous, range ~[0,1]. */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const sx = smootherstep(x - x0), sy = smootherstep(y - y0);
  const n00 = hash2(x0, y0, seed), n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed), n11 = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

/** Turns a string seed into the numeric seed valueNoise2/fbm2 want. */
export function hashSeedToInt(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return h;
}

/** Fractal Brownian motion — layered value noise, still ~[0,1]. */
export function fbm2(x: number, y: number, seed = 0, octaves = 3): number {
  let total = 0, amp = 0.5, freq = 1, max = 0;
  for (let o = 0; o < octaves; o++) {
    total += valueNoise2(x * freq, y * freq, seed + o * 101) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return max > 0 ? total / max : 0;
}
