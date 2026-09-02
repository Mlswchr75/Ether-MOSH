import { useStore, makeLayer } from "@/store/useStore";
import { EFFECTS_BY_ID, PUBLIC_EFFECTS, type EffectCategory } from "./effects";
import { type LayerRegion, type BlendMode } from "./blend";
import type { Layer } from "@/store/types";

/** Every direct/manual mosh trigger (hot trigger, palette, trackpad
 *  double-click, quadrant tap, Auto-Mosh's interval) uses this — short
 *  enough to still feel immediate and responsive to a deliberate tap, long
 *  enough that it's a soft cut instead of a hard one. Journey's own
 *  autonomous compositions use a fuller, more deliberate fade (see
 *  journeyDirector.ts's own pacing) — DIRECTED_FADE_MS below. */
export const MOSH_FADE_MS = 680;
/** Journey composition changes — its own dedicated, slower pacing. */
export const DIRECTED_FADE_MS = 920;
/** Single Journey swaps are shorter than a new composition, but still meld
 * through the frame instead of popping a replacement layer in all at once. */
export const JOURNEY_DISRUPT_FADE_MS = 420;
export const CROSSFADE_INCOMING_FLOOR = 0.25;
export const CROSSFADE_OUTGOING_START = 0.75;

/**
 * How the outgoing/incoming layer stacks bleed into one another. Two modes
 * genuinely support a 0..1 "reveal progress" without extra shader work:
 *
 *  - shards: `regionMask` thresholds a per-cell hash against `gate`, so
 *    sweeping gate across its full range turns cells on in a staggered,
 *    hash-determined order — different patches of the frame settle at
 *    different moments instead of one uniform fade. This is the primary
 *    recipe; it's the one that actually reads as "different portions
 *    raise and decrease independently."
 *  - radial: has no gate dependency at all — it's driven by `scale`
 *    (the circle's radius) directly, so animating radius 0 -> full is a
 *    growing reveal, and full -> 0 is a shrinking one. Used as the other
 *    recipe for variety.
 *
 * hbands/vbands are deliberately excluded: in the compositor shader they're
 * driven by `phase` through a fixed zero-threshold sine band, with no gate
 * dependency either — animating phase scrolls the bands rather than growing
 * a reveal from nothing to everything, so they don't fit this mechanic.
 */
type RevealRecipe =
  | { mode: "shards"; density: number; phase: number; feather: number }
  | { mode: "radial"; feather: number }
  /** Uses Renderer’s live foreground/background proxy, so a subject and the
   * room around it trade places at different moments. */
  | { mode: "depth"; feather: number };

type StackProfile = {
  ids: Set<string>;
  categories: Partial<Record<EffectCategory, number>>;
  complexity: number;
  spatialWeight: number;
};

function profileStack(layers: Layer[]): StackProfile {
  const categories: StackProfile["categories"] = {};
  let spatialWeight = 0;
  for (const layer of layers) {
    const category = EFFECTS_BY_ID[layer.effectId]?.category;
    if (!category) continue;
    categories[category] = (categories[category] ?? 0) + 1;
    // Dimension effects literally use the depth/time structure; geometry
    // changes the composition’s silhouette more than a color correction does.
    spatialWeight += category === "dimension" ? 1 : category === "geometry" ? 0.55 : 0.16;
  }
  return {
    ids: new Set(layers.map(layer => layer.effectId)),
    categories,
    complexity: layers.length + Object.keys(categories).length * 0.45,
    spatialWeight,
  };
}

function stackDifference(before: StackProfile, after: StackProfile) {
  const shared = [...before.ids].filter(id => after.ids.has(id)).length;
  const union = new Set([...before.ids, ...after.ids]).size || 1;
  return 1 - shared / union;
}

/** Pick the reveal according to both stack structures. This is deliberately
 * performed for every pending Mosh: the same source can receive a shattered
 * exchange for a corruption-heavy handoff, then a subject-aware handoff for a
 * dimensional/geometry-heavy next stack. */
function rollRecipe(beforeLayers: Layer[], afterLayers: Layer[]): RevealRecipe {
  const before = profileStack(beforeLayers);
  const after = profileStack(afterLayers);
  const change = stackDifference(before, after);
  const spatial = before.spatialWeight + after.spatialWeight;
  const complexity = before.complexity + after.complexity;
  const depthChance = Math.min(0.62, 0.08 + spatial * 0.16 + change * 0.16);
  const roll = Math.random();

  if (roll < depthChance) {
    return { mode: "depth", feather: 0.055 + Math.min(0.16, complexity * 0.012) };
  }
  if (roll < 0.86) {
    return {
      mode: "shards",
      density: 5 + Math.min(20, complexity * 1.45 + change * 8) + Math.random() * 6,
      phase: Math.random() * 1000,
      feather: 0.07 + Math.random() * 0.12,
    };
  }
  return { mode: "radial", feather: 0.1 + Math.random() * 0.12 };
}

function stagger(t: number, index: number, side: "out" | "in") {
  // Deterministic per-layer stagger: every old/new effect has its own moment
  // to arrive, but both endpoints remain mathematically complete at 0 and 1.
  const seed = Math.sin((index + 1) * 71.173 + (side === "in" ? 13.7 : 0)) * 43758.5453;
  const offset = seed - Math.floor(seed);
  const start = offset * 0.32;
  return Math.max(0, Math.min(1, (t - start) / (1 - start)));
}

/** Region for one side of the reveal at progress `t` (0 = fully hidden, 1 =
 * fully shown), given the shared recipe for this transition. */
function regionAt(recipe: RevealRecipe, t: number, showing: boolean, index = 0): LayerRegion {
  const localT = stagger(t, index, showing ? "in" : "out");
  if (recipe.mode === "shards") {
    // Sweep gate across a range wide enough that the feathered threshold
    // fully clears both ends — otherwise a cell whose hash sits right at 0
    // or 1 never actually reaches a fully-settled mask value. Descending
    // (not ascending) because regionMask's smoothstep reads high-gate as
    // "suppress everything, low-gate as "admit everything" — gate has to
    // fall as t rises for the *base* mask to grow from 0 to 1.
    const span = 1 + 2 * recipe.feather;
    const gate = (1 - localT) * span - recipe.feather;
    return {
      mode: "shards", scale: recipe.density, phase: recipe.phase,
      gate, feather: recipe.feather, invert: !showing,
    };
  }
  if (recipe.mode === "depth") {
    // The depth texture is 1 for subject and 0 for room. Sweeping the cutoff
    // downward makes the incoming stack appear across real image structure;
    // inverse outgoing masks leave the same areas piece-by-piece.
    const span = 1 + 2 * recipe.feather;
    return {
      mode: "foreground",
      gate: (1 - localT) * span - recipe.feather,
      feather: recipe.feather,
      invert: !showing,
    };
  }
  // Radial: no invert needed — the two sides just grow/shrink opposite radii.
  const radius = (showing ? localT : 1 - localT) * 0.95;
  return { mode: "radial", scale: radius, feather: recipe.feather };
}

const BOUNDARY_CATEGORY_WEIGHT: Partial<Record<EffectCategory, number>> = {
  corruption: 3, color: 2,
};

function rollBoundaryEffectId(): string {
  const weighted = PUBLIC_EFFECTS.flatMap(e => Array(BOUNDARY_CATEGORY_WEIGHT[e.category] ?? 1).fill(e.id));
  return weighted[Math.floor(Math.random() * weighted.length)] ?? PUBLIC_EFFECTS[0]!.id;
}

const BOUNDARY_BLENDS: BlendMode[] = ["screen", "difference", "overlay", "hardLight", "additive"];

/** A transient extra layer, live only for the transition window, standing in
 * for "apply one of the catalog's own effects to the seam where the outgoing
 * and incoming scenes meet" — its own opacity peaks mid-transition and its
 * region tracks the same reveal boundary, so it reads as the transition
 * itself glitching rather than a layer that happens to be fading. */
function makeBoundaryLayer(recipe: RevealRecipe): Layer {
  const effectId = rollBoundaryEffectId();
  const blend = BOUNDARY_BLENDS[Math.floor(Math.random() * BOUNDARY_BLENDS.length)]!;
  return makeLayer(effectId, {
    id: "__transition_boundary__",
    blend,
    opacity: 0, // set per-frame in the tick loop
    region: recipe.mode === "shards"
      ? { mode: "shards", scale: recipe.density, phase: recipe.phase, gate: 0, feather: recipe.feather * 2.2 }
      : recipe.mode === "depth"
        ? { mode: "foreground", gate: 0.5, feather: recipe.feather * 2.2 }
      : { mode: "radial", scale: 0, feather: recipe.feather * 2.2 },
  });
}

/**
 * Crossfades the visible layer stack instead of hard-cutting it.
 *
 * Runs `commit` — any store action that replaces the unlocked layer stack
 * (mosh, moshDirected, ...) — exactly once, for its real and correct side
 * effects (undo history, seed, per-action bookkeeping like Mosh's
 * recentLooks/currentBrief). This never re-invokes or duplicates that
 * action's construction logic, so there's no risk of it re-rolling
 * something different the second time — it only visually interpolates
 * between the before and after snapshots it already has in hand.
 *
 * The interpolation itself is spatial, not a uniform opacity multiply: each
 * side gets a shared reveal recipe (see RevealRecipe) so different patches
 * of the frame settle at different moments, plus a transient boundary layer
 * running one of the catalog's own effects, peaking mid-transition, so the
 * scene change itself reads as a bleed/glitch rather than a clean dissolve.
 *
 * A single module-level animation slot means one crossfade cleanly
 * supersedes another regardless of what triggered either — Journey firing
 * mid-tap, or two rapid manual taps, both just restart the fade from
 * wherever it currently is rather than fighting or stacking.
 */
let fadeRaf: number | null = null;

export function crossfadeLayers(commit: () => void, durationMs: number) {
  if (fadeRaf != null) { cancelAnimationFrame(fadeRaf); fadeRaf = null; }

  const before = useStore.getState().layers.filter(l => !l.locked);

  commit();

  const after = useStore.getState().layers;
  const lockedAfter = after.filter(l => l.locked);
  const incoming = after.filter(l => !l.locked);

  const recipe = rollRecipe(before, incoming);
  const boundary = makeBoundaryLayer(recipe);
  // How loud the boundary effect gets at its peak — randomized per
  // transition so it isn't the same intensity every time.
  const boundaryPeak = 0.52 + Math.random() * 0.34;

  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const eased = t * t * (3 - 2 * t); // smoothstep

    const outgoingEnvelope = CROSSFADE_OUTGOING_START * (1 - eased);
    const incomingEnvelope = CROSSFADE_INCOMING_FLOOR + (1 - CROSSFADE_INCOMING_FLOOR) * eased;
    const reveal = CROSSFADE_INCOMING_FLOOR + eased * CROSSFADE_OUTGOING_START;
    const fadingOut = before.map((l, index) => ({
      ...l, opacity: l.opacity * outgoingEnvelope,
      region: regionAt(recipe, reveal, false, index),
    }));
    const fadingIn = incoming.map((l, index) => ({
      ...l, opacity: l.opacity * incomingEnvelope,
      region: regionAt(recipe, reveal, true, index),
    }));
    // Parabola peaking at the transition's midpoint, gone at both ends.
    const boundaryOpacity = 4 * eased * (1 - eased) * boundaryPeak;
    const boundaryNow: Layer = {
      ...boundary,
      opacity: boundaryOpacity,
      region: recipe.mode === "shards"
        ? { ...boundary.region!, gate: (1 - eased) * (1 + 2 * recipe.feather * 2.2) - recipe.feather * 2.2 }
        : recipe.mode === "depth"
          ? { ...boundary.region!, gate: 0.9 - eased * 0.8 }
        : { ...boundary.region!, scale: eased * 0.95 },
    };

    useStore.getState().setLayersRaw([...lockedAfter, ...fadingOut, ...fadingIn, boundaryNow]);
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick);
    } else {
      fadeRaf = null;
      // Restore the exact post-commit array (drops the now-invisible
      // outgoing layers and the transient boundary layer, instead of
      // leaving them sitting at opacity 0 or a stale region).
      useStore.getState().setLayersRaw(after);
    }
  };
  // Synchronous first call, not the first rAF frame — so the very first
  // thing GlCanvas's own render loop can observe after `commit()` is the
  // t≈0 blend, never one frame of the final, un-faded result.
  tick();
}

export function cancelLayerCrossfade() {
  if (fadeRaf != null) { cancelAnimationFrame(fadeRaf); fadeRaf = null; }
}
