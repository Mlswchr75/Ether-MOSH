/**
 * Scrub capture — freeze the moment, then move around inside it.
 *
 * WHAT THE ENGINE ALREADY GOT RIGHT, AND WHAT IT GOT WRONG
 *
 * `timeScrub.ts` records render *inputs* — a timestamp and a pulse, about 16
 * bytes a frame — on the reasoning that every continuous modulator is a pure
 * function of `t`, so a past moment can be recomputed rather than stored. That
 * reasoning is correct, and it is what makes an arbitrary-resolution export
 * possible at all. It is also, on its own, not enough to reproduce a frame:
 *
 *   THE SHADER CLOCK was read from `performance.now()` inside `Renderer.render`,
 *     so a replayed frame animated to whenever the replay happened rather than
 *     to when the moment was. Fixed by `Renderer.setTimeOverride`.
 *   THE SOURCE IS LIVE. A camera frame from 1.5 seconds ago is gone. No amount
 *     of recomputation brings back pixels that were never kept. The same goes
 *     for Forge, whose generated source depends on audio the room has moved on
 *     from.
 *   AUDIO SMOOTHING is path-dependent — each mapped parameter carries an
 *     exponential filter whose state is a function of everything it has seen,
 *     not of `t`.
 *
 * So this keeps what recomputation can genuinely give (exact modulator values,
 * exact shader time, any resolution) and stores what it cannot (the source
 * pixels, and the fully resolved parameters that the audio filters produced).
 * A snapshot of the source plus the already-resolved layers is a few hundred
 * bytes and one ImageBitmap per sample — cheap, bounded, and honest.
 *
 * THE TWO HALVES ARE NOT SYMMETRICAL, AND SHOULDN'T PRETEND TO BE
 *
 * Going backwards, everything is real: the source frame is the one that was on
 * screen and the parameters are the ones that were used.
 *
 * Going forwards, the source has not happened yet. Rather than invent it, the
 * forward half holds the last real frame still and lets the effects keep
 * evolving over it — modulators advanced to the later `t`, pulse settling
 * toward the window's recent mean. That is exactly the "slow down and freeze in
 * place" the feature is for, and it is honest about which half of the image is
 * measured and which is computed.
 */

import type { RenderLayer } from "./Renderer";
import type { Layer } from "@/store/types";
import { evalModulator } from "./modulators";
import { EFFECTS_BY_ID } from "./effects";
import {
  SCRUB_AFTER, SCRUB_BEFORE, SCRUB_SPAN,
  ScrubBuffer, buildWindow, scoreFrame,
} from "./timeScrub";

export { SCRUB_AFTER, SCRUB_BEFORE, SCRUB_SPAN };

/**
 * Samples a second. 15 is comfortably above the rate at which scrubbing feels
 * continuous, and a third of the memory of recording every frame — which
 * matters because each sample carries a full-resolution source bitmap.
 */
export const CAPTURE_HZ = 15;
const CAPTURE_INTERVAL_MS = 1000 / CAPTURE_HZ;

/**
 * Ring length. SCRUB_BEFORE seconds of history at CAPTURE_HZ, plus headroom for
 * frame-rate wobble. Bounded rather than time-trimmed so the memory ceiling is
 * a constant a reviewer can check, not something that depends on how the device
 * happened to be performing.
 */
export const CAPTURE_FRAMES = Math.ceil(SCRUB_BEFORE * CAPTURE_HZ) + 8;

export type CapturedFrame = {
  /** Wall clock at capture. */
  at: number;
  /** Virtual render time — what the shaders were given. */
  t: number;
  /** Audio/beat envelope at that moment, 0..1. */
  pulse: number;
  /** The source pixels that were on screen. Owned by the capture. */
  source: ImageBitmap | null;
  /** Fully resolved layers, exactly as they were handed to the renderer. */
  layers: RenderLayer[];
};

/** One position on the scrubbable timeline. */
export type ScrubTakeFrame = {
  /** −1.5 … +1.5, relative to the freeze. */
  offset: number;
  t: number;
  pulse: number;
  source: ImageBitmap | null;
  layers: RenderLayer[];
  /**
   * False only for frames whose source pixels were actually captured. True for
   * the forward half, and for any backward frame the ring could not reach.
   * Surfaced in the UI so nobody exports a "photo" of a moment believing it was
   * recorded when it was computed.
   */
  reconstructed: boolean;
};

export type ScrubTake = {
  frames: ScrubTakeFrame[];
  /** Index of the frame at the moment of the freeze. */
  pivot: number;
  /** Seconds of real history behind the pivot — may be under SCRUB_BEFORE. */
  reach: number;
};

/**
 * Advance a layer stack's modulators to a new time.
 *
 * Pure, and deliberately does *not* apply audio mappings: the forward half of
 * the window is in the future, where there is no audio to map. Applying the
 * last-known audio value instead would freeze a transient into every future
 * frame, which reads as the effect having got stuck.
 *
 * `master` is the stack-intensity multiplier the live loop applies to opacity;
 * it is passed in rather than recomputed because it, too, is audio-reactive.
 */
export function projectLayers(
  layers: Layer[],
  t: number,
  pulse: number,
  master = 1,
): RenderLayer[] {
  return layers.map(l => {
    const params: Record<string, number> = {};
    const def = EFFECTS_BY_ID[l.effectId];
    for (const k of Object.keys(l.params)) {
      let v = l.params[k];
      const mod = l.mods?.[k];
      if (mod) v = v + evalModulator(mod.type, t, mod.speed, mod.depth, mod.offset, pulse);
      const pdef = def?.params.find(p => p.key === k);
      // Clamp to the shader's declared range. Out-of-range values don't throw,
      // they just make the shader misbehave silently.
      if (pdef) v = Math.max(pdef.min, Math.min(pdef.max, v));
      params[k] = v;
    }
    return {
      id: l.id,
      effectId: l.effectId,
      hidden: l.hidden,
      opacity: Math.max(0, Math.min(1, l.opacity * master)),
      blend: l.blend,
      params,
      region: l.region ?? null,
    };
  });
}

/**
 * Rolling capture of everything needed to rebuild a recent frame.
 *
 * Owns its bitmaps: evicted frames are closed immediately rather than left for
 * the collector, because ImageBitmaps hold memory outside the JS heap and a
 * ring of unclosed ones is invisible to every ordinary leak check.
 */
export class ScrubCapture {
  private inputs = new ScrubBuffer(CAPTURE_FRAMES + 8);
  private frames: CapturedFrame[] = [];
  /** -Infinity, not 0, so a fresh capture is due on its very first frame
   *  regardless of what the clock happens to read. */
  private lastCaptureAt = -Infinity;
  private paused = false;
  private cap: number;

  constructor(capacity = CAPTURE_FRAMES) {
    this.cap = Math.max(4, capacity);
  }

  get size() { return this.frames.length; }

  /** True when enough time has passed to be worth taking another sample. */
  due(now: number) {
    return now - this.lastCaptureAt >= CAPTURE_INTERVAL_MS;
  }

  /**
   * Test-and-set: claim this instant for a sample, synchronously.
   *
   * The producer is async — `createImageBitmap` resolves a frame or two later —
   * so a caller that only checked `due()` would see it true on every frame
   * until the first decode landed, and fire a decode each time. Claiming
   * up front bounds it to one in flight per interval.
   */
  claim(now: number): boolean {
    if (this.paused || !this.due(now)) return false;
    this.lastCaptureAt = now;
    return true;
  }

  /**
   * Stop recording without dropping what is already held.
   *
   * Called the instant the user asks to scrub, and it is load-bearing rather
   * than an optimisation. The ring holds a shade over two seconds; the freeze
   * ramp that follows the tap runs for one and a half. Keep recording through
   * it and the ramp's own frames evict almost all of the history the user
   * pressed the button to look at — the timeline would show the slow-down
   * instead of the moment.
   */
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  get isPaused() { return this.paused; }

  /**
   * Store one sample.
   *
   * `source` ownership transfers here. Callers should only produce a bitmap
   * when `due()` says so — decoding one per frame is the expensive part, not
   * storing it.
   */
  push(t: number, pulse: number, at: number, source: ImageBitmap | null, layers: RenderLayer[]) {
    this.lastCaptureAt = at;
    this.inputs.push(t, pulse, at);
    this.frames.push({
      at, t, pulse, source,
      // Copy the params: the live loop reuses its layer objects between frames,
      // so holding the reference would give every sample the newest values and
      // make the whole timeline show one instant.
      layers: layers.map(l => ({ ...l, params: { ...l.params } })),
    });
    while (this.frames.length > this.cap) {
      this.frames.shift()?.source?.close();
    }
  }

  /** Drop everything and release the bitmaps. */
  clear() {
    for (const f of this.frames) f.source?.close();
    this.frames = [];
    this.inputs.clear();
    this.lastCaptureAt = -Infinity;
    this.paused = false;
  }

  /** How far back the capture actually reaches, in seconds. */
  reachSeconds(now: number) { return this.inputs.reachSeconds(now); }

  private nearest(at: number): CapturedFrame | null {
    if (!this.frames.length) return null;
    let best = this.frames[0];
    let bestD = Math.abs(best.at - at);
    for (const f of this.frames) {
      const d = Math.abs(f.at - at);
      if (d < bestD) { best = f; bestD = d; }
    }
    return best;
  }

  /**
   * Build the scrubbable window around a freeze.
   *
   * `live` is the current store stack, used to advance modulators for the
   * forward half. Frames borrow the capture's bitmaps rather than copying them,
   * so the take is only valid until `clear()` or `dispose()`.
   */
  take(pressedAt: number, live: Layer[], steps = 25, master = 1): ScrubTake | null {
    const window = buildWindow(this.inputs, pressedAt, steps);
    if (!window || !this.frames.length) return null;

    const newest = this.frames[this.frames.length - 1];
    const frames: ScrubTakeFrame[] = window.frames.map(f => {
      if (f.offset <= 0) {
        const near = this.nearest(pressedAt + f.offset * 1000);
        // A recorded frame is only "real" if the ring actually reached that far
        // back; past the reach, `nearest` returns the oldest thing it has.
        const recorded = !!near && Math.abs(near.at - (pressedAt + f.offset * 1000)) < 140;
        return {
          offset: f.offset,
          t: near?.t ?? f.t,
          pulse: near?.pulse ?? f.pulse,
          source: near?.source ?? newest.source,
          layers: near?.layers ?? newest.layers,
          reconstructed: !recorded,
        };
      }
      return {
        offset: f.offset,
        t: f.t,
        pulse: f.pulse,
        // The source is held still; only the effects move forward.
        source: newest.source,
        layers: live.length
          ? projectLayers(live, f.t, f.pulse, master)
          : newest.layers,
        reconstructed: true,
      };
    });

    return { frames, pivot: window.pivot, reach: window.reach };
  }

  dispose() { this.clear(); }
}

/**
 * Rank the frames of a take so scrubbing is guided rather than blind.
 *
 * Scoring needs pixels, and the take carries source bitmaps rather than
 * rendered output — so this measures the *source*, which is a decent proxy for
 * whether the moment was worth catching (was the subject moving through frame,
 * was it in focus, was it blown out) but is emphatically not a judgement of the
 * final composite. Returns one 0..1 score per frame.
 */
export function scoreTake(
  take: ScrubTake,
  probe: HTMLCanvasElement,
): number[] {
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return take.frames.map(() => 0);
  const w = probe.width;
  const h = probe.height;

  // Bitmaps repeat across the window — the whole forward half shares one, and
  // adjacent backward frames often land on the same sample. Scoring each
  // distinct bitmap once turns 25 readbacks into a handful.
  const seen = new Map<ImageBitmap, number>();
  return take.frames.map(f => {
    if (!f.source) return 0;
    const cached = seen.get(f.source);
    if (cached !== undefined) return cached;
    let score = 0;
    try {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(f.source, 0, 0, w, h);
      score = scoreFrame(ctx.getImageData(0, 0, w, h).data, w, h);
    } catch {
      score = 0; // tainted canvas — advisory only, never block the scrub
    }
    seen.set(f.source, score);
    return score;
  });
}

/** Index of the strongest frame, for the "best moment" marker. */
export function bestFrameIndex(scores: number[]): number {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return best;
}

/**
 * Pixel dimensions for a print export.
 *
 * The brief was "minimum 3000x3000", so the *short* edge is what has to clear
 * 3000 — scaling the long edge instead would hand back a 3000x1688 file from a
 * 16:9 frame, which does not meet it. Capped so an extreme aspect ratio cannot
 * ask for a canvas the GPU will refuse to allocate.
 */
export function exportSize(
  sourceW: number,
  sourceH: number,
  minEdge = 3000,
  maxEdge = 8192,
): { width: number; height: number } {
  const w = Math.max(1, sourceW);
  const h = Math.max(1, sourceH);
  let scale = minEdge / Math.min(w, h);
  if (Math.max(w, h) * scale > maxEdge) scale = maxEdge / Math.max(w, h);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
