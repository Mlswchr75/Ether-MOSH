/**
 * PostChain — the HDR post-processing pipeline.
 *
 * Phase 1 of this (bloom, chromatic aberration, CAS sharpening, vignette,
 * optional filmic tone-map, grain, and the color-preserving blend-with-original)
 * currently ships inside the app's `src/engine/Renderer.ts`. It migrates here so
 * the whole chain runs on HDR float16 targets and its pass params can be
 * automated by the reactive directors.
 *
 * Contract only in the scaffold — implementation lands with the backend.
 */

import type { AudioBands, EngineCapabilities } from "../types.js";

export interface PostChainParams {
  // Bloom
  bloomThreshold: number; // default 0.75
  bloomStrength: number; // default 0.12
  // Detail / color
  sharpness: number; // CAS, default 0.55
  saturation: number; // default 1.30
  vibrance: number; // default 0.35
  contrast: number; // default 1.03
  // Lens
  aberration: number; // chromatic aberration, default 0.0025
  vignette: number; // default 0.12
  // Grade
  toneMap: number; // 0 = neutral/color-accurate (default), 1 = full filmic
  grain: number; // default 0.022
  // The color-preserving blend with the untouched source, 0..1.
  mix: number; // default 0.5
}

export const DEFAULT_POST_PARAMS: PostChainParams = {
  bloomThreshold: 0.75,
  bloomStrength: 0.1,
  sharpness: 0.55,
  saturation: 1.3,
  vibrance: 0.35,
  contrast: 1.03,
  aberration: 0.0025,
  // Off by default — a non-zero vignette darkens the frame and was a repeated
  // source of the "too much black" regression. Opt in explicitly.
  vignette: 0,
  // Neutral by default (no filmic curve) to keep color accurate.
  toneMap: 0,
  grain: 0.022,
  mix: 0.5,
};

export class PostChain {
  private params: PostChainParams = { ...DEFAULT_POST_PARAMS };

  constructor(_ctx: unknown, _caps: EngineCapabilities) {
    // Allocate half-res bloom targets, compile passes, etc.
  }

  setParams(patch: Partial<PostChainParams>): void {
    this.params = { ...this.params, ...patch };
  }

  getParams(): Readonly<PostChainParams> {
    return this.params;
  }

  /**
   * Render the HDR scene target to screen through the chain.
   * `audio` lets the directors push param automation on the beat.
   */
  render(_hdrSceneTarget: unknown, _audio?: AudioBands): void {
    // bright-pass → separable blur → composite → CAS → grade → tonemap → grain → mix
  }

  resize(_width: number, _height: number): void {}

  dispose(): void {}
}
