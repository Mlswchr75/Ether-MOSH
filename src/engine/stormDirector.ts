// Storm Director — reactive "reality warp" mode. Offline, token-free.
// A more aggressive sibling of SmartDirector: instead of switching on a musical
// timer, it reacts INSTANTLY to motion jerks and audio onsets, firing bursts
// that range from subtle drifts to full explosive stacks — each randomized and
// audio-mapped so the whole frame keeps warping to movement and sound between
// bursts. Never replaces SmartDirector; it's an alternate mode.

import { EFFECTS } from "./effects";

export type StormRegion = { cx: number; cy: number; rx: number; ry: number; soft: number };

type StormOpts = {
  getVideo: () => HTMLVideoElement | null;
  onStorm: (effectIds: string[], opts: { explosive: boolean; regions: StormRegion[] }) => void;
  onTimeWarp?: () => void;
  onBurst?: (power: number) => void;
};

const has = (id: string) => EFFECTS.some(e => e.id === id);

// Explosive pool — chaotic corruption + violent geometry.
const EXPLOSIVE_POOL = ["datamosh","glitchTeleport","pixelExplode","blockShift","hexShatter","colorQuake","compressionTears","twirl","zoomBlur","fractalZoom","displacement","polarFold","scanBreak"].filter(has);
// Subtle pool — dreamy atmosphere + gentle color.
const SUBTLE_POOL = ["dreamGlow","auroraVeil","lightLeak","fog","dustMotes","vhsBleed","hueRotate","oilSlick","holoShine","godRays"].filter(has);
// Motion pool — directional movement response.
const MOTION_POOL = ["liquidWarp","displacement","zoomBlur","twirl","ripple","lensWarp","melt","sliceDrift","fractalZoom"].filter(has);

function pick<T>(arr: T[], rand: () => number): T { return arr[Math.floor(rand() * arr.length)]; }
function sample<T>(arr: T[], n: number, rand: () => number): T[] {
  const pool = [...arr]; const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

export class StormDirector {
  private opts: StormOpts;
  private raf: number | null = null;
  private running = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prev: Uint8ClampedArray | null = null;
  private lastSample = 0;
  private lastBurst = 0;
  private motion = 0;
  private motionAvg = 0;
  private motionPrev = 0;
  private beatCount = 0;
  private beatListener: (() => void) | null = null;
  private GW = 4; private GH = 3;
  private zoneMotion: number[];

  constructor(opts: StormOpts) {
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 96; this.canvas.height = 54;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.zoneMotion = new Array(this.GW * this.GH).fill(0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastBurst = performance.now();
    this.beatListener = () => { this.beatCount += 1; };
    window.addEventListener("aegis:beat", this.beatListener);
    window.setTimeout(() => this.fire(false, 0.4), 150); // engage instantly
    const loop = () => { if (!this.running) return; this.tick(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.beatListener) window.removeEventListener("aegis:beat", this.beatListener);
    this.beatListener = null; this.prev = null;
  }

  private tick() {
    const now = performance.now();
    if (now - this.lastSample < 33) return; // ~30Hz motion sampling
    this.lastSample = now;
    this.sample();

    const audio = (window as any).__aegisAudioSources as Record<string, number> | undefined;
    const bass = audio ? Math.max(audio.kick ?? 0, audio.sub ?? 0, audio.bass ?? 0) : 0;

    // "Jerk" = sudden positive jump in motion — the lightning trigger.
    const jerk = Math.max(0, this.motion - this.motionPrev);
    this.motionPrev = this.motion;

    const gap = now - this.lastBurst;
    const sceneChange = Math.max(0, this.motion - this.motionAvg * 1.7 - 0.06);

    const explosiveTrigger = (jerk > 0.14 || bass > 0.72 || sceneChange > 0.4) && gap > 220;
    const beatTrigger = this.beatCount >= 2 && gap > 520;
    const idleDrift = gap > 2600;

    if (explosiveTrigger) {
      const power = Math.min(1, jerk * 3 + bass * 0.5 + sceneChange);
      this.fire(true, power);
      if (power > 0.6 && Math.random() < 0.4) { try { this.opts.onTimeWarp?.(); } catch {} }
    } else if (beatTrigger) {
      this.fire(Math.random() < 0.45, 0.5); // randomize explosive vs subtle for variety
    } else if (idleDrift) {
      this.fire(false, 0.3);
    }
  }

  private fire(explosive: boolean, power = 0.5) {
    const rand = Math.random;
    let ids: string[];
    if (explosive) {
      // Prefer 2..3 effects (was 3..6) so bursts feel like localized flickers,
      // not screen-consuming stacks. Only rare peaks push to 4.
      const n = 2 + (power > 0.75 && rand() < 0.35 ? 2 : (rand() < 0.5 ? 1 : 0));
      ids = sample(EXPLOSIVE_POOL, n, rand);
      if (rand() < 0.5 && MOTION_POOL.length) ids.splice(1, 0, pick(MOTION_POOL, rand));
      ids = Array.from(new Set(ids)).slice(0, 4);
    } else {
      const n = 1 + (rand() < 0.35 ? 1 : 0); // 1..2 (was 1..3)
      ids = sample(SUBTLE_POOL, n, rand);
      if (rand() < 0.25 && MOTION_POOL.length) ids.push(pick(MOTION_POOL, rand));
      ids = Array.from(new Set(ids)).slice(0, 2);
    }
    if (!ids.length) return;
    const regions = this.computeRegions(ids.length, explosive, power, rand);
    try { this.opts.onStorm(ids, { explosive, regions }); } catch {}
    try { this.opts.onBurst?.(power); } catch {}
    this.lastBurst = performance.now();
    this.beatCount = 0;
  }

  /**
   * Element-aware region picker. Uses the per-zone motion map to focus each
   * burst layer on the hottest sub-regions of the frame instead of blanketing
   * everything. Falls back to a small random region near the frame's motion
   * centroid when nothing stands out (still keeps bursts localized).
   */
  private computeRegions(count: number, explosive: boolean, power: number, rand: () => number): StormRegion[] {
    const zw = 1 / this.GW, zh = 1 / this.GH;
    // Rank zones by motion.
    const ranked = this.zoneMotion
      .map((m, i) => ({ i, m }))
      .sort((a, b) => b.m - a.m);
    const threshold = 0.04;
    const hot = ranked.filter(z => z.m > threshold).slice(0, Math.max(count, 3));

    // Base radius: one zone wide, scaled by power (bigger bursts read slightly larger).
    const baseRx = zw * (explosive ? 0.75 : 0.6) * (0.85 + power * 0.35);
    const baseRy = zh * (explosive ? 0.85 : 0.7) * (0.85 + power * 0.35);
    const soft = 0.45;

    const out: StormRegion[] = [];
    for (let i = 0; i < count; i++) {
      let cx: number, cy: number, rx: number, ry: number;
      if (hot.length) {
        const z = hot[i % hot.length];
        const zx = z.i % this.GW;
        const zy = Math.floor(z.i / this.GW);
        // Jitter within the zone so repeated bursts on the same subject don't stack identically.
        cx = (zx + 0.5) * zw + (rand() - 0.5) * zw * 0.4;
        cy = (zy + 0.5) * zh + (rand() - 0.5) * zh * 0.4;
        // Slightly bigger radius when the zone motion is very high.
        const boost = 1 + z.m * 0.6;
        rx = baseRx * boost;
        ry = baseRy * boost;
      } else {
        // Idle drift: small wandering region so subtle bursts still feel spatial.
        cx = 0.25 + rand() * 0.5;
        cy = 0.25 + rand() * 0.5;
        rx = baseRx * 1.2;
        ry = baseRy * 1.2;
      }
      out.push({
        cx: Math.max(0.02, Math.min(0.98, cx)),
        cy: Math.max(0.02, Math.min(0.98, cy)),
        rx: Math.max(0.05, Math.min(0.6, rx)),
        ry: Math.max(0.06, Math.min(0.7, ry)),
        soft,
      });
    }
    return out;
  }

  private sample() {
    const video = this.opts.getVideo();
    if (!video || !this.ctx || !video.videoWidth || video.readyState < 2) return;
    try { this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height); } catch { return; }
    const cur = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const W = this.canvas.width, H = this.canvas.height;
    const zw = W / this.GW, zh = H / this.GH;
    const zoneDiff = new Array(this.GW * this.GH).fill(0);
    const zoneCount = new Array(this.GW * this.GH).fill(0);
    let total = 0;
    if (this.prev) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const l = (Math.max(cur[i],cur[i+1],cur[i+2]) + Math.min(cur[i],cur[i+1],cur[i+2])) * 0.5;
          const pl = (Math.max(this.prev[i],this.prev[i+1],this.prev[i+2]) + Math.min(this.prev[i],this.prev[i+1],this.prev[i+2])) * 0.5;
          const d = Math.abs(l - pl);
          total += d;
          const zx = Math.min(this.GW - 1, Math.floor(x / zw));
          const zy = Math.min(this.GH - 1, Math.floor(y / zh));
          const zi = zy * this.GW + zx;
          zoneDiff[zi] += d; zoneCount[zi] += 1;
        }
      }
      const N = W * H;
      this.motion = Math.min(1, (total / N) / 34);
      for (let z = 0; z < zoneDiff.length; z++) {
        this.zoneMotion[z] = zoneCount[z] ? Math.min(1, (zoneDiff[z] / zoneCount[z]) / 34) : 0;
      }
    }
    this.prev = new Uint8ClampedArray(cur);
    this.motionAvg = this.motionAvg * 0.9 + this.motion * 0.1;
  }

  getZoneMotion() { return [...this.zoneMotion]; }
}
