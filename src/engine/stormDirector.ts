// Storm Director — reactive "reality warp" mode. 
// PARASITIC TRACKING MODE: Identifies up to 5 distinct moving objects (fingers, features),
// wraps tiny shape-fitting mosh bubbles around them, and sustains effects for seconds to a minute.

import { EFFECTS } from "./effects";

export type StormRegion = { cx: number; cy: number; rx: number; ry: number; soft: number };

type StormOpts = {
  getVideo: () => HTMLVideoElement | null;
  onStorm: (effectIds: string[], opts: { explosive: boolean; regions: StormRegion[] }) => void;
  onTimeWarp?: () => void;
  onBurst?: (power: number) => void;
};

const has = (id: string) => EFFECTS.some(e => e.id === id);

const EXPLOSIVE_POOL = ["datamosh","glitchTeleport","pixelExplode","blockShift","hexShatter","colorQuake","compressionTears","twirl","zoomBlur","fractalZoom","displacement","polarFold","scanBreak"].filter(has);
const SUBTLE_POOL = ["dreamGlow","auroraVeil","lightLeak","fog","dustMotes","vhsBleed","hueRotate","oilSlick","holoShine","godRays"].filter(has);
const MOTION_POOL = ["liquidWarp","displacement","zoomBlur","twirl","ripple","lensWarp","melt","sliceDrift","fractalZoom"].filter(has);

function pick<T>(arr: T[], rand: () => number): T { return arr[Math.floor(rand() * arr.length)]; }
function sample<T>(arr: T[], n: number, rand: () => number): T[] {
  const pool = [...arr]; const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}


/**
 * Motion tracking, lifted out of StormDirector so the Journey director can use
 * the same parasitic bubbles.
 *
 * Uses a local-maxima search rather than blob detection on purpose: thresholding
 * treats a whole hand as one region, where this isolates individual fingers.
 * Wrapping a small effect around each one is the difference between "the frame
 * is glitching" and "that thing is glitching".
 */
export class MotionTracker {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prev: Uint8ClampedArray | null = null;
  /** EXTREME RESOLUTION GRID: 32x24 to track individual fingers accurately. */
  private GW = 32;
  private GH = 24;
  private zoneMotion: number[];

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160;
    this.canvas.height = 120;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.zoneMotion = new Array(this.GW * this.GH).fill(0);
  }

  reset() {
    this.prev = null;
    this.zoneMotion.fill(0);
  }

  /** Overall movement across the frame, 0..1 — cheap, and already computed. */
  overall(): number {
    let sum = 0;
    for (const v of this.zoneMotion) sum += v;
    return Math.min(1, (sum / this.zoneMotion.length) * 6);
  }

  sample(video: HTMLVideoElement | null) {
    if (!video || !this.ctx || !video.videoWidth || video.readyState < 2) return;
    try { this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height); } catch { return; }

    const cur = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    const W = this.canvas.width, H = this.canvas.height;
    const zw = W / this.GW, zh = H / this.GH;

    const zoneDiff = new Array(this.GW * this.GH).fill(0);
    const zoneCount = new Array(this.GW * this.GH).fill(0);

    if (this.prev) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          // Grayscale fast approximation
          const l = (Math.max(cur[i], cur[i+1], cur[i+2]) + Math.min(cur[i], cur[i+1], cur[i+2])) * 0.5;
          const pl = (Math.max(this.prev[i], this.prev[i+1], this.prev[i+2]) + Math.min(this.prev[i], this.prev[i+1], this.prev[i+2])) * 0.5;
          const d = Math.abs(l - pl);

          const zx = Math.min(this.GW - 1, Math.floor(x / zw));
          const zy = Math.min(this.GH - 1, Math.floor(y / zh));
          const zi = zy * this.GW + zx;

          zoneDiff[zi] += d;
          zoneCount[zi] += 1;
        }
      }
      for (let z = 0; z < zoneDiff.length; z++) {
        this.zoneMotion[z] = zoneCount[z] ? Math.min(1, (zoneDiff[z] / zoneCount[z]) / 34) : 0;
      }
    }
    this.prev = new Uint8ClampedArray(cur);
  }

  /**
   * Up to `max` distinct moving objects, strongest first.
   *
   * `soft` is randomised per region so the bubbles don't all share one edge
   * hardness, which reads as a stencil rather than as tracking.
   */
  regions(max = 5, rand: () => number = Math.random): StormRegion[] {
    const maxima: { x: number; y: number; val: number }[] = [];
    const threshold = 0.008; // Very sensitive to micro-movements

    for (let y = 1; y < this.GH - 1; y++) {
      for (let x = 1; x < this.GW - 1; x++) {
        const i = y * this.GW + x;
        const val = this.zoneMotion[i];
        if (val < threshold) continue;

        // Is this zone moving MORE than all 4 of its immediate neighbours?
        // If yes, it is the centre of an object.
        if (
          val > this.zoneMotion[i - 1] &&
          val > this.zoneMotion[i + 1] &&
          val > this.zoneMotion[i - this.GW] &&
          val > this.zoneMotion[i + this.GW]
        ) {
          maxima.push({ x, y, val });
        }
      }
    }

    maxima.sort((a, b) => b.val - a.val);
    const aspectCorrection = this.GH / this.GW;

    return maxima.slice(0, max).map(obj => {
      // SHAPE FITTING: scale strictly on motion intensity, so a small fast
      // thing gets a small bubble rather than the frame-sized one a fixed
      // radius would give it.
      const baseSize = Math.max(0.015, Math.min(0.08, 0.01 + obj.val * 0.15));
      return {
        cx: (obj.x + 0.5) / this.GW,
        cy: (obj.y + 0.5) / this.GH,
        rx: baseSize * aspectCorrection, // circular on wide screens
        ry: baseSize,
        soft: 0.15 + rand() * 0.3,       // semi-sharp, so it looks contained
      };
    });
  }
}

export class StormDirector {
  private opts: StormOpts;
  private raf: number | null = null;
  private running = false;
  private tracker = new MotionTracker();
  
  private lastSample = 0;
  private lastRegionUpdate = 0;
  
  // Lifespan & Effect State
  private lastEffectSwap = 0;
  private currentLifespan = 0;
  private currentEffects: string[] = [];
  private isExplosiveMode = false;
  
  constructor(opts: StormOpts) {
    this.opts = opts;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.rollNewEffects(); // Set initial sustained effects
    const loop = () => { if (!this.running) return; this.tick(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.tracker.reset();
  }
  
  // Randomly chooses new effects and a lifespan between 5 and 60 seconds
  private rollNewEffects() {
    const rand = Math.random;
    this.isExplosiveMode = rand() < 0.4; // 40% chance of violent effects, 60% subtle/trippy
    
    let ids: string[];
    if (this.isExplosiveMode) {
      ids = sample(EXPLOSIVE_POOL, 3 + Math.floor(rand() * 3), rand);
      if (MOTION_POOL.length) ids.splice(1, 0, pick(MOTION_POOL, rand));
    } else {
      ids = sample(SUBTLE_POOL, 2 + Math.floor(rand() * 2), rand);
      if (MOTION_POOL.length) ids.push(pick(MOTION_POOL, rand));
    }
    
    this.currentEffects = Array.from(new Set(ids)).slice(0, 5);
    this.lastEffectSwap = performance.now();
    
    // LIFESPAN VARIATION: Between 5,000ms (5s) and 60,000ms (1 min)
    this.currentLifespan = 5000 + (Math.random() * 55000); 
  }

  private tick() {
    const now = performance.now();
    
    // 1. Sample camera motion at ~30 FPS
    if (now - this.lastSample >= 33) {
      this.lastSample = now;
      this.tracker.sample(this.opts.getVideo());
    }

    // 2. Update tracking bubbles and effects at ~12 FPS for smooth performance
    if (now - this.lastRegionUpdate >= 80) {
      this.lastRegionUpdate = now;
      
      // Time for new effects?
      if (now - this.lastEffectSwap > this.currentLifespan) {
        this.rollNewEffects();
      }

      // Find local maxima (distinct objects/fingers)
      const regions = this.tracker.regions();
      
      // Feed directly to engine
      if (regions.length > 0) {
        try { this.opts.onStorm(this.currentEffects, { explosive: this.isExplosiveMode, regions }); } catch {}
      } else {
        // If absolutely no motion, clear the storm layer so it fades out
        try { this.opts.onStorm([], { explosive: false, regions: [] }); } catch {}
      }
    }
  }

}
