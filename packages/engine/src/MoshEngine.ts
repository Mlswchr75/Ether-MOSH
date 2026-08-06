/**
 * MoshEngine — the stable façade the MOSH app drives.
 *
 * This scaffold defines the API contract and wires the subsystem seams. The
 * WebGL2 baseline and WebGPU path land incrementally behind this surface, so
 * the app never has to change as the engine grows.
 */

import type {
  CreateEngineOptions,
  EffectStack,
  EngineCapabilities,
  EngineSource,
  FrameInput,
  MotionFieldConfig,
  SegmentationConfig,
} from "./types.js";
import { PostChain } from "./postfx/PostChain.js";
import { MotionField } from "./motion/MotionField.js";
import { Segmenter } from "./segmentation/Segmenter.js";
import { ParticleSystem } from "./particles/ParticleSystem.js";

/**
 * Probe the device and pick a backend. Kept async because WebGPU adapter
 * acquisition is async; WebGL2 resolves immediately.
 */
export async function createMoshEngine(
  canvas: HTMLCanvasElement,
  options: CreateEngineOptions = {},
): Promise<MoshEngine> {
  const engine = new MoshEngine(canvas, options);
  await engine.init();
  return engine;
}

export class MoshEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly options: CreateEngineOptions;

  private _capabilities: EngineCapabilities | null = null;

  // Subsystems. Constructed lazily as backends come online.
  private post: PostChain | null = null;
  private motion: MotionField | null = null;
  private segmenter: Segmenter | null = null;
  private particles: ParticleSystem | null = null;

  private source: EngineSource | null = null;
  private stack: EffectStack = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, options: CreateEngineOptions = {}) {
    this.canvas = canvas;
    this.options = options;
  }

  /** Detect backend + capabilities and construct subsystems. */
  async init(): Promise<void> {
    this._capabilities = await probeCapabilities(this.canvas, this.options);
    // Subsystems are constructed here once the backend is chosen.
    // Left as seams in the scaffold; implementations arrive in Phase 1→2.
    // this.post = new PostChain(ctx, this._capabilities);
    // this.motion = new MotionField(ctx, this._capabilities);
    // this.segmenter = new Segmenter(this._capabilities);
    // this.particles = new ParticleSystem(ctx, this._capabilities);
    void this.post;
    void this.motion;
    void this.segmenter;
    void this.particles;
  }

  get capabilities(): EngineCapabilities {
    if (!this._capabilities) {
      throw new Error("MoshEngine.init() must complete before reading capabilities");
    }
    return this._capabilities;
  }

  /** Set the source to render from (live camera, image, or procedural canvas). */
  setSource(source: EngineSource | null): void {
    this.source = source;
  }

  /** Set the ordered, blended, audio-mapped effect stack for the whole frame. */
  setStack(stack: EffectStack): void {
    this.stack = stack;
  }

  /** Configure the GPU motion field (Phase 2). */
  setMotionField(_config: MotionFieldConfig): void {
    // this.motion?.configure(config);
  }

  /**
   * Configure on-device segmentation and per-region effect stacks (Phase 2) —
   * the "each detected element moshed independently" capability.
   */
  setRegions(_config: SegmentationConfig): void {
    // this.segmenter?.configure(config);
  }

  /** Render one frame. Called per requestAnimationFrame by the app. */
  render(_frame: FrameInput): void {
    if (this.disposed || !this.source) return;
    // Pipeline (as implementations land):
    //   1. Upload source → texture
    //   2. motion.update(sourceTex)              → motion field
    //   3. segmenter.update(sourceTex)           → region masks
    //   4. for each region: apply its EffectStack into HDR float16 targets
    //   5. particles.update(motionField, audio)  → composite
    //   6. post.render(hdrTarget, audio)         → bloom/CAS/CA/vignette/tonemap
    //   7. blit to canvas
  }

  resize(_width: number, _height: number, _dpr?: number): void {
    // this.post?.resize(width, height);
    // this.motion?.resize(width, height);
  }

  dispose(): void {
    this.disposed = true;
    this.post?.dispose();
    this.motion?.dispose();
    this.segmenter?.dispose();
    this.particles?.dispose();
  }
}

/**
 * Runtime capability probe. Real implementation acquires a WebGPU adapter (if
 * requested and available), else a WebGL2 context, checks HDR color-buffer /
 * transform-feedback support, and runs a short micro-benchmark to pick an
 * adaptive DPR and particle ceiling. Scaffolded with conservative defaults.
 */
async function probeCapabilities(
  _canvas: HTMLCanvasElement,
  options: CreateEngineOptions,
): Promise<EngineCapabilities> {
  const maxDpr = options.maxDpr ?? Math.min(
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    2,
  );
  // TODO(phase1/2): real adapter/context acquisition + micro-benchmark.
  return {
    backend: "webgl2",
    hdrFloat16: false,
    transformFeedback: true,
    computeShaders: false,
    segmentation: false,
    maxParticles: 50_000,
    recommendedDpr: maxDpr,
  };
}
