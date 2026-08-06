// Composition grammar — the rules that turn a set of chosen effects into a
// stack that reads as one image instead of a pile.
//
// The directors used to emit bare effect ids and let the store assign every
// layer an opacity of 0.75–1.0. That is why heavy stacks looked "overdone":
// four effects each at ~0.85 all fight for the same pixels, and the result is
// mud no matter how good the individual effects are. Loudness is not intensity.
//
// The fix is hierarchy. Every stack gets exactly one load-bearing layer that is
// allowed to be loud, and everything else is explicitly subordinate to it.

import type { BlendMode } from "./blend";
import type { LayerRegion, RegionMode } from "./blend";
import type { EffectCategory } from "./effects";

export type Role = "structural" | "accent" | "texture" | "frame";

export type DirectedLayer = {
  effectId: string;
  opacity: number;
  blend: BlendMode;
  region: LayerRegion | null;
  role: Role;
};

/**
 * How much of the frame's attention one unit of opacity from this category
 * consumes. Geometry and dimension effects rearrange where things ARE, so two
 * of them at once destroy each other's readability. Atmosphere sits on top of
 * whatever is underneath and costs almost nothing.
 */
const INK: Record<EffectCategory, number> = {
  dimension: 1.0,
  geometry: 0.9,
  corruption: 0.65,
  color: 0.45,
  atmosphere: 0.25,
};

/** Total ink a stack may spend. Past this, layers stop reading as distinct. */
const INK_BUDGET = 1.65;

/** Opacity envelopes per role. The gap between structural and the rest is the point. */
const ROLE_OPACITY: Record<Role, [number, number]> = {
  structural: [0.85, 1.0],
  accent: [0.30, 0.55],
  texture: [0.22, 0.45],
  frame: [0.18, 0.36],
};

/** Blends that stay legible over a structural layer.
 *  `difference` and `hardLight` are deliberately absent: both obliterate what
 *  is beneath them, which is the opposite of what a subordinate layer is for. */
const ACCENT_BLENDS: BlendMode[] = ["screen", "overlay", "additive"];
const TEXTURE_BLENDS: BlendMode[] = ["overlay", "multiply", "screen"];

export const roleOfCategory = (c: EffectCategory): Role => {
  if (c === "dimension" || c === "geometry") return "structural";
  if (c === "color") return "accent";
  if (c === "atmosphere") return "frame";
  return "texture";
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Complementary region pairing.
 *
 * This is the single highest-leverage rule in the file. When the load-bearing
 * layer is dimensional, confining it to the foreground and pushing a different
 * treatment onto the background means the subject and the room they are standing
 * in are visibly running different physics. That reads as space being torn —
 * where the same two effects applied flat across the whole frame read as a
 * filter, because a filter is by definition something applied uniformly.
 */
function complementaryRegions(
  rand: () => number,
  intensity: number,
): { primary: LayerRegion; secondary: LayerRegion } | null {
  const roll = rand();

  // Depth split — subject and room treated as separate objects.
  if (roll < 0.55) {
    const subjectFirst = rand() < 0.5;
    const gate = lerp(0.34, 0.52, rand());
    const feather = lerp(0.06, 0.20, 1 - intensity);
    return {
      primary: { mode: subjectFirst ? "foreground" : "background", gate, feather },
      secondary: { mode: subjectFirst ? "background" : "foreground", gate, feather },
    };
  }

  // Shatter — the frame breaks into shards running different treatments.
  if (roll < 0.80) {
    const scale = Math.round(lerp(4, 14, rand()));
    const phase = rand() * 100;
    return {
      primary: { mode: "shards", scale, phase, gate: 0.5, feather: 0.02 },
      secondary: { mode: "shards", scale, phase, gate: 0.5, feather: 0.02, invert: true },
    };
  }

  // Strata — interleaved bands. Reads as a scan or a rip depending on count.
  const vertical = rand() < 0.35;
  const scale = Math.round(lerp(3, 16, rand()));
  const phase = rand();
  const mode: RegionMode = vertical ? "vbands" : "hbands";
  return {
    primary: { mode, scale, phase, feather: 0.04 },
    secondary: { mode, scale, phase, feather: 0.04, invert: true },
  };
}

export type ComposeInput = {
  /** Candidate ids, best-scoring first. */
  ranked: { id: string; score: number }[];
  categoryOf: (id: string) => EffectCategory;
  /** 0..1 — how wild the scene is. Drives layer count and region aggression. */
  intensity: number;
  rand: () => number;
};

/**
 * Build a composed stack.
 *
 * Guarantees, in priority order:
 *  1. Exactly one structural layer. Never two — that is the mud rule.
 *  2. Everything else is subordinate in opacity, by a wide margin.
 *  3. Total ink stays under budget, so adding layers cannot fill the frame.
 *  4. No two layers of the same category both sit above 0.5 opacity.
 */
export function composeStack(input: ComposeInput): DirectedLayer[] {
  const { ranked, categoryOf, rand } = input;
  const intensity = clamp01(input.intensity);
  if (!ranked.length) return [];

  const pickOpacity = (role: Role) => {
    const [lo, hi] = ROLE_OPACITY[role];
    return lerp(lo, hi, rand() * 0.7 + intensity * 0.3);
  };

  // ── 1. The load-bearing layer ──────────────────────────────────────
  // Prefer a dimensional effect: those are the only ones that add structure
  // rather than surface. Fall back to geometry, then to whatever ranked best.
  const dimensional = ranked.filter(r => categoryOf(r.id) === "dimension");
  const geometric = ranked.filter(r => categoryOf(r.id) === "geometry");
  const structuralPool = dimensional.length && rand() < 0.72 ? dimensional
                       : geometric.length ? geometric
                       : ranked;
  const base = structuralPool[Math.floor(rand() * Math.min(4, structuralPool.length))] ?? ranked[0];

  const baseIsDimensional = categoryOf(base.id) === "dimension";
  // Region-split the stack more often when the base can exploit it, and more
  // often as the scene gets wilder.
  const wantRegions = baseIsDimensional
    ? rand() < 0.45 + intensity * 0.3
    : rand() < 0.18 + intensity * 0.2;
  const regions = wantRegions ? complementaryRegions(rand, intensity) : null;

  const out: DirectedLayer[] = [{
    effectId: base.id,
    opacity: pickOpacity("structural"),
    blend: "normal",
    region: regions?.primary ?? null,
    role: "structural",
  }];

  let ink = INK[categoryOf(base.id)] * out[0].opacity;
  const usedLoud = new Set<EffectCategory>([categoryOf(base.id)]);
  const used = new Set([base.id]);

  // Calm scenes want two layers; chaos earns up to four. Even at four, three of
  // them are subordinate — the count adds richness, not volume.
  const targetCount = 2 + Math.round(intensity * 2);
  let secondaryPlaced = false;

  for (const cand of ranked) {
    if (out.length >= targetCount) break;
    if (used.has(cand.id)) continue;

    const cat = categoryOf(cand.id);
    // Rule 1: never a second structural layer.
    if (roleOfCategory(cat) === "structural") continue;

    const role = roleOfCategory(cat);
    let opacity = pickOpacity(role);

    // Rule 4: one loud layer per category.
    if (usedLoud.has(cat)) opacity = Math.min(opacity, 0.42);

    // Rule 3: stop before the frame fills up.
    const cost = INK[cat] * opacity;
    if (ink + cost > INK_BUDGET) continue;

    // Weighted acceptance so a stack isn't just the top N every time.
    if (rand() > 0.45 + cand.score * 0.5) continue;

    // The first accepted layer takes the complementary region, so the two
    // halves of the split are running visibly different treatments.
    const region = !secondaryPlaced && regions ? regions.secondary : null;
    if (region) secondaryPlaced = true;

    const blendPool = role === "texture" ? TEXTURE_BLENDS : ACCENT_BLENDS;
    const blend = rand() < 0.35
      ? "normal"
      : blendPool[Math.floor(rand() * blendPool.length)];

    out.push({ effectId: cand.id, opacity, blend, region, role });
    used.add(cand.id);
    usedLoud.add(cat);
    ink += cost;
  }

  return out;
}
