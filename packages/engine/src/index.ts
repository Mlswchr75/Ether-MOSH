/**
 * @mosh/engine — public entry point.
 *
 * The MOSH app imports only what's exported here. Everything else is internal
 * and free to change as the WebGL2/WebGPU backends are implemented.
 */

export type {
  EngineSource,
  BlendMode,
  AudioBands,
  AudioMap,
  EffectLayer,
  EffectStack,
  FrameInput,
  MotionFieldConfig,
  SegmentationConfig,
  RegionId,
  EngineCapabilities,
  CreateEngineOptions,
} from "./types.js";

export { MoshEngine } from "./MoshEngine.js";
export { createMoshEngine } from "./MoshEngine.js";
