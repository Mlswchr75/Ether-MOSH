/**
 * Shared types for @mosh/engine.
 *
 * These intentionally mirror the shapes already used by the MOSH app's store
 * (Layer / params / blend / audioMaps) so the app can hand its stack straight
 * to the engine without translation once the engine is wired in.
 */

/** Any source the engine can render from. */
export type EngineSource =
  | HTMLVideoElement
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap;

export type BlendMode =
  | "normal"
  | "add"
  | "screen"
  | "multiply"
  | "overlay"
  | "difference"
  | "exclusion"
  | (string & {}); // exotic blends resolved by the backend

/** Live audio bands, 0..1. Sourced from the app's audio bus. */
export interface AudioBands {
  bass: number;
  mid: number;
  treble: number;
  overall: number;
  beat: number; // 0..1 recent beat energy
}

/** One reactive mapping from an audio band onto a param. */
export interface AudioMap {
  source: keyof AudioBands;
  amount: number; // -1..1, fraction of param range
  smoothing: number; // 0..1
}

/** A single effect layer. `params` are normalized 0..1, keyed by param id. */
export interface EffectLayer {
  effectId: string;
  opacity: number; // 0..1
  blend: BlendMode;
  params: Record<string, number>;
  audioMaps?: Record<string, AudioMap | null>;
}

/** An ordered, bottom-to-top stack of layers. */
export type EffectStack = EffectLayer[];

/** Per-frame inputs the engine consumes on render(). */
export interface FrameInput {
  timeSeconds: number;
  audio?: AudioBands;
}

/** GPU motion-field configuration (Phase 2). */
export interface MotionFieldConfig {
  enabled: boolean;
  /** Internal resolution of the flow buffer; scaled down for perf. */
  resolution?: number; // e.g. 128
  /** Sensitivity of frame-diff → motion magnitude. */
  gain?: number;
}

/** Segmentation configuration (Phase 2). */
export interface SegmentationConfig {
  enabled: boolean;
  /** Run segmentation at this FPS and interpolate between frames. */
  fps?: number; // e.g. 12
  /**
   * Per-region effect stacks. Each detected region (e.g. person, background,
   * or a pose-derived body part) can run its own independent stack — the
   * "each element moshed differently" capability.
   */
  regionStacks?: Record<RegionId, EffectStack>;
}

export type RegionId =
  | "subject"
  | "background"
  | "head"
  | "torso"
  | "leftArm"
  | "rightArm"
  | "legs"
  | (string & {});

/** What the current device/backend actually supports (runtime probe). */
export interface EngineCapabilities {
  backend: "webgl2" | "webgpu";
  hdrFloat16: boolean;
  transformFeedback: boolean; // WebGL2 particle path
  computeShaders: boolean; // WebGPU particle path
  segmentation: boolean; // MediaPipe available
  maxParticles: number; // adaptive ceiling for this device
  recommendedDpr: number; // from the capability probe
}

export interface CreateEngineOptions {
  /** Try WebGPU first, fall back to WebGL2. Default true. */
  preferWebGPU?: boolean;
  /** Clamp device pixel ratio. Default min(devicePixelRatio, 2). */
  maxDpr?: number;
}
