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
import type { BlendMode, LayerRegion } from "./blend";
import { GENERATORS } from "./forgeGeneratorRegistry";
import { KALEIDOSCOPE_FOLD_OPTIONS } from "./forgeKaleidoscope";
import { craftOf, ROLES, type Role } from "./artDirector";

export type ForgeLayer = {
  effectId: string;
  params: Record<string, number>;
  opacity: number;
  blend: BlendMode;
  /** Confines this layer to part of the frame instead of covering it edge to
   *  edge — see composeForgeStack's own doc for why one layer sometimes gets
   *  this. Absent/null means full-frame, same as before this field existed. */
  region?: LayerRegion | null;
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

/** Weighted pick among a role's own candidates, honoring categoryBias the
 *  same way the flat fallback draw does — role decides *which slot* gets
 *  filled, category bias still decides *which effect* fills it. */
function pickRoleEffect(
  pool: string[],
  role: Role,
  bias: Partial<Record<EffectCategory, number>> | undefined,
  rand: () => number,
  exclude: Set<string>,
): string | null {
  const candidates = pool.filter(id => !exclude.has(id) && craftOf(id)?.role === role);
  if (!candidates.length) return null;
  if (!bias) return candidates[Math.floor(rand() * candidates.length)];
  const picked = weightedDraw(candidates, id => bias[EFFECTS_BY_ID[id]?.category ?? "corruption"] ?? MIN_WEIGHT, 1, rand);
  return picked[0] ?? null;
}

/** The flat, structure-free draw this composer used before role awareness —
 *  kept as the fallback for a pool too sparse to fill any role at all (an
 *  empty stack would otherwise be possible), so a shuffle never silently
 *  produces nothing just because this pool has no craftOf() coverage yet. */
function pickFlatBag(
  pool: string[],
  count: number,
  bias: Partial<Record<EffectCategory, number>> | undefined,
  rand: () => number,
): string[] {
  if (bias) {
    return weightedDraw(pool, id => bias[EFFECTS_BY_ID[id]?.category ?? "corruption"] ?? MIN_WEIGHT, count, rand);
  }
  const bag = pool.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.slice(0, count);
}

/** A single-layer region mask, geometric modes only — Forge has no photo to
 *  read foreground/background from (unlike the general Art Director's own
 *  rollPartition), so this is confined to shapes the pattern itself can
 *  carry: shattered plate, interleaved bands, centre-vs-surround. Ranges
 *  mirror rollPartition's own for the same modes, so a masked Forge layer
 *  reads the same way a masked regular-mosh layer does. */
function rollQuietRegion(rand: () => number): LayerRegion {
  const kind = rand();
  if (kind < 0.4) {
    const scale = 3 + Math.round(rand() * 12);
    return { mode: "shards", scale, phase: rand() * 100, gate: 0.5, feather: 0.02 };
  }
  if (kind < 0.75) {
    const mode = rand() < 0.5 ? "vbands" : "hbands";
    return { mode, scale: 2 + Math.round(rand() * 10), phase: rand(), feather: 0.03 + rand() * 0.16 };
  }
  return { mode: "radial", scale: 0.18 + rand() * 0.36, feather: 0.04 + rand() * 0.22 };
}

/**
 * Build a stack.
 *
 * Every effect already carries the same role (grade/form/accent/finish) the
 * general Art Director uses to keep its own compositions coherent — this
 * used to go untapped here, so a shuffle was pure category-weighted chance
 * with no notion of "one thing setting the color, one thing doing the
 * damage, maybe a polish coat," which is what actually reads as composed
 * rather than random. Grade is the one constant (the color world every
 * other layer sits in); form/accent take turns as the primary structural
 * move, weighted toward accent's corruption/temporal character as intensity
 * climbs; finish and a second accent are increasingly likely on top of that,
 * not guaranteed. One non-foundation layer, if the stack has one, sometimes
 * gets a region mask (rollQuietRegion) so it doesn't blanket the frame —
 * the "one quieter region" that makes the busier ones read as busier.
 *
 * Params are sampled across each effect's *declared* range rather than nudged
 * around defaults, because a pattern generator has no "correct" look to
 * preserve — the whole job is covering the space. That is the opposite of the
 * live visualiser, where the source image is the thing being served.
 */
export function composeForgeStack(opts: ForgeOpts): ForgeLayer[] {
  const { rand } = opts;
  const intensity = Math.max(0, Math.min(1, opts.intensity ?? 0.6));
  const bias = opts.categoryBias;

  const pool = opts.seamless ? tileSafeEffects() : Object.keys(EFFECTS_BY_ID);
  if (!pool.length) return [];

  const exclude = new Set<string>();
  const picks: { id: string; role: Role }[] = [];
  const addPick = (id: string | null, role: Role) => {
    if (!id) return false;
    picks.push({ id, role });
    exclude.add(id);
    return true;
  };

  // Foundation: the color world every other layer sits in.
  addPick(pickRoleEffect(pool, "grade", bias, rand, exclude), "grade");

  // The primary structural move — accent (corruption/temporal character)
  // more often as intensity climbs, form otherwise. Falls back to whichever
  // of the two actually has candidates if the preferred one comes up empty.
  const wantAccentFirst = rand() < 0.25 + intensity * 0.5;
  const firstRole: Role = wantAccentFirst ? "accent" : "form";
  const secondRole: Role = wantAccentFirst ? "form" : "accent";
  if (!addPick(pickRoleEffect(pool, firstRole, bias, rand, exclude), firstRole)) {
    addPick(pickRoleEffect(pool, secondRole, bias, rand, exclude), secondRole);
  }

  // A polish coat, increasingly likely at higher intensity but never
  // guaranteed — a stack that always finishes with a glow reads as a filter,
  // not a composition.
  if (rand() < 0.35 + intensity * 0.4) addPick(pickRoleEffect(pool, "finish", bias, rand, exclude), "finish");

  // A second accent only once there's real intensity to spend on it.
  if (intensity > 0.45 && rand() < (intensity - 0.45) * 1.1) {
    addPick(pickRoleEffect(pool, "accent", bias, rand, exclude), "accent");
  }

  let ids = picks.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)).map(p => p.id);

  // Safety net: a pool too sparse in craftOf() coverage to fill even the
  // foundation role (not the case for any pool today — see this phase's own
  // coverage check — but this composer must never go silently empty if that
  // ever changes) falls back to the old flat weighted/shuffled draw.
  if (!ids.length) {
    const count = Math.min(pool.length, 2 + Math.round(rand() * (1 + intensity * 3)));
    ids = pickFlatBag(pool, count, bias, rand);
  }

  // One non-foundation layer, sometimes, holds back a region instead of
  // covering the whole frame — never the foundation itself, which is what
  // establishes the field everything else sits on.
  const quietIndex = ids.length > 1 && rand() < 0.3 + intensity * 0.25
    ? 1 + Math.floor(rand() * (ids.length - 1))
    : -1;

  const out: ForgeLayer[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
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
      region: i === quietIndex ? rollQuietRegion(rand) : null,
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
