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
