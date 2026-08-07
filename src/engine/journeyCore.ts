/**
 * Shared journey machinery — how a set is read and how it is paced.
 *
 * Extracted so the visualiser and Pattern Forge run the same arc off the same
 * measurements. Two copies would drift, and the whole point of a journey is
 * that it feels like one thing wherever it is running.
 *
 * WHAT IS ACTUALLY MEASURED, AND WHAT IS NOT
 *
 * There is no model here and no network call, so nothing "recognises" a song.
 * What it does is measure, from the live spectrum:
 *
 *   TEMPO        — median inter-onset interval, folded into 70..180 BPM.
 *   REGULARITY   — spread of those intervals. A drum machine is tight; a live
 *                  band drifts; a pad has no onsets to be regular about.
 *   BRIGHTNESS   — spectral centroid. Where the energy sits in the spectrum,
 *                  which is what separates a hi-hat-led track from a sub-led one.
 *   WEIGHT       — bass share of total energy.
 *   DENSITY      — onsets per second.
 *   DYNAMICS     — how much the level moves. Compressed club masters barely
 *                  breathe; a live take does.
 *
 * Those six axes genuinely characterise music, and they cluster: 128 BPM with
 * tight regularity and heavy bass is a different animal from 128 BPM with loose
 * regularity and mid-forward energy. The style names below are labels for those
 * measured clusters, chosen because they name the family a cluster usually
 * belongs to — they are a shorthand for the measurement, not a claim to have
 * identified the genre. The readout shown to the user is built from the numbers
 * themselves for exactly that reason.
 */

/* ── Audio characterisation ───────────────────────────────────────────── */

export type AudioFeatures = {
  /** 0 when no confident estimate exists. */
  bpm: number;
  /** 0..1 — how regular the onsets are, and so how much to trust `bpm`. */
  regularity: number;
  /** Onsets per second over the analysis window. */
  density: number;
  /** Spectral centroid, 0..1. Low = sub-heavy, high = hat/air-led. */
  brightness: number;
  /** Bass share of total energy, 0..1. */
  weight: number;
  /** Level variation over the window, 0..1. Low = compressed/steady. */
  dynamics: number;
  /** Mean level, 0..1. */
  energy: number;
};

export const SILENT_FEATURES: AudioFeatures = {
  bpm: 0, regularity: 0, density: 0,
  brightness: 0.4, weight: 0.4, dynamics: 0, energy: 0,
};

/**
 * Style names for the measured clusters. `silence` is separate from `ambient`
 * because "nothing is playing" and "something slow and wide is playing" want
 * completely different visuals, and conflating them makes the mode look broken
 * when the user simply hasn't started the music yet.
 */
export type MusicStyle =
  | "silence" | "ambient" | "downtempo" | "hiphop"
  | "house" | "techno" | "breaks" | "band" | "noise";

export type StyleReading = {
  style: MusicStyle;
  /** Built from the measurements, so the readout never overclaims. */
  label: string;
};

/** Spectral centroid from FFT band averages, normalised 0..1. */
export function centroidOf(bands: ArrayLike<number>): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < bands.length; i++) {
    const v = Math.max(0, bands[i]);
    num += i * v;
    den += v;
  }
  if (den <= 1e-6 || bands.length < 2) return 0.4;
  return Math.max(0, Math.min(1, num / den / (bands.length - 1)));
}

/**
 * Tempo and regularity from onset timestamps.
 *
 * The median interval is used rather than the mean because a single missed or
 * doubled onset drags a mean badly, and onset detection misses constantly on
 * real material. Regularity is the inverse spread around that median — a drum
 * machine sits near 1, a rubato piano near 0.
 */
export function tempoFrom(onsets: number[]): { bpm: number; regularity: number } {
  if (onsets.length < 4) return { bpm: 0, regularity: 0 };
  const gaps: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const g = onsets[i] - onsets[i - 1];
    if (g > 60 && g < 3000) gaps.push(g);
  }
  if (gaps.length < 3) return { bpm: 0, regularity: 0 };

  const sorted = gaps.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!median) return { bpm: 0, regularity: 0 };

  /* Spread is measured against the median in *relative* terms: 40ms of jitter
     at 500ms is tight, the same 40ms at 120ms is not. Fold each gap onto the
     nearest whole multiple of the median first, so a skipped onset reads as a
     missed beat rather than as sloppiness. */
  let spread = 0;
  for (const g of gaps) {
    const mult = Math.max(1, Math.round(g / median));
    spread += Math.abs(g - median * mult) / median;
  }
  const regularity = Math.max(0, Math.min(1, 1 - (spread / gaps.length) / 0.32));

  let bpm = 60000 / median;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  bpm = Math.round(bpm);
  if (bpm < 60 || bpm > 200) return { bpm: 0, regularity };
  return { bpm, regularity };
}

/**
 * Name the measured cluster.
 *
 * Ordered from most to least distinctive so an early match wins: a track that
 * satisfies both "noise" and "techno" is far more informative as noise.
 */
export function classifyStyle(f: AudioFeatures): StyleReading {
  const bits: string[] = [];
  if (f.bpm > 0 && f.regularity > 0.25) bits.push(`${f.bpm} BPM`);
  bits.push(
    f.regularity > 0.72 ? "machine-tight"
      : f.regularity > 0.42 ? "steady"
        : f.density > 0.4 ? "loose"
          : "unpulsed",
  );
  bits.push(
    f.weight > 0.5 ? "bass-forward"
      : f.brightness > 0.55 ? "top-heavy"
        : "mid-forward",
  );
  if (f.dynamics > 0.3) bits.push("dynamic");
  const label = bits.join(" · ");

  const style: MusicStyle = (() => {
    if (f.energy < 0.045) return "silence";

    // Dense, bright and unpulsed — harsh material where a tempo would be
    // meaningless. Checked first because it also trips the tempo heuristics.
    if (f.density > 3.4 && f.brightness > 0.52 && f.regularity < 0.3) return "noise";

    // Nothing periodic to lock to. Pads, drones, field recordings.
    if (f.density < 0.7 || f.bpm === 0 || f.regularity < 0.18) return "ambient";

    if (f.bpm >= 155 && f.regularity > 0.4) return "breaks";

    if (f.bpm >= 122 && f.regularity > 0.62) {
      // Both sit in the same tempo band; what separates them is the spectrum.
      return f.brightness < 0.42 && f.weight > 0.42 ? "techno" : "house";
    }

    if (f.bpm <= 108 && f.weight > 0.42) return "hiphop";
    if (f.bpm <= 100) return "downtempo";

    // A confident tempo with human-sized drift: a room with players in it.
    return "band";
  })();

  return { style, label };
}

/* ── Frame characterisation ───────────────────────────────────────────── */

export type FrameStats = {
  contrast: number;
  detail: number;
  saturation: number;
  clipping: number;
  motion: number;
  /**
   * 0..1 — how much visual load the frame already carries. The director treats
   * this as a budget that has been spent, not as a score to maximise.
   */
  load: number;
};

export const EMPTY_FRAME: FrameStats = {
  contrast: 0, detail: 0, saturation: 0, clipping: 0, motion: 0, load: 0,
};

/**
 * Measure a rendered frame.
 *
 * Deliberately the same family of measurements as `scoreFrame` in timeScrub,
 * but combined the other way round: there, detail and colour are virtues to be
 * ranked; here they are costs to be budgeted. Sharing the measurements while
 * keeping the two verdicts separate is the point — one is choosing a still, the
 * other is deciding whether the frame can take another layer.
 */
export function analyseFrame(
  cur: Uint8ClampedArray,
  prev: Uint8ClampedArray | null,
  w: number,
  h: number,
): FrameStats {
  if (w < 4 || h < 4 || cur.length < w * h * 4) return EMPTY_FRAME;

  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4096)));
  let sum = 0, sumSq = 0, sat = 0, grad = 0, clipped = 0, diff = 0, n = 0;

  for (let y = 0; y < h - step; y += step) {
    for (let x = 0; x < w - step; x += step) {
      const i = (y * w + x) * 4;
      const r = cur[i], g = cur[i + 1], b = cur[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += l;
      sumSq += l * l;

      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      if (l < 4 || l > 251) clipped++;

      const jr = (y * w + x + step) * 4;
      const jd = ((y + step) * w + x) * 4;
      const lr = 0.299 * cur[jr] + 0.587 * cur[jr + 1] + 0.114 * cur[jr + 2];
      const ld = 0.299 * cur[jd] + 0.587 * cur[jd + 1] + 0.114 * cur[jd + 2];
      grad += Math.abs(l - lr) + Math.abs(l - ld);

      if (prev && prev.length === cur.length) {
        const pl = 0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2];
        diff += Math.abs(l - pl);
      }
      n++;
    }
  }
  if (!n) return EMPTY_FRAME;

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const contrast = Math.min(1, Math.sqrt(variance) / 70);
  const detail = Math.min(1, (grad / n) / 44);
  const saturation = Math.min(1, (sat / n) / 0.55);
  const clipping = Math.min(1, (clipped / n) / 0.22);
  const motion = prev ? Math.min(1, (diff / n) / 34) : 0;

  /* Load is weighted toward detail and clipping because those are what actually
     stop reading as an image. High contrast alone is fine — striking, even —
     and heavy saturation is a house style here rather than a fault. */
  const load = Math.max(0, Math.min(1,
    detail * 0.42 + clipping * 0.34 + saturation * 0.16 + contrast * 0.08,
  ));

  return { contrast, detail, saturation, clipping, motion, load };
}

/* ── Journey structure ────────────────────────────────────────────────── */

/**
 * Where the set is, not where the track is.
 *
 * A journey that switches at a constant rate and a constant strength is just a
 * shuffle with extra steps. These four states give it an arc: it opens quietly,
 * accumulates, peaks, and clears out — and it moves between them from measured
 * energy against a slow baseline, so the arc follows the music rather than a
 * stopwatch.
 */
export type Section = "intro" | "build" | "peak" | "release";

export const SECTION_ORDER: Section[] = ["intro", "build", "peak", "release"];

export function nextSection(
  prev: Section,
  energy: number,
  baseline: number,
  heldMs: number,
): Section {
  const rel = energy - baseline;

  /* A real lift in energy always promotes, whatever the section clock says —
     missing the drop is the one failure the whole mode exists to avoid. The
     larger lift is tested first: checked the other way round, the softer rule
     returns `build` and the peak is unreachable by surge. */
  if (rel > 0.2 && energy > 0.42) return "peak";
  if (rel > 0.12 && energy > 0.3) return prev === "peak" ? "peak" : "build";

  // A sustained fall from a peak is a breakdown, and should look like one.
  if (prev === "peak" && rel < -0.06 && heldMs > 4000) return "release";
  if (prev === "release" && heldMs > 14_000) return energy > 0.2 ? "build" : "intro";

  if (prev === "intro" && heldMs > 16_000 && energy > 0.12) return "build";
  if (prev === "build" && heldMs > 22_000) return energy > 0.28 ? "peak" : "intro";
  if (prev === "peak" && heldMs > 26_000) return "release";
  return prev;
}

/** Musical bar length in ms, or null when there is no trustworthy tempo. */
export function barMs(f: AudioFeatures): number | null {
  if (f.bpm <= 0 || f.regularity < 0.25) return null;
  return (60_000 / f.bpm) * 4;
}

/**
 * The slice of MicAnalyzer a journey needs. Narrow on purpose: it makes the
 * directors testable with a plain object and independent of mic internals.
 *
 * Note what is absent — `level()`. That method is not a getter: it re-reads the
 * FFT, advances the envelope and steps the onset detector, so calling it here
 * would consume the very spectral jump the render loop needs to see a beat. A
 * director reads the smoothed fields the render loop has already refreshed, and
 * takes onsets by timestamp.
 */
export type JourneyMic = {
  enabled: boolean;
  bands: ArrayLike<number>;
  bassLevel: number;
  midLevel: number;
  trebleLevel: number;
  overallLevel: number;
  lastBeatAt: number;
};

/** Seconds of history the features are computed over. */
export const WINDOW_MS = 9_000;

/**
 * Rolling audio window shared by both directors.
 *
 * Owns the onset list and the level history, and turns them into features. Kept
 * as a small class rather than free functions because the state is genuinely
 * stateful — the whole measurement is "what has happened over the last nine
 * seconds" — and duplicating that bookkeeping is how the two directors would
 * start disagreeing about the same room.
 */
export class AudioWindow {
  private onsets: number[] = [];
  private levels: { at: number; v: number }[] = [];
  private lastSeenBeatAt = 0;

  clear() {
    this.onsets = [];
    this.levels = [];
    this.lastSeenBeatAt = 0;
  }

  /** Call once per sample. Safe with a null or disabled mic. */
  sample(mic: JourneyMic | null, now: number) {
    if (!mic || !mic.enabled) {
      // Push a zero rather than skipping: a silent room must be able to *become*
      // silent in the measurement, not merely stop updating.
      this.levels.push({ at: now, v: 0 });
    } else {
      this.levels.push({ at: now, v: mic.overallLevel });
      if (mic.lastBeatAt > this.lastSeenBeatAt) {
        this.lastSeenBeatAt = mic.lastBeatAt;
        this.onsets.push(mic.lastBeatAt);
      }
    }
    const cutoff = now - WINDOW_MS;
    while (this.levels.length && this.levels[0].at < cutoff) this.levels.shift();
    while (this.onsets.length && this.onsets[0] < cutoff) this.onsets.shift();
  }

  features(mic: JourneyMic | null, now: number): AudioFeatures {
    if (!mic || !mic.enabled || !this.levels.length) return SILENT_FEATURES;

    const vals = this.levels.map(l => l.v);
    const energy = vals.reduce((a, v) => a + v, 0) / vals.length;
    const varr = vals.reduce((a, v) => a + (v - energy) * (v - energy), 0) / vals.length;
    const dynamics = Math.min(1, Math.sqrt(varr) / 0.22);

    const span = Math.max(1, (now - this.levels[0].at) / 1000);
    const { bpm, regularity } = tempoFrom(this.onsets);

    const total = mic.bassLevel + mic.midLevel + mic.trebleLevel;

    return {
      bpm,
      regularity,
      density: this.onsets.length / span,
      brightness: centroidOf(mic.bands),
      weight: total > 1e-4 ? mic.bassLevel / total : 0.4,
      dynamics,
      energy,
    };
  }
}
