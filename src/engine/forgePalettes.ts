import { generateRelationshipPalette } from "./colorScript";
import { hexToOklch, oklchToHex } from "./oklch";

/**
 * Forge's colour palettes — shared between the unified editor's forge mode
 * (GlCanvas) and the legacy standalone /forge page, so a palette means the
 * same three colours in both places.
 */
export type ForgePalette = { name: string; colors: [string, string, string] };

/** Tiny deterministic PRNG (mulberry32) — the relationship-generated
 *  palettes below need *a* rand function to break ties within their own
 *  recipe (which side a split-complementary leans, exact lightness within
 *  its band), but must come out identical on every load: this is a roster
 *  other code references by index and by name, not a fresh roll each
 *  session. Math.random() would make the "same" palette a different color
 *  on every page load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Six of the original ten palettes were three hand-picked hexes apiece with
 * no computed relationship between them — "does not calculate perceptual
 * contrast, complementary tension, dominance, or color roles" was a fair
 * complaint. Those six are now genuine named color relationships (see
 * colorScript.ts), computed in OKLCH so "complementary" really is ~180°
 * apart in a perceptually accurate space rather than a raw HSL hue flip.
 * A seventh relationship (fluorescentPastel — the one relationship whose
 * "void" slot stays light instead of dark) is added as a new eleventh
 * entry rather than displacing anything.
 *
 * The four "restrained, non pink-blue" palettes (ochre/moss/oxide/mono)
 * are untouched, verbatim — they're a deliberate design commitment (see
 * forgePalettes.test.ts) that this phase isn't the one to revisit.
 */
export const FORGE_PALETTES: ForgePalette[] = [
  generateRelationshipPalette("complementary", 200, mulberry32(1)),
  generateRelationshipPalette("splitComplementary", 260, mulberry32(2)),
  generateRelationshipPalette("triadic", 340, mulberry32(3)),
  generateRelationshipPalette("toxicNeon", 130, mulberry32(4)),
  generateRelationshipPalette("scorchedEarth", 20, mulberry32(5)),
  generateRelationshipPalette("chromaticBlack", 280, mulberry32(6)),
  { name: "ochre",   colors: ["#E6A817", "#6F3B18", "#140D08"] },
  { name: "moss",    colors: ["#A8C256", "#315C3A", "#07120B"] },
  { name: "oxide",   colors: ["#D85B38", "#6D8C83", "#160B0A"] },
  { name: "mono",    colors: ["#F2EEE6", "#77736D", "#090909"] },
  generateRelationshipPalette("fluorescentPastel", 40, mulberry32(7)),
];

type PaletteBrief = { needsColor: number; needsLift: number; needsCompression: number; warmth: number; saturation: number };

/** sRGB's roughly-achievable chroma ceiling in OKLCH — used only to rescale
 *  chroma onto a 0..1-ish band comparable to HSL saturation's native 0..1,
 *  so the scoring weights below (tuned back when this read HSL) still land
 *  in the same range. Not a hard limit — real chroma can exceed this at
 *  some hue/lightness combinations — just a normalization constant. */
const CHROMA_NORM = 0.37;

/** Automatic palette judgement shared by regular Mosh, Journey and Forge.
 *  Reads each candidate in OKLCH rather than HSL: HSL's saturation/
 *  lightness aren't perceptually uniform (the same S/L values read as very
 *  different actual vividness/brightness depending on hue), which is
 *  exactly the "does not calculate perceptual contrast... or dominance"
 *  gap the Forge redesign review flagged. */
export function chooseArtDirectedPalette(brief: PaletteBrief, rand: () => number = Math.random, currentIdx = -1): number {
  const scored = FORGE_PALETTES.map((palette, index) => {
    const oklchs = palette.colors.map(hexToOklch);
    const saturation = Math.min(1, oklchs.reduce((sum, o) => sum + o.c, 0) / oklchs.length / CHROMA_NORM);
    const light = oklchs.reduce((sum, o) => sum + o.l, 0) / oklchs.length;
    const warm = oklchs.filter(o => o.h < 75 || o.h > 330).length / oklchs.length;
    let score = saturation * brief.needsColor * 1.2;
    score += light * brief.needsLift * 0.7 + (1 - light) * brief.needsCompression * 0.55;
    score += brief.warmth > 0.57 ? (1 - warm) * 0.8 : brief.warmth < 0.43 ? warm * 0.8 : 0;
    if (brief.saturation > 0.7) score += (1 - saturation) * 0.7;
    if (index === currentIdx) score -= 1.8;
    return { index, score: score + rand() * 0.22 };
  }).sort((a, b) => b.score - a.score);
  return scored[Math.floor(rand() * Math.min(3, scored.length))]?.index ?? 0;
}

/** Cheap deterministic 0..1 hash so a numeric seed reliably re-derives the same hue jitter. */
function seedFrac(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Rotates a base palette's hue by a seed-derived amount (and gives chroma
 * a smaller seed-derived nudge) so re-rolling the seed varies *color*, not
 * just the shape/layout the seed already drives — previously every reroll
 * within one palette choice repeated the exact same three hues.
 *
 * OKLCH rather than HSL for the same reason as the scoring above: rotating
 * hue in HSL at a fixed S/L can noticeably change how vivid or bright a
 * color reads (some hues are just perceptually louder than others at the
 * "same" HSL values) — OKLCH's hue rotation holds perceived lightness and
 * chroma genuinely fixed, so only the hue actually moves.
 */
export function seededPalette(base: ForgePalette, seed: number): ForgePalette {
  const hueShift = (seedFrac(seed, 1) - 0.5) * 2 * 55; // ±55°
  const chromaMul = 0.85 + seedFrac(seed, 2) * 0.3; // 0.85x - 1.15x
  const colors = base.colors.map((hex) => {
    const { l, c, h } = hexToOklch(hex);
    return oklchToHex({ l, c: Math.max(0, c * chromaMul), h: h + hueShift });
  }) as [string, string, string];
  return { name: base.name, colors };
}
