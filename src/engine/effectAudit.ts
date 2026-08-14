import type { EffectCategory } from "./effects";

export const EFFECT_AUDIT_THRESHOLDS = {
  changedPixelDelta: 12,
  blankAlphaCoverage: 0.01,
  blankLuminance: 1 / 255,
  inertMeanAbsoluteDelta: 0.003,
  inertChangedPixelRatio: 0.01,
} as const;

export type EffectFrameMetrics = {
  meanAbsoluteDelta: number;
  changedPixelRatio: number;
  luminanceMean: number;
  luminanceVariance: number;
  blank: boolean;
  inert: boolean;
};

export type EffectAuditStatus = "pass" | "compile-fail" | "webgl-fail" | "blank" | "inert";

export type EffectAuditResult = {
  id: string;
  name: string;
  category: EffectCategory;
  status: EffectAuditStatus;
  compileLog: string;
  glError: number;
  metrics: EffectFrameMetrics | null;
  elapsedMs: number;
};

/**
 * Measures a rendered RGBA frame without assuming a particular framebuffer
 * orientation. Alpha is intentionally excluded from deltas: the effects alter
 * visible colour, while alpha is only used to identify a blank render target.
 */
export function measureEffectFrame(source: Uint8Array, output: Uint8Array): EffectFrameMetrics {
  if (source.length !== output.length || source.length % 4 !== 0) {
    throw new RangeError("Effect audit frames must be equal-length RGBA pixel arrays");
  }

  const pixelCount = source.length / 4;
  let absoluteDelta = 0;
  let changedPixels = 0;
  let alphaPixels = 0;
  let luminanceSum = 0;
  let luminanceSquaredSum = 0;

  for (let offset = 0; offset < output.length; offset += 4) {
    const red = output[offset];
    const green = output[offset + 1];
    const blue = output[offset + 2];
    const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    const pixelDelta = Math.abs(source[offset] - red)
      + Math.abs(source[offset + 1] - green)
      + Math.abs(source[offset + 2] - blue);

    absoluteDelta += pixelDelta;
    if (pixelDelta > EFFECT_AUDIT_THRESHOLDS.changedPixelDelta) changedPixels += 1;
    if (output[offset + 3] > 0) alphaPixels += 1;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
  }

  const meanAbsoluteDelta = absoluteDelta / (255 * 3 * pixelCount);
  const changedPixelRatio = changedPixels / pixelCount;
  const luminanceMean = luminanceSum / pixelCount;
  const luminanceVariance = Math.max(0, luminanceSquaredSum / pixelCount - luminanceMean * luminanceMean);
  const blank = alphaPixels / pixelCount < EFFECT_AUDIT_THRESHOLDS.blankAlphaCoverage
    || (luminanceMean < EFFECT_AUDIT_THRESHOLDS.blankLuminance
      && luminanceVariance < EFFECT_AUDIT_THRESHOLDS.blankLuminance);
  const inert = meanAbsoluteDelta < EFFECT_AUDIT_THRESHOLDS.inertMeanAbsoluteDelta
    && changedPixelRatio < EFFECT_AUDIT_THRESHOLDS.inertChangedPixelRatio;

  return {
    meanAbsoluteDelta,
    changedPixelRatio,
    luminanceMean,
    luminanceVariance,
    blank,
    inert,
  };
}
