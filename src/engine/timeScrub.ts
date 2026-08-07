/**
 * Time scrubbing — pick any moment in a ±1.5s window around a button press.
 *
 * ON "PREDICTING THE FUTURE"
 *
 * Nothing here guesses. Every continuous modulator in the engine is a pure
 * function of `t`, which is stated in timefx.ts and is what makes loops
 * frame-perfect. So the frame 1.5s from now is not estimated — it is *computed*,
 * by evaluating the same functions at a later `t`. That is strictly better than
 * a model predicting it: the result is exact, costs nothing, and needs no
 * network.
 *
 * The one genuinely unknowable input is audio. A microphone 1.5s from now has
 * not happened. Rather than invent it, the forward half decays the pulse toward
 * the window's recent mean — so the future frames are honest about the part
 * that is real (geometry, colour, all time-driven motion) and neutral about the
 * part that is not.
 *
 * ON "REWINDING"
 *
 * The past is recovered the same way. Rather than hoarding pixels — which would
 * cost hundreds of megabytes and cap the export at whatever resolution was on
 * screen — this records the *inputs* that produced each frame: a timestamp and
 * a pulse value, about 16 bytes per frame. Re-rendering from those inputs
 * reproduces the moment exactly, at any resolution you like. That is what makes
 * a 3000px export of a frame from a second ago possible at all.
 */

export type ScrubSample = {
  /** Virtual render time in seconds — what the effect shaders receive. */
  t: number;
  /** Audio/beat envelope at that moment, 0..1. */
  pulse: number;
  /** Wall clock, for windowing. */
  at: number;
};

/** Seconds recoverable on each side of the press. */
export const SCRUB_BEFORE = 1.5;
export const SCRUB_AFTER = 1.5;
export const SCRUB_SPAN = SCRUB_BEFORE + SCRUB_AFTER;

/**
 * Rolling record of render inputs.
 *
 * Sized in samples rather than seconds so a slow frame rate degrades by
 * reaching further back in time rather than by silently dropping history.
 */
export class ScrubBuffer {
  private buf: ScrubSample[] = [];
  private cap: number;

  constructor(capacity = 240) {
    this.cap = Math.max(8, capacity);
  }

  push(t: number, pulse: number, at: number) {
    this.buf.push({ t, pulse, at });
    if (this.buf.length > this.cap) this.buf.splice(0, this.buf.length - this.cap);
  }

  clear() { this.buf = []; }
  get size() { return this.buf.length; }

  /** How far back the record actually reaches, in seconds. */
  reachSeconds(now: number): number {
    if (!this.buf.length) return 0;
    return Math.max(0, (now - this.buf[0].at) / 1000);
  }

  /** Newest sample, or null when nothing has been recorded. */
  latest(): ScrubSample | null {
    return this.buf.length ? this.buf[this.buf.length - 1] : null;
  }

  /** Mean pulse over the last `seconds`, used to settle the forward half. */
  meanPulse(now: number, seconds = SCRUB_BEFORE): number {
    const cutoff = now - seconds * 1000;
    const recent = this.buf.filter(s => s.at >= cutoff);
    if (!recent.length) return 0;
    return recent.reduce((a, s) => a + s.pulse, 0) / recent.length;
  }

  /**
   * The recorded sample nearest a wall-clock instant.
   * Returns null only when nothing has been recorded at all.
   */
  nearest(at: number): ScrubSample | null {
    if (!this.buf.length) return null;
    let best = this.buf[0];
    let bestD = Math.abs(best.at - at);
    for (const s of this.buf) {
      const d = Math.abs(s.at - at);
      if (d < bestD) { best = s; bestD = d; }
    }
    return best;
  }
}

export type ScrubFrame = {
  /** -1.5 .. +1.5, relative to the press. */
  offset: number;
  /** Virtual time to render at. */
  t: number;
  /** Pulse to render with. */
  pulse: number;
  /** False once past the end of what was actually recorded. */
  reconstructed: boolean;
};

export type ScrubWindow = {
  frames: ScrubFrame[];
  /** Index of the frame at the moment of the press. */
  pivot: number;
  /** Seconds of real history available — may be less than SCRUB_BEFORE early on. */
  reach: number;
};

/**
 * Build the scrubbable window around a press.
 *
 * `steps` frames evenly spaced across the span. The backward half reads
 * recorded inputs; the forward half advances `t` at the same rate the recording
 * shows and settles the pulse toward the window's mean.
 */
export function buildWindow(
  buf: ScrubBuffer,
  pressedAt: number,
  steps = 25,
): ScrubWindow | null {
  const now = buf.latest();
  if (!now) return null;

  const n = Math.max(3, steps | 0);
  const mean = buf.meanPulse(pressedAt);
  const reach = buf.reachSeconds(pressedAt);

  /* Rate of virtual time per wall second, measured rather than assumed: the
     clock can be slowed, reversed or looped by the time controller, so a hard
     coded 1.0 would put the forward half on a different timeline from the one
     the user is actually watching. */
  const oldest = buf.nearest(pressedAt - SCRUB_BEFORE * 1000);
  const spanMs = Math.max(1, now.at - (oldest?.at ?? now.at));
  const rate = oldest && spanMs > 16 ? (now.t - oldest.t) / (spanMs / 1000) : 1;

  const frames: ScrubFrame[] = [];
  let pivot = 0;
  for (let i = 0; i < n; i++) {
    const offset = -SCRUB_BEFORE + (i / (n - 1)) * SCRUB_SPAN;
    if (Math.abs(offset) < SCRUB_SPAN / (n - 1) / 2) pivot = i;

    if (offset <= 0) {
      const s = buf.nearest(pressedAt + offset * 1000);
      const recorded = !!s && Math.abs(s.at - (pressedAt + offset * 1000)) < 120;
      frames.push({
        offset,
        t: s ? s.t : now.t + offset * rate,
        pulse: s ? s.pulse : mean,
        reconstructed: !recorded,
      });
    } else {
      // Forward: time advances exactly; pulse relaxes toward the recent mean
      // because future audio does not exist yet.
      const settle = Math.min(1, offset / SCRUB_AFTER);
      frames.push({
        offset,
        t: now.t + offset * rate,
        pulse: now.pulse * (1 - settle) + mean * settle,
        reconstructed: true,
      });
    }
  }
  return { frames, pivot, reach };
}

/**
 * Score a rendered frame for how good a still it makes.
 *
 * This is the analysis half: no model, no network, just the measurements that
 * actually separate a strong frame from a weak one.
 *
 *   CONTRAST  — luminance spread. A flat frame is a dull print.
 *   DETAIL    — mean gradient. Distinguishes a rich field from a smooth blur.
 *   CLIPPING  — penalises crushed blacks and blown whites, which are detail
 *               that has already been destroyed and cannot be graded back.
 *   COLOUR    — mean saturation, mildly rewarded; a dead grey frame rarely
 *               makes the garment someone wants.
 *
 * Returns 0..1. Used to mark strong moments on the timeline so scrubbing is
 * guided rather than blind.
 */
export function scoreFrame(data: Uint8ClampedArray, w: number, h: number): number {
  if (w < 4 || h < 4 || data.length < w * h * 4) return 0;

  let sum = 0;
  let sumSq = 0;
  let sat = 0;
  let clipped = 0;
  let grad = 0;
  let n = 0;

  // Stride the sample: a 256px probe has 65k pixels and the statistics are
  // stable long before all of them are read.
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 4096)));

  for (let y = 0; y < h - step; y += step) {
    for (let x = 0; x < w - step; x += step) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      sum += l;
      sumSq += l * l;

      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      sat += mx === 0 ? 0 : (mx - mn) / mx;
      if (l < 4 || l > 251) clipped++;

      const jr = ((y * w) + x + step) * 4;
      const jd = (((y + step) * w) + x) * 4;
      const lr = 0.299 * data[jr] + 0.587 * data[jr + 1] + 0.114 * data[jr + 2];
      const ld = 0.299 * data[jd] + 0.587 * data[jd + 1] + 0.114 * data[jd + 2];
      grad += Math.abs(l - lr) + Math.abs(l - ld);
      n++;
    }
  }
  if (!n) return 0;

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const contrast = Math.min(1, Math.sqrt(variance) / 70);
  const detail = Math.min(1, (grad / n) / 44);
  const colour = Math.min(1, (sat / n) / 0.55);
  const clipPenalty = Math.min(1, (clipped / n) / 0.22);

  const score = contrast * 0.38 + detail * 0.4 + colour * 0.22 - clipPenalty * 0.35;
  return Math.max(0, Math.min(1, score));
}
