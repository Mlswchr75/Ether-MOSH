/**
 * OKLCH/OKLab color math — the perceptual layer the Forge redesign review
 * asked for ("does not calculate perceptual contrast, complementary
 * tension, dominance, or color roles"). HSL, which forgePalettes.ts used
 * exclusively before this, is not perceptually uniform: the same lightness
 * and saturation values read as very different actual brightness/vividness
 * depending on hue (yellow at L=0.5 reads far brighter than blue at the same
 * L). OKLab/OKLCH (Björn Ottosson's public conversion, used here verbatim)
 * fixes that — equal steps in L/C genuinely read as equal steps in
 * perceived lightness/chroma, which is what makes "generate a complementary
 * pair with real contrast" a computation instead of a guess.
 *
 * OKLab is the rectangular form (L, a, b); OKLCH is its polar form
 * (L, C, H) — C = chroma (distance from neutral gray), H = hue angle in
 * degrees. Hue math (complementary = +180°, triadic = ±120°, etc.) only
 * makes sense in the polar form, so this module works in OKLCH and
 * round-trips through OKLab only as the conversion step to/from sRGB.
 */

export type Oklch = { l: number; c: number; h: number };

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function linearToSrgb(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, s));
}

function linearRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}
function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

/** hex ("#RRGGBB") -> OKLCH. */
export function hexToOklch(hex: string): Oklch {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const [L, a, ob] = linearRgbToOklab(r, g, b);
  const c = Math.hypot(a, ob);
  const h = (Math.atan2(ob, a) * 180) / Math.PI;
  return { l: L, c, h: (h + 360) % 360 };
}

/** OKLCH -> hex ("#RRGGBB"), gamut-clamped by scaling chroma down rather
 *  than clipping channels — clipping shifts hue near the gamut edge, which
 *  is exactly the kind of perceptual inaccuracy this module exists to
 *  avoid. A handful of clamp passes converges quickly since sRGB's gamut is
 *  convex in this direction. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const L = Math.max(0, Math.min(1, l));
  const hr = (h * Math.PI) / 180;
  let chroma = Math.max(0, c);
  for (let i = 0; i < 8; i++) {
    const a = Math.cos(hr) * chroma;
    const b = Math.sin(hr) * chroma;
    const [r, g, bl] = oklabToLinearRgb(L, a, b);
    if (r >= -1e-4 && r <= 1 + 1e-4 && g >= -1e-4 && g <= 1 + 1e-4 && bl >= -1e-4 && bl <= 1 + 1e-4) break;
    chroma *= 0.82;
  }
  const a = Math.cos(hr) * chroma;
  const b = Math.sin(hr) * chroma;
  const [r, g, bl] = oklabToLinearRgb(L, a, b);
  const to255 = (v: number) => Math.round(linearToSrgb(v) * 255).toString(16).padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(bl)}`.toUpperCase();
}

/** Shortest signed distance from `a` to `b` around the hue circle, in
 *  degrees — e.g. hueDelta(350, 10) is 20, not -340 or 340. */
export function hueDelta(a: number, h: number): number {
  return ((h - a) % 360 + 540) % 360 - 180;
}
