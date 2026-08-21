import { FORGE_PALETTES, seededPalette } from "./forgePalettes";
import { VOLUMETRIC_BLOOM_ID, type ForgeGeneratorAudio, type Canvas2DForgeGenerator, type ForgeGenerator } from "./forgeGenerators";
import { GENERATORS_BY_ID } from "./forgeGeneratorRegistry";
import { DRIFT_FIELD } from "./forgeGenerators/driftField";
import { applyKaleidoscope } from "./forgeKaleidoscope";
import { applyFinishingGlow } from "./forgeFinishing";
import type { VolumetricBloomRenderer } from "./volumetricBloom";
import { hexToRgb } from "./seamlessSource";

/**
 * Lazy-loaded: volumetricBloom.ts pulls in all of Three.js for its own
 * standalone WebGLRenderer, which is dead weight for every caller that
 * never touches the volumetric generator (e.g. a Canvas2D-only embed).
 * Loaded on first actual use instead of unconditionally at module init, so
 * bundlers can code-split it into a chunk that's simply never fetched by
 * callers who don't need it.
 */
let VolumetricBloomRendererCtor: typeof VolumetricBloomRenderer | null = null;
let volumetricBloomLoading = false;
function ensureVolumetricBloomLoaded() {
  if (VolumetricBloomRendererCtor || volumetricBloomLoading) return;
  volumetricBloomLoading = true;
  void import("./volumetricBloom").then((mod) => {
    VolumetricBloomRendererCtor = mod.VolumetricBloomRenderer;
  });
}
import type { ForgeState } from "@/store/types";

export const TRANSITION_MS = 2400;

/**
 * Per-GlCanvas-instance mutable state that must not live in the Zustand
 * store: generator simulation state (particle positions, cell radii, ...)
 * changes every frame and should never trigger a React re-render, and a
 * WebGL context is not serializable at all. One runtime per live canvas.
 */
export type ForgeRuntime = {
  states: Map<string, unknown>;
  scratchA: HTMLCanvasElement;
  scratchACtx: CanvasRenderingContext2D;
  scratchB: HTMLCanvasElement;
  scratchBCtx: CanvasRenderingContext2D;
  finishScratch: HTMLCanvasElement;
  finishScratchCtx: CanvasRenderingContext2D;
  volumetric: VolumetricBloomRenderer | null;
  volumetricCanvas: HTMLCanvasElement | null;
  volumetricFailed: boolean;
  volumetricStepBudget: number;
  volumetricSlowFrameStreak: number;
};

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return { canvas, ctx };
}

/**
 * Scratch canvases are created once per runtime at the browser default
 * (300x150) and reused across frames, so they must be kept in sync with the
 * caller's actual frame size on every call — otherwise content drawn at
 * `w`x`h` gets clipped/stretched against a stale canvas size.
 */
function ensureSize(canvas: HTMLCanvasElement, w: number, h: number) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function createForgeRuntime(): ForgeRuntime {
  const a = makeCanvas();
  const b = makeCanvas();
  const f = makeCanvas();
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return {
    states: new Map(),
    scratchA: a.canvas,
    scratchACtx: a.ctx,
    scratchB: b.canvas,
    scratchBCtx: b.ctx,
    finishScratch: f.canvas,
    finishScratchCtx: f.ctx,
    volumetric: null,
    volumetricCanvas: null,
    volumetricFailed: false,
    volumetricStepBudget: cpuCount <= 4 ? 28 : 48,
    volumetricSlowFrameStreak: 0,
  };
}

function isCanvas2DGenerator(g: ForgeGenerator): g is Canvas2DForgeGenerator {
  return g.kind === "canvas2d";
}

function stateFor(runtime: ForgeRuntime, generator: Canvas2DForgeGenerator, seed: string): unknown {
  const key = `${generator.id}:${seed}`;
  let s = runtime.states.get(key);
  if (s === undefined) {
    s = generator.createState(seed);
    runtime.states.set(key, s);
  }
  return s;
}

/**
 * Renders one generator (Canvas2D by id lookup, or Volumetric Bloom by its
 * reserved id) into `target`. Unknown or failing generators fall back to
 * Drift Field, which cannot itself fail — it has no external dependencies —
 * so this function always leaves `target` painted.
 */
function renderGeneratorInto(
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  seed: string,
  palette: [string, string, string],
  intensity: number,
  audio: ForgeGeneratorAudio,
  generatorId: string,
  runtime: ForgeRuntime,
) {
  if (generatorId === VOLUMETRIC_BLOOM_ID) {
    if (!VolumetricBloomRendererCtor) {
      ensureVolumetricBloomLoaded();
      // Not loaded yet — fall through to the driftField fallback below for
      // this frame; once the chunk resolves, subsequent frames pick it up.
    } else if (!runtime.volumetricFailed) {
      try {
        if (!runtime.volumetricCanvas) {
          runtime.volumetricCanvas = document.createElement("canvas");
        }
        if (runtime.volumetricCanvas.width !== w || runtime.volumetricCanvas.height !== h) {
          runtime.volumetricCanvas.width = w;
          runtime.volumetricCanvas.height = h;
          if (runtime.volumetric) runtime.volumetric.resize(w, h);
        }
        if (!runtime.volumetric) {
          runtime.volumetric = new VolumetricBloomRendererCtor(runtime.volumetricCanvas);
          runtime.volumetric.resize(w, h);
        }
        const colorA = hexToRgb(palette[0]).map(c => c / 255) as [number, number, number];
        const colorB = hexToRgb(palette[1]).map(c => c / 255) as [number, number, number];
        const frameStart = performance.now();
        runtime.volumetric.render(t, {
          energy: audio.energy,
          beat: audio.beat,
          colorA,
          colorB,
          stepBudget: runtime.volumetricStepBudget,
        });
        const frameCost = performance.now() - frameStart;
        const budget = 1000 / 30; // 30fps floor for this generator specifically
        if (frameCost > budget * 1.4) {
          runtime.volumetricSlowFrameStreak++;
          if (runtime.volumetricSlowFrameStreak >= 8 && runtime.volumetricStepBudget > 16) {
            runtime.volumetricStepBudget = Math.max(16, runtime.volumetricStepBudget - 8);
            runtime.volumetricSlowFrameStreak = 0;
          }
        } else {
          runtime.volumetricSlowFrameStreak = 0;
        }
        if (!runtime.volumetric.isLost) {
          target.clearRect(0, 0, w, h);
          target.drawImage(runtime.volumetricCanvas, 0, 0, w, h);
          return;
        }
      } catch {
        runtime.volumetricFailed = true;
        runtime.volumetric = null;
      }
    }
    // Fell through: WebGL unavailable or context lost. Fall back below.
    renderGeneratorInto(target, w, h, t, seed, palette, intensity, audio, DRIFT_FIELD.id, runtime);
    return;
  }

  const entry = GENERATORS_BY_ID[generatorId];
  const generator = entry && isCanvas2DGenerator(entry) ? entry : DRIFT_FIELD;
  const state = stateFor(runtime, generator, seed);
  generator.render({ ctx: target, w, h, t, seed, palette, intensity, audio }, state);
}

export type ForgeSourceOpts = ForgeState;

export function paintForgeSource(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  forge: ForgeSourceOpts,
  reactive: Partial<ForgeGeneratorAudio> = {},
  runtime: ForgeRuntime,
) {
  ensureSize(runtime.scratchA, w, h);
  ensureSize(runtime.scratchB, w, h);
  // Re-rolling the seed now also re-derives color (hue/saturation jitter on
  // top of the chosen preset), not just layout — previously every reroll
  // within one palette choice repeated the exact same three hues.
  const basePalette = FORGE_PALETTES[forge.paletteIdx] ?? FORGE_PALETTES[0];
  const palette = seededPalette(basePalette, forge.seed).colors;
  const audio: ForgeGeneratorAudio = {
    treble: reactive.treble ?? 0,
    beat: reactive.beat ?? 0,
    bpm: reactive.bpm ?? 0,
    regularity: reactive.regularity ?? 0,
    density: reactive.density ?? 0,
    brightness: reactive.brightness ?? 0.4,
    weight: reactive.weight ?? 0.4,
    dynamics: reactive.dynamics ?? 0,
    energy: reactive.energy ?? 0,
  };

  const seed = forge.seed.toString(36);

  // Base-photo mode preserves today's behaviour exactly: photo underneath,
  // optional generated overlay on top via the "overlay" blend.
  if (forge.baseImage) {
    const img = forge.baseImage;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (forge.overlay > 0.01) {
      renderGeneratorInto(runtime.scratchACtx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
      ctx.save();
      ctx.globalAlpha = forge.overlay;
      ctx.globalCompositeOperation = "overlay";
      ctx.drawImage(runtime.scratchA, 0, 0, w, h);
      ctx.restore();
    }
    return;
  }

  // Transition in progress: render outgoing generator into scratchA,
  // incoming generator into scratchB, cross-dissolve them into ctx.
  const inTransition = forge.transitionFromGeneratorId != null && forge.transitionStartedAt != null;
  let progress = 1;
  if (inTransition) {
    progress = Math.min(1, (performance.now() - (forge.transitionStartedAt as number)) / TRANSITION_MS);
  }

  if (inTransition && progress < 1) {
    renderGeneratorInto(runtime.scratchACtx, w, h, t, seed, palette, forge.intensity, audio, forge.transitionFromGeneratorId as string, runtime);
    renderGeneratorInto(runtime.scratchBCtx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    ctx.drawImage(runtime.scratchA, 0, 0, w, h);
    ctx.globalAlpha = progress;
    ctx.drawImage(runtime.scratchB, 0, 0, w, h);
    ctx.globalAlpha = 1;
  } else {
    renderGeneratorInto(ctx, w, h, t, seed, palette, forge.intensity, audio, forge.activeGeneratorId, runtime);
  }

  if (forge.kaleidoscopeFolds) {
    runtime.scratchACtx.clearRect(0, 0, w, h);
    runtime.scratchACtx.drawImage(ctx.canvas, 0, 0, w, h);
    applyKaleidoscope(ctx, w, h, forge.kaleidoscopeFolds, runtime.scratchA);
  }

  applyFinishingGlow(ctx, w, h, runtime.finishScratch, runtime.finishScratchCtx, forge.intensity);
}
