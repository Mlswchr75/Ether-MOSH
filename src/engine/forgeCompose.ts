/**
 * Pattern Forge composition.
 *
 * Forge previously shuffled eight hand-listed effect ids. Six of them did not
 * exist — the registry is camelCase and the list was lowercase — and
 * `Renderer.render` skips unknown effects silently, so most shuffles rendered
 * two effects at best and often none. That is the whole reason the output felt
 * repetitive: it mostly wasn't applying anything.
 *
 * This draws from the live registry instead, so an effect added anywhere is
 * automatically available here, and params come from each effect's own declared
 * ranges rather than invented numbers that may not match the shader.
 */
import { EFFECTS_BY_ID, type EffectCategory } from "./effects";
import { tileSafeEffects, tileVerdict } from "./tileSafety";
import type { BlendMode } from "./blend";
import { GENERATORS } from "./forgeGeneratorRegistry";
import { KALEIDOSCOPE_FOLD_OPTIONS } from "./forgeKaleidoscope";

export type ForgeLayer = {
  effectId: string;
  params: Record<string, number>;
  opacity: number;
  blend: BlendMode;
};

/** Blends that build a pattern up rather than erasing what is under them. */
const PATTERN_BLENDS: BlendMode[] = ["normal", "screen", "overlay", "additive", "multiply"];

export type ForgeOpts = {
  rand: () => number;
  /** Confine the pool to effects that survive tiling. */
  seamless: boolean;
  /** 0..1 — layer count and how far params travel from their defaults. */
  intensity?: number;
  /**
   * Relative draw weight per category, for a director that has an opinion.
   * A missing or zero-ish category is made rare rather than impossible: a mode
   * that can only ever emit one kind of image is exactly what the plain shuffle
   * already felt like.
   */
  categoryBias?: Partial<Record<EffectCategory, number>>;
};

/** Floor under any bias weight, so nothing is ever fully locked out. */
const MIN_WEIGHT = 0.05;

/**
 * Draw `count` distinct ids, weighted.
 *
 * Weighted sampling *without replacement*: each pick removes its entry and the
 * total is recomputed, so a heavily-weighted category can't win every slot and
 * produce a stack of near-duplicates.
 */
function weightedDraw(
  ids: string[],
  weightOf: (id: string) => number,
  count: number,
  rand: () => number,
): string[] {
  const pool = ids.map(id => ({ id, w: Math.max(MIN_WEIGHT, weightOf(id)) }));
  const out: string[] = [];
  for (let k = 0; k < count && pool.length; k++) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = rand() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return out;
}

/**
 * Build a stack.
 *
 * Params are sampled across each effect's *declared* range rather than nudged
 * around defaults, because a pattern generator has no "correct" look to
 * preserve — the whole job is covering the space. That is the opposite of the
 * live visualiser, where the source image is the thing being served.
 */
export function composeForgeStack(opts: ForgeOpts): ForgeLayer[] {
  const { rand } = opts;
  const intensity = Math.max(0, Math.min(1, opts.intensity ?? 0.6));

  const pool = opts.seamless ? tileSafeEffects() : Object.keys(EFFECTS_BY_ID);
  if (!pool.length) return [];

  const count = Math.min(pool.length, 2 + Math.round(rand() * (1 + intensity * 3)));

  const bias = opts.categoryBias;
  let bag: string[];
  if (bias) {
    bag = weightedDraw(
      pool,
      id => bias[EFFECTS_BY_ID[id]?.category ?? "corruption"] ?? MIN_WEIGHT,
      count,
      rand,
    );
  } else {
    // Fisher-Yates over a copy: a random comparator is a biased shuffle, and with
    // a pool this size the bias is visible as certain effects rarely appearing.
    bag = pool.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  const out: ForgeLayer[] = [];
  for (let i = 0; i < count; i++) {
    const id = bag[i];
    const def = EFFECTS_BY_ID[id];
    if (!def) continue;

    const params: Record<string, number> = {};
    for (const p of def.params) {
      const span = p.max - p.min;
      // Bias toward the upper half at high intensity, but never pin to an end:
      // a stack of maxed-out effects reads as one flat smear.
      const t = 0.15 + rand() * 0.7 + intensity * 0.15;
      let v = p.min + span * Math.min(1, t);
      if (p.step) v = Math.round(v / p.step) * p.step;
      params[p.key] = Math.max(p.min, Math.min(p.max, v));
    }

    out.push({
      effectId: id,
      params,
      // The first layer establishes the field and composites normally; an
      // exotic blend at the bottom has nothing underneath to blend with.
      blend: i === 0 ? "normal" : PATTERN_BLENDS[Math.floor(rand() * PATTERN_BLENDS.length)],
      opacity: i === 0 ? 1 : 0.45 + rand() * 0.5,
    });
  }
  return out;
}

/** Why an effect is or isn't in the seamless pool — shown in the UI. */
export function explainPool(): { safe: string[]; rejected: { id: string; reason: string }[] } {
  const safe: string[] = [];
  const rejected: { id: string; reason: string }[] = [];
  for (const id of Object.keys(EFFECTS_BY_ID)) {
    const v = tileVerdict(id);
    if (v.safe) safe.push(id);
    else rejected.push({ id, reason: v.reason ?? "unknown" });
  }
  return { safe, rejected };
}

/**
 * Pick which generator drives the next shuffle. Uses the same weighted-draw
 * machinery as effect selection above. Weight is flat across generators
 * except for a device-tier bias: on low-CPU-count devices, `costTier:
 * "heavy"` generators (currently only Volumetric Bloom, the WebGL raymarch
 * generator) are drawn less often, since that is the most expensive thing
 * Forge can render and a weak device shouldn't land on it as often as
 * anything else. A director with an opinion (Journey, later) can still layer
 * its own weighting on top the same way categoryBias already lets it for
 * effects.
 */
export function pickForgeGenerator(rand: () => number): string {
  const lowTier = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 4) <= 4 : false;
  const picked = weightedDraw(
    GENERATORS.map(g => g.id),
    id => {
      const g = GENERATORS.find(x => x.id === id);
      return lowTier && g?.costTier === "heavy" ? 0.35 : 1;
    },
    1,
    rand,
  );
  return picked[0] ?? GENERATORS[0]?.id ?? "driftField";
}

/**
 * Roughly one shuffle in four wraps the chosen generator in kaleidoscope
 * symmetry. Returns the fold count to use, or null for no symmetry this
 * round.
 */
export function rollKaleidoscope(rand: () => number): number | null {
  if (rand() > 0.25) return null;
  const idx = Math.floor(rand() * KALEIDOSCOPE_FOLD_OPTIONS.length);
  return KALEIDOSCOPE_FOLD_OPTIONS[idx];
}
