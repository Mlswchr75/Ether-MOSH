/**
 * Segmenter — on-device segmentation via MediaPipe (Phase 2).
 *
 * Runs Selfie Segmentation (subject/background) and optionally Pose (body-part
 * regions), producing mask textures the renderer uses to route an *independent*
 * effect stack per region. This is the engine feature behind the "each detected
 * element moshed differently" vision.
 *
 * Runs on a throttled clock (e.g. 12fps) in a worker and interpolates masks
 * between inferences to stay cheap on mobile.
 */

import type {
  EngineCapabilities,
  RegionId,
  SegmentationConfig,
} from "../types.js";

export interface RegionMask {
  region: RegionId;
  /** GPU texture (R = coverage 0..1) for this region. */
  texture: unknown;
}

export class Segmenter {
  private config: SegmentationConfig = { enabled: false };

  constructor(_caps: EngineCapabilities) {}

  configure(config: SegmentationConfig): void {
    this.config = { ...this.config, ...config };
  }

  /** Kick inference from the latest source frame (throttled internally). */
  update(_sourceTexture: unknown): void {}

  /** Current region masks (interpolated toward the latest inference). */
  get masks(): RegionMask[] {
    return [];
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  dispose(): void {}
}
