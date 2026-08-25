/**
 * Journey — the visualiser's combined director.
 *
 * WHAT STORM WAS ACTUALLY DOING
 *
 * Storm's effect stack was never cycling fast. `rollNewEffects` picks ids and
 * holds them for 5–60 seconds, and that part worked exactly as written. What
 * cycled at 12.5Hz was everything else: `tick` called `onStorm` every 80ms, and
 * `moshStorm` unconditionally re-seeded, re-sampled *every parameter* across 90%
 * of its range, re-rolled every blend mode out of EXOTIC_BLENDS, and re-rolled
 * every opacity. The identity of the stack was stable; its entire configuration
 * was being thrown twelve times a second.
 *
 * That is why it looked so good, and it is worth being precise about why,
 * because it is not what anyone would have designed on purpose. A stable set of
 * effects reads as coherent — the eye finds structure and holds it. Violently
 * re-rolled parameters on top of that structure read as alive. Switching
 * *effects* fast just looks like channel-hopping; switching *parameters* fast
 * under a fixed structure looks like the image is being physically mauled. The
 * second is far better and it happened by accident.
 *
 * So this director keeps it, deliberately, as a disruption rather than as the
 * permanent state — and gives it a violence dial and a duration instead of
 * leaving it pinned at maximum forever.
 *
 * TWO CLOCKS
 *
 * A single interval is what made every previous mode feel mechanical. This runs
 * two, and they are answering different questions:
 *
 *   COMPOSITION — "what is on screen". Slow, unpredictable, bar-quantised when
 *     there is a tempo to quantise to. This is Smart's job, and Smart's ranking
 *     does it.
 *   DISRUPTION  — "has anything changed lately". Fast, and bounded: it is
 *     guaranteed to fire inside 10 seconds, every time, so no arrangement is
 *     ever left sitting untouched. This is Storm's job, made deliberate.
 *
 * Because the disruption clock is a hard ceiling rather than a target, a long
 * composition hold is safe: the frame keeps moving even when the arrangement
 * does not.
 */

import { composeFromMood, type Mood } from "./smartDirector";
import { MotionTracker } from "./stormDirector";
import type { DirectedLayer } from "./compose";
import {
  AudioWindow, EMPTY_FRAME, SILENT_FEATURES,
  analyseFrame, barMs, classifyStyle, nextSection,
  type AudioFeatures, type FrameStats, type JourneyMic,
  type Section, type StyleReading,
} from "./journeyCore";

/* ── Timing ───────────────────────────────────────────────────────────── */

/**
 * The guarantee: nothing sits untouched longer than this.
 *
 * Expressed as a ceiling the draw cannot exceed rather than as an average,
 * because an average would let the occasional 14-second gap through — and one
 * long dead stretch is what makes a mode feel broken, however good the median
 * is.
 */
export const DISRUPT_CEILING_MS = 10_000;
/** Below this a disruption reads as a strobe rather than as an event. */
export const DISRUPT_FLOOR_MS = 2_200;

/** Per-section disruption pacing, before the jitter. */
const DISRUPT_BASE: Record<Section, number> = {
  intro: 7_500, build: 5_200, peak: 3_200, release: 6_500,
};

/**
 * When the next disruption lands.
 *
 * Deliberately noisy. A disruption arriving on a predictable beat stops being a
 * disruption within about a minute — the eye learns the period and starts
 * waiting for it, which is the exact opposite of the intent.
 */
export function nextDisruptionMs(
  section: Section,
  f: AudioFeatures,
  rand: () => number = Math.random,
): number {
  // Busier music earns more frequent interference; a sparse room does not.
  const busy = Math.min(1, f.density / 3 + f.energy * 0.5);
  const base = DISRUPT_BASE[section] * (1 - busy * 0.35);
  // Wide multiplicative jitter, so the gaps are genuinely irregular rather than
  // base ± a few percent.
  const jitter = 0.55 + rand() * 0.95;
  return Math.max(DISRUPT_FLOOR_MS, Math.min(DISRUPT_CEILING_MS, base * jitter));
}

/**
 * When the next full composition change lands.
 *
 * Trimodal rather than uniform: most holds sit around the section's natural
 * length, but a fifth are cut short and a fifth run long. Uniform jitter around
 * a mean produces a suspiciously even rhythm; the fat tails are what make it
 * feel like someone is deciding rather than counting.
 */
export function nextHoldMs(
  section: Section,
  f: AudioFeatures,
  rand: () => number = Math.random,
): number {
  const bar = barMs(f);
  const roll = rand();
  const shape = roll < 0.2 ? 0.45 : roll < 0.8 ? 1 : 1.9;

  if (bar) {
    /* Whole bars, so a change lands *on* the music rather than near it. Phrases
       are powers of two for the same reason a DJ counts in eights. */
    const bars = section === "peak" ? 4 : section === "build" ? 8 : 16;
    const scaled = Math.max(1, Math.round(bars * shape));
    return Math.max(2_000, Math.min(60_000, bar * scaled));
  }

  const slowStyle = f.density < 0.7;
  const base = (slowStyle ? 16_000 : 10_000) * (section === "peak" ? 0.6 : 1);
  return Math.max(2_000, Math.min(60_000, base * shape * (0.8 + rand() * 0.4)));
}

/* ── Disruptions ──────────────────────────────────────────────────────── */

export type DisruptionKind =
  /** Re-roll every parameter once. Storm's signature move, fired deliberately. */
  | "churn"
  /** A short burst of rapid churn — full Storm, for a second or so. */
  | "surge"
  /** Flip the blend modes on the accent layers. Cheap, and reads as a cut. */
  | "blend"
  /** Replace exactly one layer, keeping the rest of the arrangement. */
  | "swap"
  /** Re-mask the accents, so the same effects occupy different real estate. */
  | "region";

export type Disruption = {
  kind: DisruptionKind;
  /** 0..1 — how far parameters are thrown. */
  violence: number;
  /** For `surge`, how long the burst runs. */
  burstMs: number;
  reason: string;
};

/**
 * Choose a disruption.
 *
 * Weighted by section and by what the frame can currently take: a frame already
 * clipping does not want a violent churn, it wants a swap or a re-mask, which
 * change the image without adding to it. This is the same load-budget reasoning
 * the Forge director uses, applied to alterations rather than to whole stacks.
 */
export function pickDisruption(
  section: Section,
  frame: FrameStats,
  f: AudioFeatures,
  rand: () => number = Math.random,
): Disruption {
  const loaded = frame.load > 0.62;
  const hot = section === "peak" || section === "build";

  const weights: Record<DisruptionKind, number> = {
    churn: loaded ? 0.5 : 1.6,
    // The full Storm burst is a punctuation mark. Rationed hard: constant surge
    // is exactly the state that made the old mode unreadable.
    surge: hot && !loaded ? 0.55 : 0.12,
    blend: 0.7,
    swap: loaded ? 1.3 : 0.8,
    region: loaded ? 1.1 : 0.6,
  };

  let total = 0;
  for (const w of Object.values(weights)) total += w;
  let r = rand() * total;
  let kind: DisruptionKind = "churn";
  for (const [k, w] of Object.entries(weights) as [DisruptionKind, number][]) {
    r -= w;
    if (r <= 0) { kind = k; break; }
  }

  /* Violence tracks the music and backs off a loaded frame. The floor is
     non-zero on purpose: a disruption you cannot see did not happen, and the
     whole guarantee is about the frame visibly changing. */
  const violence = Math.max(0.18, Math.min(1,
    (hot ? 0.6 : 0.38)
    + f.energy * 0.3
    + (rand() - 0.5) * 0.25
    - (loaded ? 0.22 : 0),
  ));

  const burstMs = kind === "surge" ? 380 + rand() * 900 : 0;

  const reason = [
    kind,
    `violence ${Math.round(violence * 100)}%`,
    loaded ? "frame loaded" : `load ${Math.round(frame.load * 100)}%`,
  ].join(" · ");

  return { kind, violence, burstMs, reason };
}

/** How often churn is re-applied inside a surge — Storm's original 12.5Hz. */
export const SURGE_TICK_MS = 80;

/* ── Mood ─────────────────────────────────────────────────────────────── */

/**
 * Build Smart's mood from the journey's own measurements.
 *
 * Smart reads `window.__aegisAudioSources`, which only exists once the
 * visualiser's audio graph is up. The journey has its own window over the same
 * mic, so it fills the mood directly rather than depending on a global that may
 * not be there yet.
 */
export function moodFrom(
  f: AudioFeatures,
  frame: FrameStats,
  motion: number,
  motionAvg: number,
): Mood {
  return {
    motion,
    motionAvg,
    // Same definition Smart uses: movement well above its own baseline.
    sceneChange: Math.max(0, motion - motionAvg * 1.8 - 0.08),
    brightness: frame.contrast > 0 || frame.saturation > 0
      ? Math.max(0, Math.min(1, 0.5 + (frame.contrast - 0.5) * 0.4))
      : 0.5,
    colorfulness: frame.saturation,
    bass: f.weight * f.energy * 1.6,
    treble: f.brightness * f.energy * 1.6,
    energy: f.energy,
    centroid: f.brightness,
    beatPulse: Math.min(1, f.density / 4),
    loud: f.energy,
  };
}

/* ── Driver ───────────────────────────────────────────────────────────── */

export type JourneyDirectorState = {
  features: AudioFeatures;
  reading: StyleReading;
  frame: FrameStats;
  section: Section;
  motion: number;
  lastDisruption: Disruption | null;
  /** Ms until the next composition change. */
  nextComposeMs: number;
  /** Ms until the next guaranteed alteration. */
  nextDisruptMs: number;
};

type Opts = {
  getVideo: () => HTMLVideoElement | null;
  getMic: () => JourneyMic | null;
  /** Forge is an ambient wall; the ordinary visualiser is an active performance.
   * Performance keeps compositions and alterations moving much more often. */
  pace?: "ambient" | "performance" | "forge";
  /** Full arrangement change. */
  onCompose: (layers: DirectedLayer[], state: JourneyDirectorState) => void;
  /** Alteration of the existing arrangement. */
  onDisrupt: (d: Disruption, state: JourneyDirectorState) => void;
  onState?: (state: JourneyDirectorState) => void;
  sampleMs?: number;
  rand?: () => number;
};

/** Compress an ambient director interval into an irregular performance interval.
 * The floors prevent a blur of un-readable cuts; the caps keep a regular
 * visualiser from parking on one idea while the Art Director has the wheel. */
export function performanceInterval(
  ms: number,
  kind: "compose" | "disrupt",
  rand: () => number = Math.random,
): number {
  const multiplier = kind === "compose"
    ? 0.32 + rand() * 0.24
    : 0.44 + rand() * 0.22;
  const [floor, ceiling] = kind === "compose" ? [1_600, 10_000] : [1_200, 6_500];
  return Math.max(floor, Math.min(ceiling, ms * multiplier));
}

/** Keep Forge Journey evolving as a visual wall without letting one complete
 * stack own the screen for ten seconds. DIRECTED_FADE_MS finishes the handoff
 * after this interval, so the 8.5s ceiling leaves room for that crossfade. */
export function forgeInterval(
  ms: number,
  kind: "compose" | "disrupt",
  rand: () => number = Math.random,
): number {
  const multiplier = kind === "compose"
    ? 0.28 + rand() * 0.18
    : 0.38 + rand() * 0.18;
  const [floor, ceiling] = kind === "compose" ? [3_800, 8_500] : [1_800, 5_500];
  return Math.max(floor, Math.min(ceiling, ms * multiplier));
}

export class JourneyDirector {
  private opts: Required<Opts>;
  private timer: number | null = null;
  private surgeTimer: number | null = null;
  private running = false;

  private tracker = new MotionTracker();
  private audio = new AudioWindow();

  private probe: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D | null;
  private prevPixels: Uint8ClampedArray | null = null;

  private motion = 0;
  private motionAvg = 0;
  private baseline = 0;

  private section: Section = "intro";
  private sectionSince = 0;

  /** Composition memory — without it, a long run can drift back to a
   *  near-identical arrangement just because it still suits the mood best.
   *  Structural (load-bearing) ids get the strongest, most-recent-weighted
   *  penalty since that's what actually defines a composition's identity;
   *  everything else gets a lighter flat one. Reset on stop() so a fresh
   *  engagement isn't biased by an unrelated earlier run. */
  private recentStructural: string[] = [];
  private recentAccent: string[] = [];

  private lastComposeAt = 0;
  private holdMs = 6_000;
  private lastDisruptAt = 0;
  private disruptInMs = 4_000;

  private state: JourneyDirectorState;

  constructor(opts: Opts) {
    this.opts = {
      onState: () => {},
      sampleMs: 110,
      rand: Math.random,
      pace: "ambient",
      ...opts,
    } as Required<Opts>;

    this.probe = document.createElement("canvas");
    this.probe.width = 96;
    this.probe.height = 96;
    this.pctx = this.probe.getContext("2d", { willReadFrequently: true });

    this.state = this.initialState();
  }

  private initialState(): JourneyDirectorState {
    return {
      features: SILENT_FEATURES,
      reading: classifyStyle(SILENT_FEATURES),
      frame: EMPTY_FRAME,
      section: "intro",
      motion: 0,
      lastDisruption: null,
      nextComposeMs: 0,
      nextDisruptMs: 0,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.sectionSince = now;
    this.lastComposeAt = now;
    this.lastDisruptAt = now;
    // Open with an arrangement so engaging the mode visibly does something.
    this.compose(true);
    this.timer = window.setInterval(() => this.tick(), this.opts.sampleMs);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.surgeTimer !== null) window.clearInterval(this.surgeTimer);
    this.timer = null;
    this.surgeTimer = null;
    this.tracker.reset();
    this.audio.clear();
    this.prevPixels = null;
    this.recentStructural = [];
    this.recentAccent = [];
    // Without this, a stop→start cycle could briefly surface stale state
    // (e.g. the last disruption reason) via getState()/onState() before the
    // next tick overwrites it.
    this.section = "intro";
    this.state = this.initialState();
  }

  /** Id → score multiplier (0..1) fed to composeFromMood so a recently-used
   *  effect has to earn its way back in rather than simply winning again. */
  private recentPenalty(): Map<string, number> {
    const penalty = new Map<string, number>();
    this.recentStructural.forEach((id, i) => {
      const mult = Math.min(1, 0.12 + i * 0.18); // most recent: 0.12, decaying outward
      if (!penalty.has(id) || mult < (penalty.get(id) as number)) penalty.set(id, mult);
    });
    for (const id of this.recentAccent) if (!penalty.has(id)) penalty.set(id, 0.65);
    return penalty;
  }

  private rememberComposition(layers: DirectedLayer[]) {
    const structural = layers.find(l => l.role === "structural")?.effectId;
    if (structural) {
      this.recentStructural = [structural, ...this.recentStructural.filter(id => id !== structural)].slice(0, 5);
    }
    const others = layers.filter(l => l.role !== "structural").map(l => l.effectId);
    this.recentAccent = [...others, ...this.recentAccent].slice(0, 10);
  }

  getState(): JourneyDirectorState { return { ...this.state }; }

  private tick() {
    if (!this.running) return;
    const now = performance.now();

    const mic = this.opts.getMic();
    this.audio.sample(mic, now);
    const features = this.audio.features(mic, now);
    const reading = classifyStyle(features);

    this.tracker.sample(this.opts.getVideo());
    this.motion = this.tracker.overall();
    this.motionAvg = this.motionAvg * 0.92 + this.motion * 0.08;
    this.sampleFrame();

    this.baseline = this.baseline * 0.985 + features.energy * 0.015;

    const section = nextSection(
      this.section, features.energy, this.baseline, now - this.sectionSince,
    );
    if (section !== this.section) {
      this.section = section;
      this.sectionSince = now;
    }

    this.state = {
      ...this.state,
      features, reading, section,
      motion: this.motion,
      nextComposeMs: Math.max(0, this.holdMs - (now - this.lastComposeAt)),
      nextDisruptMs: Math.max(0, this.disruptInMs - (now - this.lastDisruptAt)),
    };
    try { this.opts.onState(this.getState()); } catch { /* readout only */ }

    /* Composition first. A composition change *is* an alteration, so it resets
       the disruption clock — otherwise a fresh arrangement would be churned a
       moment after appearing, and never get seen. */
    if (now - this.lastComposeAt >= this.holdMs) {
      this.compose(false);
      return;
    }
    if (now - this.lastDisruptAt >= this.disruptInMs) this.disrupt(now);
  }

  private sampleFrame() {
    const video = this.opts.getVideo();
    if (!video || !this.pctx || !video.videoWidth || video.readyState < 2) return;
    try {
      this.pctx.drawImage(video, 0, 0, this.probe.width, this.probe.height);
    } catch {
      return; // tainted source — keep the last reading rather than reporting black
    }
    const data = this.pctx.getImageData(0, 0, this.probe.width, this.probe.height).data;
    this.state = {
      ...this.state,
      frame: analyseFrame(data, this.prevPixels, this.probe.width, this.probe.height),
    };
    this.prevPixels = new Uint8ClampedArray(data);
  }

  private compose(first: boolean) {
    const now = performance.now();
    const { features, frame } = this.state;
    const mood = moodFrom(features, frame, this.motion, this.motionAvg);

    /* The frame's load caps how hard the new arrangement pushes — the same
       feedback that stops a long run collapsing into a smear. */
    const layers = composeFromMood(
      mood,
      this.opts.rand,
      Math.max(0.1, Math.min(1, Math.max(mood.motion, mood.bass, features.energy) - frame.load * 0.35)),
      this.recentPenalty(),
    );
    this.rememberComposition(layers);

    this.lastComposeAt = now;
    // Hold the opening arrangement briefly: it is chosen before any audio has
    // been heard, so committing to a full silence-derived hold reads as a stall.
    const ambientHold = first
      ? 3_200
      : nextHoldMs(this.section, features, this.opts.rand);
    this.holdMs = first
      ? ambientHold
      : this.opts.pace === "forge"
        ? forgeInterval(ambientHold, "compose", this.opts.rand)
        : this.opts.pace === "performance"
          ? performanceInterval(ambientHold, "compose", this.opts.rand)
          : ambientHold;
    this.lastDisruptAt = now;
    const ambientDisruption = nextDisruptionMs(this.section, features, this.opts.rand);
    this.disruptInMs = this.opts.pace === "forge"
      ? forgeInterval(ambientDisruption, "disrupt", this.opts.rand)
      : this.opts.pace === "performance"
        ? performanceInterval(ambientDisruption, "disrupt", this.opts.rand)
        : ambientDisruption;

    this.state = {
      ...this.state,
      nextComposeMs: this.holdMs,
      nextDisruptMs: this.disruptInMs,
    };
    if (layers.length) {
      try { this.opts.onCompose(layers, this.getState()); } catch { /* caller's */ }
    }
  }

  private disrupt(now: number) {
    const d = pickDisruption(this.section, this.state.frame, this.state.features, this.opts.rand);
    this.lastDisruptAt = now;
    const ambientDisruption = nextDisruptionMs(this.section, this.state.features, this.opts.rand);
    this.disruptInMs = this.opts.pace === "forge"
      ? forgeInterval(ambientDisruption, "disrupt", this.opts.rand)
      : this.opts.pace === "performance"
        ? performanceInterval(ambientDisruption, "disrupt", this.opts.rand)
        : ambientDisruption;
    this.state = { ...this.state, lastDisruption: d, nextDisruptMs: this.disruptInMs };
    try { this.opts.onDisrupt(d, this.getState()); } catch { /* caller's */ }

    if (d.kind === "surge") this.runSurge(d);
  }

  /**
   * The Storm burst.
   *
   * Re-emits churn at Storm's original 12.5Hz for the burst's duration. This is
   * the accidental behaviour that looked so good, kept on purpose — but bounded
   * to about a second instead of running forever, and at a violence the director
   * chose rather than pinned at 90% of every parameter's range.
   */
  private runSurge(d: Disruption) {
    if (this.surgeTimer !== null) window.clearInterval(this.surgeTimer);
    const until = performance.now() + d.burstMs;
    this.surgeTimer = window.setInterval(() => {
      if (!this.running || performance.now() >= until) {
        if (this.surgeTimer !== null) window.clearInterval(this.surgeTimer);
        this.surgeTimer = null;
        return;
      }
      try {
        this.opts.onDisrupt(
          { kind: "churn", violence: d.violence, burstMs: 0, reason: "surge" },
          this.getState(),
        );
      } catch { /* caller's */ }
    }, SURGE_TICK_MS);
  }
}
