/**
 * Which band of the spectrum a parameter should listen to.
 *
 * Lifted out of GlCanvas so Pattern Forge can use the identical mapping. Two
 * copies of this table would drift, and the whole point is that a given control
 * feels the same wherever it appears — a "scale" param snapping to the beat in
 * the visualiser and drifting to overall energy in Forge would read as a bug.
 *
 * The keys are matched by name because effect params are authored freely; a
 * hand-maintained per-effect table would need updating every time an effect is
 * added, and would silently fall back to nothing when someone forgot.
 */

export type AudioBand = "bass" | "mid" | "treble" | "overall" | "beat";

export type DefaultMap = {
  source: AudioBand;
  /** Fraction of the param's range the band can push it. */
  amount: number;
  /** 0..1 — higher lags harder, so slow params don't jitter. */
  smoothing: number;
};

export function defaultAudioMap(key: string): DefaultMap {
  const k = key.toLowerCase();
  // Punchy / kick-driven params
  if (/(amount|intensity|strength|power|drive|gain|mix)/.test(k))
    return { source: "bass", amount: 0.55, smoothing: 0.25 };
  // Beat-snappy structural shifts
  if (/(scale|size|zoom|radius|thick|width|count|density|stripes|cells|blocks|tiles|grid|repeat|slices|shards|bands|facets)/.test(k))
    return { source: "beat", amount: 0.35, smoothing: 0.05 };
  // Colour / hue → treble shimmer
  if (/(hue|color|tint|saturat|chroma|rainbow|spectrum|prism|sheen|glow)/.test(k))
    return { source: "treble", amount: 0.45, smoothing: 0.4 };
  // Spatial distortion → mid energy
  if (/(shift|offset|displace|warp|distort|skew|twist|swirl|wave|wobble|bend|pinch|spread|split|spacing|angle|churn|curl|rip|seam|slip|slide)/.test(k))
    return { source: "mid", amount: 0.4, smoothing: 0.3 };
  // Time / motion / speed → overall envelope
  if (/(speed|rate|time|phase|frequency|tempo|flow|drift|spin|reach|persistence)/.test(k))
    return { source: "overall", amount: 0.3, smoothing: 0.5 };
  // Threshold / cutoff / detail → bass
  if (/(threshold|cutoff|edge|detail|noise|grain|bleed|feather)/.test(k))
    return { source: "bass", amount: 0.4, smoothing: 0.3 };
  // Default — gentle overall pulse so nothing is ever fully static
  return { source: "overall", amount: 0.25, smoothing: 0.5 };
}

/**
 * Apply a band to a value, with per-key smoothing carried in `state`.
 *
 * The caller owns the smoothing map so it survives across frames; passing it in
 * rather than holding module state keeps two renderers on one page from
 * bleeding into each other.
 */
export function applyAudio(
  value: number,
  key: string,
  range: number,
  sources: Record<string, number>,
  state: Map<string, number>,
  stateKey: string,
  map?: DefaultMap,
): number {
  const m = map ?? defaultAudioMap(key);
  const target = sources[m.source] ?? 0;
  const prev = state.get(stateKey) ?? 0;
  // Exponential smoothing. The floor keeps a fully-smoothed param from freezing
  // entirely, which reads as the control being broken rather than damped.
  const alpha = Math.max(0.02, 1 - m.smoothing * 0.98);
  const smoothed = prev + (target - prev) * alpha;
  state.set(stateKey, smoothed);
  return value + smoothed * m.amount * range;
}

/**
 * Band levels from a MicAnalyzer-shaped object.
 *
 * `beat` is derived rather than read: it is the part of the overall envelope
 * that rises above its own recent average, which is what makes a kick register
 * as an event instead of just more loudness.
 */
export function bandsFrom(mic: {
  bassLevel: number; midLevel: number; trebleLevel: number; overallLevel: number;
  level(): number;
}, beatEnvelope: number): Record<AudioBand, number> {
  return {
    bass: mic.bassLevel,
    mid: mic.midLevel,
    treble: mic.trebleLevel,
    overall: Math.max(mic.overallLevel, mic.level()),
    beat: beatEnvelope,
  };
}

/**
 * Track a beat envelope across frames.
 *
 * Rises instantly on a transient and falls slowly, so a kick produces a spike
 * that decays rather than a step that stays high. Returns the new envelope and
 * the running average it was measured against.
 */
export function stepBeat(
  level: number,
  prev: { envelope: number; average: number },
  dt: number,
): { envelope: number; average: number } {
  const average = prev.average + (level - prev.average) * Math.min(1, dt * 1.2);
  const excess = Math.max(0, level - average * 1.25);
  // Attack immediately, release over roughly a third of a second.
  const decayed = prev.envelope * Math.max(0, 1 - dt * 3.2);
  return { envelope: Math.min(1, Math.max(decayed, excess * 3)), average };
}
