/**
 * Quadrant model — the visual instrument's four "voices".
 *
 * The canvas is split into four quadrants that map 1:1 onto the first four
 * layers of the stack:
 *
 *     ┌─────────┬─────────┐
 *     │   Q1    │   Q2    │   Q1 = layers[0]  (bottom of the stack)
 *     │ top-left│top-right│   Q2 = layers[1]
 *     ├─────────┼─────────┤   Q3 = layers[2]
 *     │   Q3    │   Q4    │   Q4 = layers[3]  (top of the stack)
 *     │bot-left │bot-right│
 *     └─────────┴─────────┘
 *
 * Tapping a quadrant re-rolls only that quadrant's effect. The roll is biased
 * along a continuous *affinity* axis measured against whatever the other three
 * quadrants currently hold:
 *
 *     affinity = +1  →  as SIMILAR as possible to its neighbours (cohesive)
 *     affinity =  0  →  unrelated / wild
 *     affinity = -1  →  as INCOMPATIBLE as possible (clashing)
 *
 * Each tap samples a fresh affinity target, so repeated taps wander the whole
 * spectrum rather than converging on one flavour. Anti-repetition rules keep
 * the same handful of effects from recycling.
 */
import { EFFECTS, EFFECTS_BY_ID, type EffectCategory, type EffectDef } from "./effects";
import type { BlendMode } from "./blend";

export const QUADRANT_COUNT = 4;

export type QuadrantIndex = 0 | 1 | 2 | 3;

export const QUADRANT_LABELS: Record<QuadrantIndex, string> = {
  0: "Q1 top-left",
  1: "Q2 top-right",
  2: "Q3 bottom-left",
  3: "Q4 bottom-right",
};

/** Short label for the on-canvas HUD. */
export const QUADRANT_SHORT: Record<QuadrantIndex, string> = {
  0: "Q1", 1: "Q2", 2: "Q3", 3: "Q4",
};

/**
 * Which quadrant a normalized (0..1) canvas coordinate falls in.
 * Top-left is first, then top-right, bottom-left, bottom-right.
 */
export function quadrantAt(x: number, y: number): QuadrantIndex {
  const col = x < 0.5 ? 0 : 1;
  const row = y < 0.5 ? 0 : 2;
  return (row + col) as QuadrantIndex;
}

/** Normalized (0..1) position *within* the quadrant that contains (x, y). */
export function localInQuadrant(x: number, y: number): { x: number; y: number } {
  return {
    x: (x < 0.5 ? x : x - 0.5) * 2,
    y: (y < 0.5 ? y : y - 0.5) * 2,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Effect traits
   ────────────────────────────────────────────────────────────────────── */

export type EffectTraits = {
  /** Bends UVs (moves pixels) rather than recolouring them in place. */
  displaces: boolean;
  /** Animates on its own — reads uTime. */
  temporal: boolean;
  /** Reacts to the audio/gesture pulse. */
  pulsed: boolean;
  /** How much of the frame it rewrites, 0..1. Two heavy effects stacked = mud. */
  dominance: number;
  category: EffectCategory;
};

/**
 * Traits are *derived from the shader source* rather than hand-maintained, so
 * adding an effect to EFFECTS automatically gives it correct relations here.
 *   - displaces: samples uTex at anything other than plain vUv
 *   - temporal:  references uTime
 *   - pulsed:    references uPulse
 */
const DOMINANCE_BY_CATEGORY: Record<EffectCategory, number> = {
  corruption: 0.8,
  geometry: 0.7,
  color: 0.45,
  atmosphere: 0.35,
};

function deriveTraits(def: EffectDef): EffectTraits {
  // Only the main() body carries real usage — the shared header *declares*
  // uTime/uPulse/uTex for every effect, so scanning the whole shader would
  // mark all of them temporal and pulsed.
  const mainAt = def.frag.indexOf("void main(){");
  const body = mainAt >= 0 ? def.frag.slice(mainAt) : def.frag;

  // Samples uTex at anything other than plain `vUv`. An argument containing a
  // nested call can't be a bare vUv either, so a first-paren cut is enough.
  const displaces = Array.from(body.matchAll(/texture2D\s*\(\s*uTex\s*,([^)]*)\)/g))
    .some(m => m[1].trim() !== "vUv");
  const temporal = /\buTime\b/.test(body);
  const pulsed = /\buPulse\b/.test(body);
  // A displacing effect rewrites more of the frame than a pure recolour.
  const dominance = Math.min(1, DOMINANCE_BY_CATEGORY[def.category] + (displaces ? 0.15 : 0));
  return { displaces, temporal, pulsed, dominance, category: def.category };
}

export const TRAITS: Record<string, EffectTraits> = Object.fromEntries(
  EFFECTS.map(e => [e.id, deriveTraits(e)]),
);

/* ────────────────────────────────────────────────────────────────────────
   Similarity
   ────────────────────────────────────────────────────────────────────── */

/**
 * How naturally two categories sit together. 1 = same family, low = they fight.
 * Symmetric.
 */
const CATEGORY_AFFINITY: Record<EffectCategory, Record<EffectCategory, number>> = {
  corruption: { corruption: 1.0, geometry: 0.55, color: 0.45, atmosphere: 0.3 },
  geometry:   { corruption: 0.55, geometry: 1.0, color: 0.4, atmosphere: 0.45 },
  color:      { corruption: 0.45, geometry: 0.4, color: 1.0, atmosphere: 0.6 },
  atmosphere: { corruption: 0.3, geometry: 0.45, color: 0.6, atmosphere: 1.0 },
};

/**
 * Similarity of two effects, 0 (maximally incompatible) .. 1 (near-identical).
 * Category kinship dominates; trait overlap refines it.
 */
export function similarity(aId: string, bId: string): number {
  const a = TRAITS[aId];
  const b = TRAITS[bId];
  if (!a || !b) return 0.5;
  if (aId === bId) return 1;

  let s = CATEGORY_AFFINITY[a.category][b.category] * 0.6;
  // Shared mechanics read as "related" even across categories.
  if (a.displaces === b.displaces) s += 0.16;
  if (a.temporal === b.temporal) s += 0.08;
  if (a.pulsed === b.pulsed) s += 0.06;
  // Similar visual weight reads as belonging together.
  s += (1 - Math.abs(a.dominance - b.dominance)) * 0.1;
  return Math.max(0, Math.min(1, s));
}

/**
 * Mean similarity of a candidate against the effects held by other quadrants,
 * remapped to the -1..+1 affinity axis. With no neighbours the answer is 0
 * (nothing to be similar *to*), which makes the first roll a free-for-all.
 */
export function affinityAgainst(candidateId: string, neighbourIds: string[]): number {
  const others = neighbourIds.filter(Boolean);
  if (!others.length) return 0;
  const mean = others.reduce((acc, id) => acc + similarity(candidateId, id), 0) / others.length;
  return mean * 2 - 1;
}

/* ────────────────────────────────────────────────────────────────────────
   Rolling a quadrant
   ────────────────────────────────────────────────────────────────────── */

/** Human-readable name for where a roll landed on the affinity axis. */
export type RelationLabel = "clashing" | "contrary" | "wild" | "kindred" | "matched";

export function relationLabel(affinity: number): RelationLabel {
  if (affinity <= -0.6) return "clashing";
  if (affinity <= -0.2) return "contrary";
  if (affinity < 0.2) return "wild";
  if (affinity < 0.6) return "kindred";
  return "matched";
}

/**
 * Blend mode that *reads* as the chosen relation. Cohesive rolls composite
 * gently; clashing rolls use modes that visibly fight the layers beneath.
 */
const COHESIVE_BLENDS: BlendMode[] = ["normal", "screen", "overlay"];
const CLASHING_BLENDS: BlendMode[] = ["difference", "multiply", "additive", "hardLight"];

export function blendForRelation(affinity: number, rand: () => number, isBase: boolean): BlendMode {
  // The bottom of the stack always composites normally, otherwise the whole
  // frame can collapse to black before anything is drawn on top of it.
  if (isBase) return "normal";
  const pool = affinity < -0.2 ? CLASHING_BLENDS : COHESIVE_BLENDS;
  return pool[Math.floor(rand() * pool.length)];
}

export type RollOptions = {
  /** Effects currently held by the *other* quadrants. */
  neighbours: string[];
  /** Effects to avoid — the quadrant's own recent history plus its current effect. */
  exclude?: string[];
  /** Force a point on the affinity axis instead of rolling one. */
  targetAffinity?: number;
  rand: () => number;
};

export type RollResult = {
  effectId: string;
  /** Where this roll actually landed on the -1..+1 axis. */
  affinity: number;
  targetAffinity: number;
  relation: RelationLabel;
};

/** Effects that misbehave as a randomly-assigned layer (see MOSH_EXCLUDED_EFFECTS). */
const ROLL_EXCLUDED = new Set(["bloom", "frameSmear"]);

/**
 * Pick an effect for one quadrant.
 *
 * Rolls a target somewhere on the affinity axis, scores every eligible effect
 * by how close it sits to that target relative to the other quadrants, then
 * samples from the closest few so the same target never yields the same answer
 * twice running.
 */
export function rollQuadrantEffect(opts: RollOptions): RollResult {
  const { neighbours, rand } = opts;
  const exclude = new Set(opts.exclude ?? []);

  // Bias the axis toward the extremes a little — "definitely similar" and
  // "definitely wrong" are both more interesting than "vaguely unrelated".
  const targetAffinity = opts.targetAffinity ?? skewedAffinity(rand);

  let pool = EFFECTS.filter(e => !ROLL_EXCLUDED.has(e.id) && !exclude.has(e.id));
  // Never duplicate an effect another quadrant is already showing.
  const held = new Set(neighbours.filter(Boolean));
  const deduped = pool.filter(e => !held.has(e.id));
  if (deduped.length) pool = deduped;
  // Exclusions can starve the pool on a small effect list — fall back rather
  // than returning nothing.
  if (!pool.length) pool = EFFECTS.filter(e => !ROLL_EXCLUDED.has(e.id));

  // Shuffle before scoring. Without this, candidates that tie on distance keep
  // their registry order, and the "closest N" slice returns the same prefix
  // every time — most visible with an empty stack, where every candidate ties.
  const scored = shufflePool(pool, rand)
    .map(e => {
      const affinity = affinityAgainst(e.id, neighbours);
      return { id: e.id, affinity, distance: Math.abs(affinity - targetAffinity) };
    })
    .sort((a, b) => a.distance - b.distance);

  // Sample from the closest slice so the roll honours the target without being
  // deterministic. Wider slice on a wild target, tighter at the extremes.
  const width = Math.max(3, Math.round(scored.length * (0.08 + (1 - Math.abs(targetAffinity)) * 0.22)));
  const slice = scored.slice(0, Math.min(width, scored.length));
  const chosen = slice[Math.floor(rand() * slice.length)] ?? scored[0];

  return {
    effectId: chosen.id,
    affinity: chosen.affinity,
    targetAffinity,
    relation: relationLabel(chosen.affinity),
  };
}

/** Fisher–Yates against the caller's seeded RNG. */
function shufflePool<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Roll on -1..1, pushed away from the middle so rolls commit to a character. */
export function skewedAffinity(rand: () => number): number {
  const u = rand() * 2 - 1;              // -1..1 uniform
  const shaped = Math.sign(u) * Math.pow(Math.abs(u), 0.65); // widen the tails
  return Math.max(-1, Math.min(1, shaped));
}

/* ────────────────────────────────────────────────────────────────────────
   XY gesture mapping
   ────────────────────────────────────────────────────────────────────── */

export type AxisTarget = {
  /** Param key on the layer, or null when the axis drives layer opacity. */
  key: string | null;
  label: string;
  min: number;
  max: number;
  step?: number;
};

/**
 * What a drag inside a quadrant controls.
 *
 * Kaoss-pad convention: X is the effect's primary amount, Y is its secondary
 * character. An effect exposing a single param puts that param on X and gives
 * Y the layer's opacity, so both axes always do something.
 */
export function axisTargets(effectId: string): { x: AxisTarget; y: AxisTarget } | null {
  const def = EFFECTS_BY_ID[effectId];
  if (!def || !def.params.length) return null;

  const p0 = def.params[0];
  const x: AxisTarget = { key: p0.key, label: p0.label, min: p0.min, max: p0.max, step: p0.step };

  const p1 = def.params[1];
  const y: AxisTarget = p1
    ? { key: p1.key, label: p1.label, min: p1.min, max: p1.max, step: p1.step }
    : { key: null, label: "Opacity", min: 0, max: 1 };

  return { x, y };
}

/**
 * Apply a drag delta to an axis. `delta` is the fraction of the quadrant
 * travelled (-1..1); one full quadrant of travel sweeps the whole param range.
 */
export function applyAxisDelta(target: AxisTarget, baseline: number, delta: number): number {
  const span = target.max - target.min;
  let v = baseline + delta * span;
  v = Math.max(target.min, Math.min(target.max, v));
  if (target.step) v = Math.round(v / target.step) * target.step;
  return v;
}
