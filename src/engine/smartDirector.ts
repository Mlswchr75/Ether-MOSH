// Smart AI Director — offline, token-free.
//
// Continuously samples the live camera frame + audio bands and picks a mosh
// stack that fits the current "mood" (motion, brightness, colorfulness, bass,
// treble). Snaps to a new mosh on sudden scene changes; otherwise transitions
// on musical energy in a smooth, spaced rhythm.
//
// All heuristics, no LLM, no network. Designed to be cheap: ~10Hz sampler on
// a 64×36 offscreen canvas.
//
// Superseded: the live app no longer instantiates SmartDirector directly —
// JourneyDirector (journeyDirector.ts) now runs this judgement on its own
// slow clock combined with Storm's interference on a fast one (see the
// comment above Editor.tsx's Journey director section). Nothing imports this
// file today.

import { EFFECTS } from "./effects";
import { composeStack, type DirectedLayer } from "./compose";

export type Mood = {
  motion: number;       // 0..1 short-term frame diff
  motionAvg: number;    // 0..1 EMA baseline
  sceneChange: number;  // 0..1 spike above baseline
  brightness: number;   // 0..1
  colorfulness: number; // 0..1
  bass: number;         // 0..1
  treble: number;       // 0..1
  energy: number;       // 0..1
  centroid: number;     // 0..1 spectral centroid
  beatPulse: number;    // 0..1 recent beat energy
  loud: number;         // 0..1 overall audio activity
};

const emptyMood = (): Mood => ({
  motion: 0, motionAvg: 0, sceneChange: 0,
  brightness: 0.5, colorfulness: 0.3,
  bass: 0, treble: 0, energy: 0, centroid: 0.4,
  beatPulse: 0, loud: 0,
});

// Effect mood affinities. Values 0..1 are additive weights; the director sums
// them per axis and normalises. Only ids that exist in EFFECTS are honoured.
type Affinity = {
  bass?: number; treble?: number; motion?: number; calm?: number;
  bright?: number; dark?: number; colorful?: number; mono?: number;
  chaotic?: number;
};
const AFFINITY: Record<string, Affinity> = {
  // corruption — bass / chaos
  datamosh:         { bass: 1.0, chaotic: 0.9, motion: 0.4 },
  blockShift:       { bass: 0.9, chaotic: 0.8 },
  compressionTears: { bass: 0.7, chaotic: 0.6 },
  glitchTeleport:   { bass: 0.9, chaotic: 1.0 },
  hexShatter:       { bass: 0.7, chaotic: 0.7, motion: 0.4 },
  pixelExplode:     { bass: 0.6, motion: 0.9, chaotic: 0.7 },
  bitCrush:         { chaotic: 0.6, mono: 0.4 },
  scanBreak:        { chaotic: 0.6, treble: 0.4 },
  scanlineWarp:     { chaotic: 0.5, motion: 0.4 },
  jitter:           { treble: 0.7, motion: 0.5 },
  pixelSort:        { bass: 0.5, motion: 0.5 },
  sliceDrift:       { motion: 0.6, chaotic: 0.4 },
  bufferEcho:       { motion: 0.7, calm: 0.2 },
  asciiCollapse:    { chaotic: 0.5, mono: 0.6 },

  // color
  rgbShift:      { treble: 0.7, colorful: 0.5 },
  hueRotate:     { colorful: 0.9 },
  solarize:      { bright: 0.6, colorful: 0.5 },
  rainbowMap:    { colorful: 1.0, treble: 0.4 },
  vhsBleed:      { colorful: 0.4, calm: 0.3 },
  scanlines:     { calm: 0.4, mono: 0.3 },
  posterize:     { mono: 0.5 },
  thermal:       { dark: 0.7, colorful: 0.6 },
  duotone:       { mono: 0.6, colorful: 0.4 },
  noiseTint:     { treble: 0.4 },
  chromaPulse:   { treble: 0.9, colorful: 0.7, motion: 0.4 },
  oilSlick:      { colorful: 0.8, calm: 0.4 },
  infraredDream: { dark: 0.6, colorful: 0.7 },
  colorQuake:    { chaotic: 0.9, colorful: 0.6, bass: 0.5 },
  paletteDither: { mono: 0.6, colorful: 0.4 },
  voltage:       { treble: 0.9, dark: 0.6 },

  // geometry — motion
  melt:            { motion: 0.5, calm: 0.4 },
  liquidWarp:      { motion: 0.9, calm: 0.3 },
  ripple:          { motion: 0.6 },
  kaleidoscope:    { motion: 0.6, colorful: 0.5, chaotic: 0.4 },
  mirror:          { motion: 0.3 },
  lensWarp:        { motion: 0.5 },
  twirl:           { motion: 1.0, chaotic: 0.5 },
  fractalZoom:     { motion: 0.8, chaotic: 0.4 },
  polarFold:       { motion: 0.7, chaotic: 0.5 },
  displacement:    { motion: 0.9 },
  pageCurl:        { motion: 0.7, chaotic: 0.5 },
  crystalize:      { motion: 0.5, chaotic: 0.5 },
  zoomBlur:        { motion: 1.0 },
  perspectiveTilt: { motion: 0.6 },

  // atmosphere — calm / dreamy
  filmGrain:  { calm: 0.4, mono: 0.4 },
  staticSnow: { chaotic: 0.4, mono: 0.5, dark: 0.4 },
  fog:        { calm: 0.9, dark: 0.4 },
  lightLeak:  { calm: 0.5, bright: 0.7, colorful: 0.4 },
  holoShine:  { treble: 0.7, colorful: 0.7, bright: 0.5 },
  godRays:    { bright: 0.9, calm: 0.7 },
  auroraVeil: { calm: 0.7, colorful: 0.8 },
  dustMotes:  { calm: 1.0, bright: 0.4 },
  dreamGlow:  { calm: 0.9, bright: 0.7 },
  vignette:   { calm: 0.4, dark: 0.5 },
  plasmaField:{ colorful: 0.7, treble: 0.5, chaotic: 0.4 },
  scanFreeze: { calm: 0.6, dark: 0.5, mono: 0.4 },

  // dimension — structural. Weighted toward motion because the depth proxy is
  // itself motion-derived: a still subject has a soft, unreliable mask, and
  // these effects are only convincing once there is real separation to exploit.
  depthShear:      { motion: 1.0, bass: 0.5 },
  dimensionSplit:  { motion: 0.8, bass: 0.9, chaotic: 0.8 },
  timeShatter:     { motion: 0.9, chaotic: 1.0, treble: 0.5 },
  parallaxExplode: { motion: 1.0, bass: 0.8, chaotic: 0.6 },
  depthEcho:       { motion: 0.9, calm: 0.4 },
  strataSlice:     { motion: 0.7, chaotic: 0.7, treble: 0.6 },
  chronoBleed:     { motion: 0.8, colorful: 0.7, treble: 0.6 },
  volumetricPull:  { motion: 0.8, bass: 0.7, calm: 0.3 },
};

const KNOWN_IDS = new Set(EFFECTS.map(e => e.id));
for (const id of Object.keys(AFFINITY)) if (!KNOWN_IDS.has(id)) delete AFFINITY[id];

type DirectorOpts = {
  /** Called when the director wants to switch to a new stack. Receives a fully
   *  composed stack — opacity, blend and region are decided here, not by the
   *  store, because they are compositional choices rather than defaults. */
  onMosh: (layers: DirectedLayer[]) => void;
  /** Overlay hook — called with a 0..1 "confidence" spike each time it switches. */
  onSwitchFlash?: (mood: Mood) => void;
  /** Returns the current live video element (may be null). */
  getVideo: () => HTMLVideoElement | null;
  /** Minimum ms between switches unless a hard scene-change is detected. */
  minGapMs?: number;
  /** Ms between mood samples. */
  sampleMs?: number;
};

export class SmartDirector {
  private opts: Required<DirectorOpts>;
  private raf: number | null = null;
  private lastSample = 0;
  private lastSwitch = 0;
  private prevFrame: Uint8ClampedArray | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private mood: Mood = emptyMood();
  private beatCount = 0;
  private beatListener: (() => void) | null = null;
  private running = false;
  private startTimeout: number | null = null;

  constructor(opts: DirectorOpts) {
    this.opts = {
      onSwitchFlash: () => {},
      minGapMs: 3200,
      sampleMs: 110,
      ...opts,
    } as Required<DirectorOpts>;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 64;
    this.canvas.height = 36;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastSwitch = performance.now();
    this.beatListener = () => { this.beatCount += 1; };
    window.addEventListener("aegis:beat", this.beatListener);
    // Kick off an immediate first pick so users see it engage instantly.
    this.startTimeout = window.setTimeout(() => {
      this.startTimeout = null;
      this.pickAndSwitch(1);
    }, 120);
    const loop = () => {
      if (!this.running) return;
      this.tick();
      this.raf = window.requestAnimationFrame(loop);
    };
    this.raf = window.requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.startTimeout !== null) clearTimeout(this.startTimeout);
    this.startTimeout = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.beatListener) window.removeEventListener("aegis:beat", this.beatListener);
    this.beatListener = null;
    this.prevFrame = null;
  }

  getMood(): Mood { return { ...this.mood }; }

  private tick() {
    const now = performance.now();
    if (now - this.lastSample < this.opts.sampleMs) return;
    this.lastSample = now;

    this.sampleFrame();
    this.readAudio();

    // Decision: switch when
    //  1. hard scene change AND we've been on this stack >800ms, OR
    //  2. gentle: min gap passed AND (beat count >= target OR mood drifted).
    const gap = now - this.lastSwitch;
    const hardCut = this.mood.sceneChange > 0.55 && gap > 800;
    const tempoTarget = 6 + Math.round((1 - this.mood.energy) * 6); // 6..12 beats
    const beatSwitch = this.beatCount >= tempoTarget && gap > this.opts.minGapMs;
    const idleSwitch = gap > this.opts.minGapMs + 4500; // fallback for silence

    if (hardCut || beatSwitch || idleSwitch) {
      this.pickAndSwitch(hardCut ? 1 : 0.6);
      this.lastSwitch = now;
      this.beatCount = 0;
    }
  }

  private sampleFrame() {
    const video = this.opts.getVideo();
    if (!video || !this.ctx) return;
    if (!video.videoWidth || video.readyState < 2) return;

    try {
      this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
    } catch { return; }

    const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const cur = img.data;
    const N = cur.length / 4;

    let sumL = 0, sumS = 0, diff = 0;
    for (let i = 0; i < cur.length; i += 4) {
      const r = cur[i], g = cur[i + 1], b = cur[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) * 0.5;
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      sumL += l;
      sumS += sat;
      if (this.prevFrame) {
        // luma-only diff, weighted so we don't spike on tiny sensor noise.
        const pl = (Math.max(this.prevFrame[i], this.prevFrame[i + 1], this.prevFrame[i + 2])
                  + Math.min(this.prevFrame[i], this.prevFrame[i + 1], this.prevFrame[i + 2])) * 0.5;
        diff += Math.abs(l - pl);
      }
    }
    const bright = (sumL / N) / 255;
    const colorful = sumS / N;
    const motion = this.prevFrame ? Math.min(1, (diff / N) / 40) : 0;
    this.prevFrame = new Uint8ClampedArray(cur);

    const m = this.mood;
    m.brightness = m.brightness * 0.85 + bright * 0.15;
    m.colorfulness = m.colorfulness * 0.85 + colorful * 0.15;
    // slow baseline for scene-change detection
    m.motionAvg = m.motionAvg * 0.92 + motion * 0.08;
    m.motion = motion;
    m.sceneChange = Math.max(0, motion - m.motionAvg * 1.8 - 0.08);
  }

  private readAudio() {
    const s = (window as any).__aegisAudioSources as Record<string, number> | undefined;
    const m = this.mood;
    if (s) {
      const bass = Math.max(s.kick ?? 0, s.sub ?? 0, s.bass ?? 0);
      const treble = Math.max(s.presence ?? 0, s.treble ?? 0, s.highMid ?? 0);
      m.bass = m.bass * 0.7 + bass * 0.3;
      m.treble = m.treble * 0.7 + treble * 0.3;
      m.energy = m.energy * 0.85 + (s.energy ?? s.overall ?? 0) * 0.15;
      m.centroid = m.centroid * 0.9 + (s.centroid ?? 0.4) * 0.1;
      m.beatPulse = s.beat ?? 0;
      m.loud = Math.max(m.energy, bass, treble);
    } else {
      m.bass *= 0.9; m.treble *= 0.9; m.energy *= 0.9; m.beatPulse *= 0.7; m.loud *= 0.9;
    }
  }

  private pickAndSwitch(confidence: number) {
    const layers = this.pickEffects();
    if (!layers.length) return;
    try { this.opts.onMosh(layers); } catch {}
    try { this.opts.onSwitchFlash({ ...this.mood, sceneChange: Math.max(this.mood.sceneChange, confidence) }); } catch {}
  }

  private pickEffects(): DirectedLayer[] {
    return composeFromMood(this.mood, Math.random);
  }
}

/**
 * Rank every effect against a mood.
 *
 * Exported so the Journey director can borrow the judgement without inheriting
 * this class's timing — combining the two modes means sharing what each is
 * actually good at, and what Smart is good at is deciding *what suits the
 * moment*. Duplicating this table into a second director is how the two would
 * start disagreeing about the same room.
 */
export function rankEffects(m: Mood): { id: string; score: number }[] {
  {
    // Convert mood to axis weights (0..1).
    const w = {
      bass:     clip01(m.bass * 0.85 + (m.energy * 0.15)),
      treble:   clip01(m.treble * 0.9 + m.centroid * 0.2),
      motion:   clip01(m.motion * 0.5 + m.motionAvg * 0.4 + m.sceneChange * 0.5),
      calm:     clip01(1 - Math.max(m.motion, m.bass, m.energy)),
      bright:   clip01(m.brightness),
      dark:     clip01(1 - m.brightness),
      colorful: clip01(m.colorfulness * 1.2),
      mono:     clip01(1 - m.colorfulness * 1.5),
      chaotic:  clip01(Math.max(m.sceneChange * 1.5, m.bass * 0.6, m.motion * 0.5)),
    };

    // Score every effect.
    type Scored = { id: string; score: number };
    const scored: Scored[] = [];
    for (const [id, a] of Object.entries(AFFINITY)) {
      let s = 0.15; // small baseline so nothing is fully excluded
      let denom = 0.15;
      for (const [k, v] of Object.entries(a)) {
        const weight = (w as any)[k] ?? 0;
        s += weight * (v as number);
        denom += (v as number);
      }
      scored.push({ id, score: s / denom });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }
}

/** How hard a mood is pushing, 0..1 — the intensity the composer is handed. */
export function moodIntensity(m: Mood): number {
  return clip01(Math.max(
    Math.max(m.sceneChange * 1.5, m.bass * 0.6, m.motion * 0.5),
    clip01(m.motion * 0.5 + m.motionAvg * 0.4 + m.sceneChange * 0.5),
    clip01(m.bass * 0.85 + m.energy * 0.15),
  ));
}

export const categoryOfEffect = (id: string) =>
  EFFECTS.find(e => e.id === id)?.category ?? "corruption";

/**
 * Mood → a composed stack.
 *
 * Scoring answers "which effects suit this moment"; the composition grammar
 * answers "how do they share one frame". Keeping them separate is what stopped
 * the director emitting five load-bearing layers at once.
 */
export function composeFromMood(
  m: Mood,
  rand: () => number = Math.random,
  intensityOverride?: number,
  /** Optional id → score multiplier (0..1) applied before ranking is
   *  truncated to the top 24. A caller with a memory of what it just
   *  composed (Journey) can hand in a recency penalty so the same
   *  load-bearing effect doesn't keep winning just because it always suits
   *  the mood — everything else about scoring/composition is untouched, and
   *  callers with nothing to penalize (Smart, tests) behave exactly as
   *  before. */
  recentPenalty?: ReadonlyMap<string, number>,
): DirectedLayer[] {
  let ranked = rankEffects(m);
  if (recentPenalty && recentPenalty.size) {
    ranked = ranked
      .map(r => ({ id: r.id, score: r.score * (recentPenalty.get(r.id) ?? 1) }))
      .sort((a, b) => b.score - a.score);
  }
  return composeStack({
    ranked: ranked.slice(0, 24),
    categoryOf: categoryOfEffect,
    intensity: intensityOverride ?? moodIntensity(m),
    rand,
  });
}

function clip01(v: number) { return Math.max(0, Math.min(1, v)); }
