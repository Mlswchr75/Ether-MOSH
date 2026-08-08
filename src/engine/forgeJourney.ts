/**
 * Forge Journey — the sit-back mode for Pattern Forge.
 *
 * Takes its cues from the Smart director (mood → effect affinity) and the Storm
 * director (sustained stacks with a lifespan rather than a fixed tick), but
 * points both at Forge instead of a camera: the imagery it analyses is the
 * imagery it is itself producing, and the timing comes from the music rather
 * than from a slider.
 *
 * How the room is read and how the set is paced live in journeyCore, shared
 * with the visualiser's director. What is here is the half that is genuinely
 * Forge's: which families of effect suit a given reading, and how the tiling
 * constraint bounds the answer.
 */

import type { EffectCategory } from "./effects";
import {
  AudioWindow, EMPTY_FRAME, SILENT_FEATURES,
  analyseFrame, barMs, classifyStyle, nextSection,
  type AudioFeatures, type FrameStats, type JourneyMic, type MusicStyle,
  type Section, type StyleReading,
} from "./journeyCore";

/* Re-exported so existing importers keep one obvious place to reach for these.
   They are defined in journeyCore because the visualiser needs them too. */
export {
  AudioWindow, EMPTY_FRAME, SECTION_ORDER, SILENT_FEATURES,
  analyseFrame, barMs, centroidOf, classifyStyle, nextSection, tempoFrom,
} from "./journeyCore";
export type {
  AudioFeatures, FrameStats, JourneyMic, MusicStyle, Section, StyleReading,
} from "./journeyCore";

/* Per-style category bias. Weights multiply into the effect draw, so 0 does not
   exclude a category — it just makes it rare. Nothing is ever fully locked out,
   because a mode that can only ever produce one kind of image is the thing the
   user was already tired of. */
const STYLE_BIAS: Record<MusicStyle, Record<EffectCategory, number>> = {
  silence:   { atmosphere: 1.0, color: 0.6, geometry: 0.5, corruption: 0.15, dimension: 0.25 },
  ambient:   { atmosphere: 1.0, color: 0.7, geometry: 0.55, corruption: 0.2, dimension: 0.35 },
  downtempo: { atmosphere: 0.8, color: 0.9, geometry: 0.7, corruption: 0.35, dimension: 0.45 },
  hiphop:    { atmosphere: 0.4, color: 0.8, geometry: 0.6, corruption: 0.85, dimension: 0.65 },
  house:     { atmosphere: 0.5, color: 0.95, geometry: 1.0, corruption: 0.5, dimension: 0.6 },
  techno:    { atmosphere: 0.3, color: 0.5, geometry: 0.9, corruption: 1.0, dimension: 0.85 },
  breaks:    { atmosphere: 0.2, color: 0.6, geometry: 1.0, corruption: 1.0, dimension: 0.95 },
  band:      { atmosphere: 0.55, color: 0.85, geometry: 0.65, corruption: 0.7, dimension: 0.5 },
  noise:     { atmosphere: 0.15, color: 0.7, geometry: 0.75, corruption: 1.0, dimension: 0.9 },
};

/** Base strength per section, before energy and frame load adjust it. */
const SECTION_INTENSITY: Record<Section, number> = {
  intro: 0.3, build: 0.55, peak: 0.86, release: 0.4,
};

/** Bars to hold, per section. Fewer bars = faster cutting. */
const SECTION_BARS: Record<Section, number> = {
  intro: 8, build: 4, peak: 2, release: 8,
};

export type JourneyMove = {
  /** 0..1 — the "amount", fed straight to the composer. */
  intensity: number;
  /** How long to sit on this stack before judging again. */
  holdMs: number;
  /** Per-category draw weights. */
  bias: Record<EffectCategory, number>;
  /** Plain-language account of the decision, shown in the readout. */
  reason: string;
};

/**
 * Decide the next move.
 *
 * Pure so the whole judgement can be tested without a GPU, a microphone or a
 * clock — which matters, because "does it back off when the frame is already
 * full" is the behaviour most likely to regress silently.
 */
export function planMove(
  reading: StyleReading,
  f: AudioFeatures,
  frame: FrameStats,
  section: Section,
  rand: () => number = Math.random,
): JourneyMove {
  const bias = { ...STYLE_BIAS[reading.style] };

  /* Spectrum steers the bias inside a style. Bright, hat-led material wants
     colour and fine structure; sub-heavy material wants displacement you can
     feel. Applied as a nudge rather than a replacement so the style still reads
     as itself. */
  bias.color *= 0.75 + f.brightness * 0.6;
  bias.corruption *= 0.8 + f.weight * 0.55;
  bias.dimension *= 0.75 + f.weight * 0.5;
  bias.geometry *= 0.85 + f.density * 0.12;
  bias.atmosphere *= 1.25 - f.energy * 0.5;

  /* The feedback half. A frame already carrying a lot of ink gets a quieter
     stack, and a frame that has gone flat gets pushed. Without this the mode
     ratchets: every move adds, nothing ever subtracts, and twenty minutes in
     it is a grey smear. */
  const loadCut = frame.load * 0.45;
  const flatBoost = frame.load < 0.18 ? 0.18 : 0;

  let intensity = SECTION_INTENSITY[section]
    + f.energy * 0.22
    + flatBoost
    - loadCut;

  // A frame that is already clipping is past the point where more helps.
  if (frame.clipping > 0.5) intensity -= 0.15;
  // Keep a little spread so consecutive peaks aren't identical.
  intensity += (rand() - 0.5) * 0.12;
  intensity = Math.max(0.08, Math.min(1, intensity));

  /* Timing. With a trustworthy tempo, hold whole bars so switches land on the
     music instead of near it. Without one, fall back to seconds — and make the
     unpulsed styles slow, because cutting fast against a drone reads as a
     glitch rather than a decision. */
  const bar = barMs(f);
  let holdMs: number;
  if (bar) {
    const bars = SECTION_BARS[section];
    holdMs = bar * bars;
  } else {
    const slow = reading.style === "ambient" || reading.style === "silence";
    holdMs = (slow ? 11_000 : 6_000) * (section === "peak" ? 0.6 : 1)
      * (0.8 + rand() * 0.5);
  }
  // Bounds: under ~1.4s reads as strobing, over 40s reads as frozen.
  holdMs = Math.max(1400, Math.min(40_000, holdMs));

  const reason = [
    section,
    reading.label,
    bar ? `${SECTION_BARS[section]} bars` : `${(holdMs / 1000).toFixed(1)}s`,
    frame.load > 0.6 ? "easing off — frame is loaded"
      : frame.load < 0.18 ? "pushing — frame is thin"
        : `load ${Math.round(frame.load * 100)}%`,
  ].join(" · ");

  return { intensity, holdMs, bias, reason };
}

/* ── Driver ───────────────────────────────────────────────────────────── */

export type JourneyState = {
  features: AudioFeatures;
  reading: StyleReading;
  frame: FrameStats;
  section: Section;
  move: JourneyMove | null;
  /** Ms until the next judged switch, for the countdown in the readout. */
  nextInMs: number;
};

type JourneyOpts = {
  /** The canvas Forge is rendering into. May be null between mounts. */
  getCanvas: () => HTMLCanvasElement | null;
  /** The mic, or null when audio reactivity is off. */
  getMic: () => JourneyMic | null;
  /** Called each time the director decides on a new stack. */
  onMove: (move: JourneyMove, state: JourneyState) => void;
  /** Called every sample, for the readout. */
  onState?: (state: JourneyState) => void;
  sampleMs?: number;
  rand?: () => number;
};

export class ForgeJourney {
  private opts: Required<JourneyOpts>;
  private timer: number | null = null;
  private running = false;

  private probe: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D | null;
  private prevPixels: Uint8ClampedArray | null = null;

  private audio = new AudioWindow();
  private baseline = 0;

  private section: Section = "intro";
  private sectionSince = 0;
  private lastMoveAt = 0;
  private holdMs = 4000;
  private state: JourneyState;

  constructor(opts: JourneyOpts) {
    this.opts = {
      onState: () => {},
      sampleMs: 110,
      rand: Math.random,
      ...opts,
    } as Required<JourneyOpts>;

    this.probe = document.createElement("canvas");
    this.probe.width = 96;
    this.probe.height = 96;
    this.pctx = this.probe.getContext("2d", { willReadFrequently: true });

    this.state = {
      features: SILENT_FEATURES,
      reading: classifyStyle(SILENT_FEATURES),
      frame: EMPTY_FRAME,
      section: "intro",
      move: null,
      nextInMs: 0,
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.sectionSince = now;
    this.lastMoveAt = now;
    // Open with a move so engaging the mode visibly does something; waiting a
    // full bar first reads as the button not having worked.
    this.decide(true);
    this.timer = window.setInterval(() => this.tick(), this.opts.sampleMs);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.prevPixels = null;
    this.audio.clear();
  }

  getState(): JourneyState { return { ...this.state }; }

  private tick() {
    if (!this.running) return;
    const now = performance.now();

    const mic = this.opts.getMic();
    this.audio.sample(mic, now);
    this.sampleFrame();

    const features = this.audio.features(mic, now);
    const reading = classifyStyle(features);

    // Slow baseline for the section machine. Slower than the feature window so
    // a chorus reads as a lift rather than becoming the new normal.
    this.baseline = this.baseline * 0.985 + features.energy * 0.015;

    const heldSection = now - this.sectionSince;
    const section = nextSection(this.section, features.energy, this.baseline, heldSection);
    if (section !== this.section) {
      this.section = section;
      this.sectionSince = now;
    }

    this.state = {
      features,
      reading,
      frame: this.state.frame,
      section,
      move: this.state.move,
      nextInMs: Math.max(0, this.holdMs - (now - this.lastMoveAt)),
    };
    try { this.opts.onState(this.getState()); } catch { /* readout only */ }

    const held = now - this.lastMoveAt;
    /* A genuine surge cuts early — but only after a floor, or a noisy room
       turns the mode into a strobe. */
    const surge = features.energy - this.baseline > 0.18 && held > 1600;
    if (held >= this.holdMs || surge) this.decide(false);
  }

  private sampleFrame() {
    const canvas = this.opts.getCanvas();
    if (!canvas || !this.pctx || !canvas.width || !canvas.height) return;
    try {
      this.pctx.drawImage(canvas, 0, 0, this.probe.width, this.probe.height);
    } catch {
      // A tainted or zero-sized canvas: leave the last reading rather than
      // reporting a black frame the director would react to.
      return;
    }
    const data = this.pctx.getImageData(0, 0, this.probe.width, this.probe.height).data;
    const stats = analyseFrame(data, this.prevPixels, this.probe.width, this.probe.height);
    this.prevPixels = new Uint8ClampedArray(data);
    this.state = { ...this.state, frame: stats };
  }

  private decide(first: boolean) {
    const now = performance.now();
    const move = planMove(
      this.state.reading,
      this.state.features,
      this.state.frame,
      this.section,
      this.opts.rand,
    );
    // The opening move lands before any audio has been heard, so hold it
    // briefly and re-judge rather than committing to a silence-derived plan.
    this.holdMs = first ? Math.min(move.holdMs, 2600) : move.holdMs;
    this.lastMoveAt = now;
    this.state = { ...this.state, move, nextInMs: this.holdMs };
    try { this.opts.onMove(move, this.getState()); } catch { /* caller's problem */ }
  }
}
