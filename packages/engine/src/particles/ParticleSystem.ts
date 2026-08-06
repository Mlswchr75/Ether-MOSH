/**
 * ParticleSystem — GPU particles steered by the motion field + audio (Phase 2/3).
 *
 * WebGL2 baseline uses transform feedback; the WebGPU path uses compute shaders
 * for much larger counts. Particles spawn on beats, are advected by the motion
 * field, and tint from the audio bands — the "sparks and storm" layer on top of
 * the moshed source.
 */

import type { AudioBands, EngineCapabilities } from "../types.js";

export interface ParticleParams {
  count: number; // clamped to capabilities.maxParticles
  spawnOnBeat: number; // 0..1 burst intensity per beat
  motionAdvection: number; // how strongly the motion field pushes particles
  lifetimeSeconds: number;
  size: number;
}

export const DEFAULT_PARTICLE_PARAMS: ParticleParams = {
  count: 20_000,
  spawnOnBeat: 0.6,
  motionAdvection: 1.0,
  lifetimeSeconds: 2.5,
  size: 2,
};

export class ParticleSystem {
  private params: ParticleParams = { ...DEFAULT_PARTICLE_PARAMS };
  private readonly maxParticles: number;

  constructor(_ctx: unknown, caps: EngineCapabilities) {
    this.maxParticles = caps.maxParticles;
  }

  setParams(patch: Partial<ParticleParams>): void {
    const next = { ...this.params, ...patch };
    next.count = Math.min(next.count, this.maxParticles);
    this.params = next;
  }

  /** Advance simulation from the motion field + audio, then draw. */
  update(_motionTexture: unknown, _audio?: AudioBands, _dt = 0): void {}

  dispose(): void {}
}
