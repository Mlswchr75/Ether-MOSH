/**
 * Title-screen ambience.
 *
 * The theme track used to autoplay on the visitor's first tap — it's now
 * silent by default (still loaded as the optional "play theme track"
 * default; see trackPlayer.ts) and this fills that space instead: a loose
 * scatter of short sci-fi/mechanical stingers — zaps, gears, blades,
 * digital stutter — entirely synthesized with the Web Audio API, so there
 * are no bundled audio assets to ship or license.
 *
 * Runs only on the title screen, only for the first few minutes, and stops
 * dead the moment the visitor leaves — Index.tsx owns the start()/stop()
 * lifecycle via a mount effect. Once inside the app there is no ambience at
 * all; the only sound is whatever the visitor explicitly plays or loads.
 */

// ---------- one-shot synthesis primitives ----------

const noiseBufferCache = new Map<string, AudioBuffer>();

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}`;
  const cached = noiseBufferCache.get(key);
  if (cached) return cached;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache.set(key, buf);
  return buf;
}

type ToneOpts = {
  type: OscillatorType;
  freqFrom: number;
  freqTo?: number;
  dur: number;
  gain?: number;
  attack?: number;
  lowpass?: number;
};

/** A single oscillator with a frequency ramp and a fast-attack/exponential-decay envelope. */
function tone(ctx: AudioContext, dest: AudioNode, t: number, o: ToneOpts) {
  const osc = ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(Math.max(1, o.freqFrom), t);
  if (o.freqTo !== undefined && o.freqTo !== o.freqFrom) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), t + o.dur);
  }
  const g = ctx.createGain();
  const gain = o.gain ?? 0.15;
  const attack = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let out: AudioNode = g;
  if (o.lowpass) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = o.lowpass;
    g.connect(lp);
    out = lp;
  }
  osc.connect(g);
  out.connect(dest);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

type NoiseOpts = {
  dur: number;
  gain?: number;
  attack?: number;
  filterType?: BiquadFilterType;
  freq: number;
  freqTo?: number;
  Q?: number;
};

/** A burst of white noise through a filter, with its own envelope. */
function noiseHit(ctx: AudioContext, dest: AudioNode, t: number, o: NoiseOpts) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.dur + 0.05);
  const filt = ctx.createBiquadFilter();
  filt.type = o.filterType ?? "bandpass";
  filt.frequency.setValueAtTime(o.freq, t);
  if (o.freqTo !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), t + o.dur);
  filt.Q.value = o.Q ?? 1;
  const g = ctx.createGain();
  const gain = o.gain ?? 0.15;
  const attack = o.attack ?? 0.003;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + o.dur + 0.05);
}

/** A short train of identical clicks — ratchets, cocking mechanisms, stutter. */
function clickTrain(ctx: AudioContext, dest: AudioNode, t: number, count: number, spacing: number, o: Omit<NoiseOpts, "dur"> & { dur?: number }) {
  for (let i = 0; i < count; i++) {
    noiseHit(ctx, dest, t + i * spacing, { ...o, dur: o.dur ?? 0.02, gain: (o.gain ?? 0.15) * (1 - i * 0.08) });
  }
}

// ---------- the sound library — 30 distinct stingers ----------

type SfxFn = (ctx: AudioContext, dest: AudioNode, t: number) => void;

const SOUNDS: SfxFn[] = [
  // -- zaps / electricity --
  (ctx, d, t) => tone(ctx, d, t, { type: "square", freqFrom: 1800, freqTo: 80, dur: 0.14, gain: 0.16 }),
  (ctx, d, t) => { tone(ctx, d, t, { type: "sawtooth", freqFrom: 2200, freqTo: 150, dur: 0.1, gain: 0.14 }); noiseHit(ctx, d, t + 0.08, { dur: 0.08, gain: 0.08, filterType: "bandpass", freq: 3000, Q: 4 }); },
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.08, gain: 0.15, filterType: "bandpass", freq: 3500, Q: 8 }),
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.15, gain: 0.12, filterType: "highpass", freq: 4000 }),
  (ctx, d, t) => { noiseHit(ctx, d, t, { dur: 0.05, gain: 0.11, filterType: "bandpass", freq: 600, Q: 6 }); noiseHit(ctx, d, t + 0.07, { dur: 0.06, gain: 0.11, filterType: "bandpass", freq: 1800, Q: 6 }); },
  (ctx, d, t) => tone(ctx, d, t, { type: "square", freqFrom: 90, freqTo: 3000, dur: 0.09, gain: 0.13 }),

  // -- gears / mechanisms --
  (ctx, d, t) => clickTrain(ctx, d, t, 5, 0.055, { freq: 2500, Q: 3, filterType: "highpass", gain: 0.15 }),
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.35, gain: 0.1, filterType: "lowpass", freq: 900, freqTo: 500, Q: 3 }),
  (ctx, d, t) => { tone(ctx, d, t, { type: "sine", freqFrom: 90, freqTo: 55, dur: 0.12, gain: 0.2 }); noiseHit(ctx, d, t, { dur: 0.1, gain: 0.12, filterType: "lowpass", freq: 400 }); },
  (ctx, d, t) => tone(ctx, d, t, { type: "sine", freqFrom: 1800, dur: 0.6, gain: 0.09, attack: 0.001 }),
  (ctx, d, t) => clickTrain(ctx, d, t, 3, 0.09, { freq: 1400, Q: 4, filterType: "bandpass", gain: 0.14, dur: 0.03 }),

  // -- weapons drawn --
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.3, gain: 0.13, filterType: "bandpass", freq: 900, freqTo: 4200, Q: 5 }),
  (ctx, d, t) => { noiseHit(ctx, d, t, { dur: 0.05, gain: 0.18, filterType: "bandpass", freq: 5000, Q: 12 }); tone(ctx, d, t, { type: "sine", freqFrom: 3200, dur: 0.15, gain: 0.07 }); },
  (ctx, d, t) => clickTrain(ctx, d, t, 2, 0.09, { freq: 3000, Q: 2, filterType: "highpass", gain: 0.2, dur: 0.015 }),
  (ctx, d, t) => tone(ctx, d, t, { type: "sawtooth", freqFrom: 200, freqTo: 1400, dur: 0.5, gain: 0.13 }),
  (ctx, d, t) => tone(ctx, d, t, { type: "triangle", freqFrom: 100, freqTo: 900, dur: 0.4, gain: 0.15 }),
  (ctx, d, t) => tone(ctx, d, t, { type: "triangle", freqFrom: 900, freqTo: 80, dur: 0.35, gain: 0.15 }),

  // -- stutter / digital glitch --
  (ctx, d, t) => { const f = [300, 700, 450, 900]; f.forEach((freq, i) => tone(ctx, d, t + i * 0.045, { type: "square", freqFrom: freq, dur: 0.03, gain: 0.11 })); },
  (ctx, d, t) => clickTrain(ctx, d, t, 6, 0.03, { freq: 5000, Q: 2, filterType: "highpass", gain: 0.1, dur: 0.012 }),
  (ctx, d, t) => tone(ctx, d, t, { type: "square", freqFrom: 1200, dur: 0.05, gain: 0.13 }),
  (ctx, d, t) => { tone(ctx, d, t, { type: "square", freqFrom: 900, dur: 0.04, gain: 0.12 }); tone(ctx, d, t + 0.05, { type: "square", freqFrom: 1500, dur: 0.04, gain: 0.12 }); },
  (ctx, d, t) => tone(ctx, d, t, { type: "sine", freqFrom: 400, freqTo: 3000, dur: 0.12, gain: 0.12 }),
  (ctx, d, t) => tone(ctx, d, t, { type: "sine", freqFrom: 3000, freqTo: 400, dur: 0.12, gain: 0.12 }),

  // -- alarms / signals --
  (ctx, d, t) => [0, 0.12, 0.24].forEach(off => tone(ctx, d, t + off, { type: "square", freqFrom: 1000, dur: 0.06, gain: 0.12 })),
  (ctx, d, t) => { tone(ctx, d, t, { type: "square", freqFrom: 1500, dur: 0.09, gain: 0.14 }); tone(ctx, d, t + 0.15, { type: "square", freqFrom: 1500, dur: 0.09, gain: 0.14 }); },
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.4, gain: 0.09, filterType: "lowpass", freq: 1500, freqTo: 200 }),
  (ctx, d, t) => { tone(ctx, d, t, { type: "sine", freqFrom: 300, freqTo: 650, dur: 0.16, gain: 0.09 }); tone(ctx, d, t + 0.15, { type: "sine", freqFrom: 650, freqTo: 300, dur: 0.16, gain: 0.09 }); },
  (ctx, d, t) => tone(ctx, d, t, { type: "sine", freqFrom: 220, dur: 0.25, gain: 0.08, attack: 0.08 }),
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.02, gain: 0.16, filterType: "bandpass", freq: 6000, Q: 15 }),
  (ctx, d, t) => noiseHit(ctx, d, t, { dur: 0.008, gain: 0.18, filterType: "highpass", freq: 5000 }),
  (ctx, d, t) => { tone(ctx, d, t, { type: "sine", freqFrom: 1046, dur: 0.3, gain: 0.08 }); tone(ctx, d, t, { type: "sine", freqFrom: 1568, dur: 0.22, gain: 0.05 }); },
];

// ---------- scheduler ----------

/** How long ambience keeps firing after start(), even if they never leave. */
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;
/** Gap between stingers — comfortably under the "at least once per 30s" ask,
 *  and randomized so it never reads as a metronome. */
const MIN_GAP_MS = 6_000;
const MAX_GAP_MS = 19_000;

class TitleAmbience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private running = false;
  private timer: number | null = null;
  private stopAt = 0;
  private lastIndex = -1;
  private gestureAttached = false;

  private ensureContext() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC() as AudioContext;
    const master = ctx.createGain();
    master.gain.value = 0.8;
    // A touch of slap-delay for atmosphere — cheap and makes short stingers
    // feel like they're happening somewhere bigger than a phone speaker.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.18;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    master.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
  }

  private attachGestureResume() {
    if (this.gestureAttached) return;
    this.gestureAttached = true;
    const resume = () => { this.ctx?.resume().catch(() => {}); };
    window.addEventListener("pointerdown", resume, { passive: true });
    window.addEventListener("keydown", resume);
    window.addEventListener("touchstart", resume, { passive: true });
    // Never removed — cheap no-op once the context is running, and start()
    // may be called again after a later stop() (route back to the title
    // screen), so a fresh gesture may still be needed.
  }

  start() {
    if (this.running) return;
    this.ensureContext();
    if (!this.ctx || !this.master) return;
    this.attachGestureResume();
    this.running = true;
    this.stopAt = performance.now() + ACTIVE_WINDOW_MS;
    this.scheduleNext(2000 + Math.random() * 3000);
  }

  stop() {
    this.running = false;
    if (this.timer !== null) { window.clearTimeout(this.timer); this.timer = null; }
    if (this.ctx) { try { this.ctx.close(); } catch {} }
    this.ctx = null;
    this.master = null;
  }

  private scheduleNext(delayMs: number) {
    this.timer = window.setTimeout(() => this.fire(), delayMs);
  }

  private fire() {
    if (!this.running || !this.ctx || !this.master) return;
    if (performance.now() > this.stopAt) { this.running = false; return; }
    if (!document.hidden) {
      let i = Math.floor(Math.random() * SOUNDS.length);
      if (i === this.lastIndex) i = (i + 1) % SOUNDS.length;
      this.lastIndex = i;
      try { SOUNDS[i](this.ctx, this.master, this.ctx.currentTime + 0.02); } catch {}
    }
    this.scheduleNext(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
  }
}

export const titleAmbience = new TitleAmbience();
