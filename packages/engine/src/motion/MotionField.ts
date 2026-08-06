/**
 * MotionField — GPU frame-difference / optical-flow driver (Phase 2).
 *
 * Replaces the app's current CPU-side 64×36 canvas readback used by the AI
 * directors. Running this on the GPU removes the readback latency (why Storm
 * mode currently lags fast motion) and exposes a per-pixel motion texture that
 * the effects and particles can sample directly — not just a coarse per-zone
 * scalar.
 */

import type { EngineCapabilities, MotionFieldConfig } from "../types.js";

export interface MotionSample {
  /** 0..1 overall motion magnitude this frame. */
  magnitude: number;
  /** 0..1 sudden positive jump ("jerk") — the Storm-mode lightning trigger. */
  jerk: number;
  /** Coarse per-zone magnitudes (row-major grid) for director heuristics. */
  zones: number[];
}

export class MotionField {
  private config: MotionFieldConfig = { enabled: false };

  constructor(_ctx: unknown, _caps: EngineCapabilities) {}

  configure(config: MotionFieldConfig): void {
    this.config = { ...this.config, ...config };
  }

  /** Advance the flow buffer from the latest source texture. */
  update(_sourceTexture: unknown): void {}

  /** The per-pixel motion texture (RG = flow, B = magnitude). */
  get texture(): unknown {
    return null;
  }

  /** Reduced scalars for director logic (kept cheap). */
  sample(): MotionSample {
    return { magnitude: 0, jerk: 0, zones: [] };
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  resize(_width: number, _height: number): void {}

  dispose(): void {}
}
