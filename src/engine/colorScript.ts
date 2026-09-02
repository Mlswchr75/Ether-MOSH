/**
 * Named color relationships, computed in OKLCH rather than picked by hand —
 * the second half of "Replace palette presets with a perceptual Color
 * Script" from the Forge redesign review. Each relationship is a real rule
 * about how the two vivid colors' hues relate to each other (complementary
 * = opposite, triadic = a third of the way round, etc.), not a vibe
 * word attached to whatever hex happened to look right.
 *
 * Output is a ForgePalette-shaped 3-tuple — [dominant, antagonist, void] —
 * on purpose: every consumer of FORGE_PALETTES (six Forge generators, the
 * embed background, Journey, the legacy /forge page) already expects
 * exactly that shape, so this plugs into the existing roster instead of
 * requiring a second, parallel palette system.
 */
import { oklchToHex } from "./oklch";
import type { ForgePalette } from "./forgePalettes";

export type ColorRelationship =
  | "complementary" | "splitComplementary" | "triadic"
  | "toxicNeon" | "scorchedEarth" | "chromaticBlack" | "fluorescentPastel";

export const COLOR_RELATIONSHIPS: ColorRelationship[] = [
  "complementary", "splitComplementary", "triadic",
  "toxicNeon", "scorchedEarth", "chromaticBlack", "fluorescentPastel",
];

/**
 * `baseHue` is the dominant color's hue, 0..360. `rand` only breaks ties
 * within a relationship's own recipe (which side a split-complementary
 * leans, exact lightness/chroma within its band) — the relationship
 * itself, and therefore the hue math, is deterministic for a given hue.
 */
export function generateRelationshipPalette(
  relationship: ColorRelationship,
  baseHue: number,
  rand: () => number = Math.random,
): ForgePalette {
  const h = ((baseHue % 360) + 360) % 360;

  switch (relationship) {
    case "complementary": {
      const antag = h + 180;
      return build(relationship, h, antag, 0.72 + rand() * 0.1, 0.16 + rand() * 0.04, 0.16, h);
    }
    case "splitComplementary": {
      const side = rand() < 0.5 ? -1 : 1;
      const antag = h + 180 + side * 30;
      return build(relationship, h, antag, 0.72 + rand() * 0.1, 0.15 + rand() * 0.04, 0.16, h);
    }
    case "triadic": {
      const side = rand() < 0.5 ? 120 : 240;
      const antag = h + side;
      return build(relationship, h, antag, 0.72 + rand() * 0.08, 0.15 + rand() * 0.03, 0.15, h);
    }
    case "toxicNeon": {
      // Max-chroma clash — hues far enough apart to fight, not necessarily
      // a clean complementary pair. Lightness sits at 0.65-0.75 rather than
      // higher: sRGB's gamut narrows sharply above ~0.8 for blue/violet
      // hues specifically (a target chroma achievable for green at l=0.85
      // clamps down hard for blue at the same lightness), so a flat "high
      // lightness" target read as vivid for warm hues and washed-out pastel
      // for cool ones. This band keeps real vividness consistent across
      // the whole hue wheel instead of being hue-lucky.
      const antag = h + 90 + rand() * 60;
      return build(relationship, h, antag, 0.65 + rand() * 0.1, 0.28 + rand() * 0.05, 0.07, h);
    }
    case "scorchedEarth": {
      // Warm hues only (orange/red band), lower chroma than neon, contrast
      // comes from a lightness drop between dominant and antagonist rather
      // than hue opposition — the "burnt" half sits darker.
      const warmHue = h % 60; // fold onto a warm 0..60° band (red -> orange -> amber)
      return {
        name: relationship,
        colors: [
          oklchToHex({ l: 0.68 + rand() * 0.1, c: 0.15 + rand() * 0.04, h: warmHue }),
          oklchToHex({ l: 0.34 + rand() * 0.08, c: 0.12 + rand() * 0.04, h: warmHue + 15 + rand() * 15 }),
          oklchToHex({ l: 0.09 + rand() * 0.03, c: 0.03, h: warmHue }),
        ],
      };
    }
    case "chromaticBlack": {
      // Black with color in it, not neutral black: the void itself carries
      // real chroma at very low lightness, with one small vivid accent to
      // give it something to be "chromatic" against.
      const antag = h + 40 + rand() * 60;
      return {
        name: relationship,
        colors: [
          oklchToHex({ l: 0.6 + rand() * 0.15, c: 0.18 + rand() * 0.06, h }),
          oklchToHex({ l: 0.4 + rand() * 0.1, c: 0.1 + rand() * 0.04, h: antag }),
          oklchToHex({ l: 0.06 + rand() * 0.03, c: 0.06 + rand() * 0.03, h }),
        ],
      };
    }
    case "fluorescentPastel": {
      // Analogous (close) hues, soft chroma, high lightness across the
      // board — pastel means the whole palette stays light, unlike every
      // other relationship's dark void, so a generator reading this
      // palette gets a genuinely different brightness character, not just
      // different hues.
      const antag = h + 30 + rand() * 30;
      return {
        name: relationship,
        colors: [
          oklchToHex({ l: 0.86 + rand() * 0.06, c: 0.13 + rand() * 0.04, h }),
          oklchToHex({ l: 0.82 + rand() * 0.06, c: 0.11 + rand() * 0.04, h: antag }),
          oklchToHex({ l: 0.42 + rand() * 0.08, c: 0.06 + rand() * 0.03, h: (h + antag) / 2 }),
        ],
      };
    }
  }
}

function build(
  name: string, domHue: number, antagHue: number,
  l: number, c: number, voidL: number, voidHue: number,
): ForgePalette {
  return {
    name,
    colors: [
      oklchToHex({ l, c, h: domHue }),
      oklchToHex({ l, c, h: antagHue }),
      oklchToHex({ l: voidL, c: 0.04, h: voidHue }),
    ],
  };
}
