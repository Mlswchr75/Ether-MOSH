// Storm Director — reactive "reality warp" mode. 
// GOD MODE: Hyper-localized, chaotic micro-storms.
// Tracks tiny movements (fingers, lips) and spawns multiple small, 
// independent stacks of clashing effects rather than global screen wipes.

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
  
  // INCREASED GRID RESOLUTION: 20x15 (300 zones) instead of 4x3 to track fingers!
  private GW = 20; private GH = 15;
  private zoneMotion: number[];

  constructor(opts: StormOpts) {
    this.opts = opts;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 160; this.canvas.height = 120; // Higher res sampling
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    this.zoneMotion = new Array(this.GW * this.GH).fill(0);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastBurst = performance.now();
    this.beatListener = () => { this.beatCount += 1; };
    window.addEventListener("aegis:beat", this.beatListener);
    window.setTimeout(() => this.fire(false, 0.4), 150); 
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
    if (now - this.lastSample < 33) return; 
    this.lastSample = now;
    this.sample();

    const audio = (window as any).__aegisAudioSources as Record<string, number> | undefined;
    const bass = audio ? Math.max(audio.kick ?? 0, audio.sub ?? 0, audio.bass ?? 0) : 0;

    const jerk = Math.max(0, this.motion - this.motionPrev);
    this.motionPrev = this.motion;

    const gap = now - this.lastBurst;
    const sceneChange = Math.max(0, this.motion - this.motionAvg * 1.7 - 0.06);

    // HYPER-AGGRESSIVE TRIGGERS: Lower cooldowns, lower thresholds
    const explosiveTrigger = (jerk > 0.08 || bass > 0.6 || sceneChange > 0.2) && gap > 120; 
    const beatTrigger = this.beatCount >= 1 && gap > 250; 
    const idleDrift = gap > 600;

    if (explosiveTrigger) {
      const power = Math.min(1, jerk * 4 + bass * 0.7 + sceneChange);
      this.fire(true, power);
      if (power > 0.4 && Math.random() < 0.6) { try { this.opts.onTimeWarp?.(); } catch {} }
    } else if (beatTrigger) {
      this.fire(Math.random() < 0.5, 0.6); 
    } else if (idleDrift) {
      this.fire(false, 0.4);
    }
  }

  private fire(explosive: boolean, power = 0.5) {
    const rand = Math.random;
    let ids: string[];
    
    // CRAZY EFFECT STACKS: Combines incompatible/clashing effects on purpose
    if (explosive) {
      const n = 4 + Math.floor(rand() * 4); // Up to 7 simultaneous effects!
      ids = sample(EXPLOSIVE_POOL, n, rand);
      if (MOTION_POOL.length) ids.splice(1, 0, pick(MOTION_POOL, rand), pick(MOTION_POOL, rand));
    } else {
      const n = 3 + Math.floor(rand() * 3); // 3 to 5 effects even on subtle
      ids = sample(SUBTLE_POOL, n, rand);
      if (MOTION_POOL.length) ids.push(pick(MOTION_POOL, rand));
    }
    ids = Array.from(new Set(ids)).slice(0, 8); // Cap at 8 pure chaos layers

    if (!ids.length) return;
    
    // SPAWN SWARMS OF REGIONS: 6-15 regions per burst instead of 1-3
    const regionCount = explosive ? (6 + Math.floor(rand() * 10)) : (4 + Math.floor(rand() * 5));
    const regions = this.computeRegions(regionCount, explosive, power, rand);
    
    try { this.opts.onStorm(ids, { explosive, regions }); } catch {}
    try { this.opts.onBurst?.(power); } catch {}
    this.lastBurst = performance.now();
    this.beatCount = 0;
  }

  private computeRegions(count: number, explosive: boolean, power: number, rand: () => number): StormRegion[] {
    const zw = 1 / this.GW, zh = 1 / this.GH;
    const ranked = this.zoneMotion
      .map((m, i) => ({ i, m }))
      .sort((a, b) => b.m - a.m);
      
    // SENSITIVE THRESHOLD: Pick up tiny micro-movements
    const threshold = 0.01; 
    const hot = ranked.filter(z => z.m > threshold).slice(0, Math.max(count, 15));

    const out: StormRegion[] = [];
    for (let i = 0; i < count; i++) {
      let cx: number, cy: number, rx: number, ry: number;
      
      if (hot.length) {
        const z = hot[i % hot.length];
        const zx = z.i % this.GW;
        const zy = Math.floor(z.i / this.GW);
        
        // Jitter wildly around the detected motion point
        cx = (zx + 0.5) * zw + (rand() - 0.5) * zw * 2.0;
        cy = (zy + 0.5) * zh + (rand() - 0.5) * zh * 2.0;
        
        // TINY, HIGHLY VARIABLE SIZES: From speck-sized to medium blobs
        const sizeMod = 0.2 + rand() * 2.5;
        rx = zw * sizeMod * (explosive ? 1.5 : 1.0);
        ry = zh * sizeMod * (explosive ? 1.5 : 1.0);
      } else {
        // Idle drift scatters random tiny portals everywhere
        cx = rand(); cy = rand();
        rx = zw * (0.5 + rand() * 2);
        ry = zh * (0.5 + rand() * 2);
      }
      
      // EXTREME EDGES: Some bubbles are sharp cutouts, some are smooth blurs
      const soft = 0.05 + rand() * 0.9; 
      
      out.push({
        cx: Math.max(0.01, Math.min(0.99, cx)),
        cy: Math.max(0.01, Math.min(0.99, cy)),
        rx: Math.max(0.01, Math.min(0.4, rx)), // Allow incredibly tiny radiuses
        ry: Math.max(0.01, Math.min(0.4, ry)),
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
