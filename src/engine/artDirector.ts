/**
 * Art Director — the design brain behind every mosh.
 *
 * Random effect stacks read as noise. A stack that a person would build reads
 * as a *look*. This module replaces blind randomisation with the way a colourist
 * or VFX artist actually assembles a frame:
 *
 *   1. LOOK at the content     → `analyzeSource` measures the real pixels
 *   2. Decide what it NEEDS    → `briefFrom` turns measurements into a brief
 *   3. Pick an art direction   → `chooseLook` scores named looks against it
 *   4. Compose in role order   → GRADE → FORM → ACCENT → FINISH
 *
 * The role order is the frame of reference. Every stack is the same four-part
 * sentence, so two consecutive rolls read as two takes on one idea rather than
 * two unrelated piles — and the look is *named*, so the user can see the intent
 * instead of guessing at it.
 *
 * Re-rolling one semantic role swaps that part of the sentence and leaves the
 * grammar intact.
 */
import { EFFECTS, EFFECTS_BY_ID } from "./effects";
import { tileVerdict } from "./tileSafety";
import type { BlendMode, LayerRegion, RegionMode } from "./blend";

/**
 * A complementary pair of masks that between them cover the frame.
 *
 * Two effects confined to opposite halves are not competing for the same
 * pixels, so both can run at full strength and neither muddies the other.
 * That is the lever that lets a stack be violent without turning to soup —
 * and it is also what "break, bend and twist certain portions of the frame"
 * actually requires, since a mask is the only way an effect can be told to
 * apply *there* and not everywhere.
 */
function rollPartition(rand: () => number, wildness: number): { a: LayerRegion; b: LayerRegion } {
  const kind = rand();
  const feather = 0.03 + rand() * 0.16 * (1 - wildness * 0.5);

  // Depth split — subject against room. The most legible partition, because
  // the seam falls on something the eye already reads as an object.
  if (kind < 0.40) {
    const subjectFirst = rand() < 0.5;
    const gate = 0.32 + rand() * 0.2;
    const f = Math.max(0.05, feather);
    return {
      a: { mode: subjectFirst ? "foreground" : "background", gate, feather: f },
      b: { mode: subjectFirst ? "background" : "foreground", gate, feather: f },
    };
  }

  // Shattered plate. Hard edges, so the two treatments read as broken apart
  // rather than blended.
  if (kind < 0.66) {
    const scale = 3 + Math.round(rand() * (6 + wildness * 18));
    const phase = rand() * 100;
    return {
      a: { mode: "shards", scale, phase, gate: 0.5, feather: 0.02 },
      b: { mode: "shards", scale, phase, gate: 0.5, feather: 0.02, invert: true },
    };
  }

  // Interleaved strata — a scanline rip at high counts, a hard split at low.
  if (kind < 0.89) {
    const mode: RegionMode = rand() < 0.35 ? "vbands" : "hbands";
    const scale = 2 + Math.round(rand() * (5 + wildness * 20));
    return {
      a: { mode, scale, phase: rand(), feather },
      b: { mode, scale, phase: rand(), feather, invert: true },
    };
  }

  // Centre against surround.
  const scale = 0.18 + rand() * 0.36;
  const f = 0.04 + rand() * 0.22;
  return {
    a: { mode: "radial", scale, feather: f },
    b: { mode: "radial", scale, feather: f, invert: true },
  };
}

/* ────────────────────────────────────────────────────────────────────────
   1. Looking at the content
   ────────────────────────────────────────────────────────────────────── */

export type SourceStats = {
  /** Mean luminance, 0..1. */
  brightness: number;
  /** Spread of luminance, 0..1. Low = flat, high = punchy. */
  contrast: number;
  /** Mean chroma, 0..1. Low = near-monochrome. */
  saturation: number;
  /** Sobel edge density, 0..1. Low = clean/empty, high = busy/detailed. */
  density: number;
  /** Warm/cool balance, 0..1 (0.5 = neutral). */
  warmth: number;
  /** How many distinct hues are present, 0..1. */
  hueSpread: number;
  /** Fraction of pixels crushed to black — detail already lost in shadow. */
  clipLow: number;
  /** Fraction of pixels blown to white. */
  clipHigh: number;
  /** Luminance centre of gravity, 0..1. */
  balanceX?: number;
  balanceY?: number;
  /** How strongly visual energy gathers near the centre rather than edges. */
  centerWeight?: number;
};

export const NEUTRAL_STATS: SourceStats = {
  brightness: 0.5, contrast: 0.4, saturation: 0.4,
  density: 0.4, warmth: 0.5, hueSpread: 0.4,
  clipLow: 0, clipHigh: 0, balanceX: 0.5, balanceY: 0.5, centerWeight: 0.5,
};

/** Reused sampling surface — analysis runs on every mosh, so don't reallocate. */
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;
const SAMPLE_W = 128;
const SAMPLE_H = 72;

/**
 * Measure the entire live source. Browser downsampling integrates the full
 * frame into representative pixels, so no region is skipped while analysis
 * remains safely outside the render loop.
 *
 * Works for both <video> and <img>, which matters because MOSH is
 * camera-first — the existing palette worker only ever ran on still images, so
 * the live path had no analysis at all.
 */
export function analyzeSource(el: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | null): SourceStats {
  if (!el || typeof document === "undefined") return { ...NEUTRAL_STATS };
  try {
    const w = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || (el as HTMLCanvasElement).width || 0;
    const h = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || (el as HTMLCanvasElement).height || 0;
    if (!w || !h) return { ...NEUTRAL_STATS };

    if (!sampleCanvas) {
      sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = SAMPLE_W;
      sampleCanvas.height = SAMPLE_H;
      sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (!sampleCtx) return { ...NEUTRAL_STATS };

    sampleCtx.drawImage(el, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = sampleCtx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    return statsFromPixels(data, SAMPLE_W, SAMPLE_H);
  } catch {
    // Tainted canvas (cross-origin source) — fall back rather than throw.
    return { ...NEUTRAL_STATS };
  }
}

/** Pure pixel maths, split out so it can be tested without a DOM. */
export function statsFromPixels(data: Uint8ClampedArray | number[], w: number, h: number): SourceStats {
  const n = w * h;
  if (!n) return { ...NEUTRAL_STATS };

  const lum = new Float32Array(n);
  let lSum = 0, lSq = 0, satSum = 0, warmSum = 0, clipLow = 0, clipHigh = 0;
  let energySum = 0, energyX = 0, energyY = 0, centerEnergy = 0;
  const hueBins = new Array(12).fill(0);

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const l = r * 0.299 + g * 0.587 + b * 0.114;
    lum[i] = l;
    lSum += l; lSq += l * l;
    if (l < 0.02) clipLow++;
    if (l > 0.98) clipHigh++;

    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const chroma = mx - mn;
    satSum += mx <= 0 ? 0 : chroma / mx;
    warmSum += (r - b) * 0.5 + 0.5;
    const x = (i % w) / Math.max(1, w - 1);
    const y = Math.floor(i / w) / Math.max(1, h - 1);
    const energy = 0.08 + l + chroma * 0.8;
    energySum += energy; energyX += energy * x; energyY += energy * y;
    const dx = x - 0.5, dy = y - 0.5;
    centerEnergy += energy * Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.707);

    // Only colourful pixels get a vote on hue spread; grey pixels have no hue.
    if (chroma > 0.12) {
      let hue: number;
      if (mx === r) hue = ((g - b) / chroma + 6) % 6;
      else if (mx === g) hue = (b - r) / chroma + 2;
      else hue = (r - g) / chroma + 4;
      hueBins[Math.min(11, Math.floor((hue / 6) * 12))]++;
    }
  }

  const brightness = lSum / n;
  // Standard deviation of luminance, scaled so ~0.35 sd reads as full contrast.
  const contrast = Math.min(1, Math.sqrt(Math.max(0, lSq / n - brightness * brightness)) / 0.35);

  // Sobel edge density on the luminance plane.
  let edge = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1]
               - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
      const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1]
               - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
      edge += Math.sqrt(gx * gx + gy * gy);
    }
  }
  const density = Math.min(1, edge / Math.max(1, (w - 2) * (h - 2)) / 1.5);
  const occupied = hueBins.filter(b => b > n * 0.01).length;

  return {
    brightness,
    contrast,
    saturation: Math.min(1, satSum / n),
    density,
    warmth: Math.min(1, Math.max(0, warmSum / n)),
    hueSpread: occupied / 12,
    clipLow: clipLow / n,
    clipHigh: clipHigh / n,
    balanceX: energyX / Math.max(0.0001, energySum),
    balanceY: energyY / Math.max(0.0001, energySum),
    centerWeight: centerEnergy / Math.max(0.0001, energySum),
  };
}

/* ────────────────────────────────────────────────────────────────────────
   2. What the frame needs
   ────────────────────────────────────────────────────────────────────── */

/**
 * The brief: not what the frame *is*, but what it's missing. Every value is
 * 0..1 where 1 means "this frame badly wants more of this".
 */
export type FrameBrief = SourceStats & {
  needsLift: number;        // too dark
  needsCompression: number; // too bright / blown
  needsContrast: number;    // flat
  needsColor: number;       // washed out or monochrome
  needsStructure: number;   // empty frame, nothing to look at
  needsRestraint: number;   // already busy — do not add more noise
};

export function briefFrom(s: SourceStats): FrameBrief {
  return {
    ...s,
    needsLift: clamp01((0.42 - s.brightness) / 0.42),
    needsCompression: clamp01((s.brightness - 0.62) / 0.38 + s.clipHigh * 2),
    needsContrast: clamp01(1 - s.contrast / 0.7),
    needsColor: clamp01(1 - (s.saturation * 0.7 + s.hueSpread * 0.3) / 0.55),
    needsStructure: clamp01(1 - s.density / 0.55),
    needsRestraint: clamp01((s.density - 0.45) / 0.55),
  };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ────────────────────────────────────────────────────────────────────────
   3. The grammar — what each effect is *for*
   ────────────────────────────────────────────────────────────────────── */

/** Where an effect belongs in the composition, bottom to top. */
export type Role = "grade" | "form" | "accent" | "finish";

export const ROLES: Role[] = ["grade", "form", "accent", "finish"];

export const ROLE_LABELS: Record<Role, string> = {
  grade: "GRADE",
  form: "FORM",
  accent: "ACCENT",
  finish: "FINISH",
};

export const ROLE_BLURBS: Record<Role, string> = {
  grade: "tone & colour foundation",
  form: "structure and movement",
  accent: "the signature detail",
  finish: "light, bloom and atmosphere",
};

/** How polished an effect reads. Cinematic is the house default. */
export type Fidelity = "cinematic" | "neutral" | "lofi";

export type Craft = {
  role: Role;
  fidelity: Fidelity;
  /** What it contributes, 0..1. */
  gives: { contrast?: number; color?: number; structure?: number; light?: number };
  /** How much source detail it destroys, 0..1 — the stack has a budget. */
  cost: number;
  /**
   * Measured GPU cost as a multiple of a trivial passthrough pass, from an
   * in-browser benchmark of every shader. Omitted means ~1x (cheap).
   *
   * The stack spends against a GPU budget as well as a detail budget, so a
   * composition can never stack four of the most expensive effects and drop
   * frames. This is the structural half of "no lag" — the other half is the
   * shaders themselves being cheap.
   */
  gpu?: number;
  /**
   * How completely it overwrites the frame's own colour, 0..1.
   *
   * A grade that *enriches* (contrast, warmth, a duotone push) still reads as
   * the original shot. One that fully remaps hue — rainbow ramps, thermal
   * palettes, oil-slick iridescence — replaces it. Both are useful, but
   * reaching for a replacement every time is what makes output look like a
   * filter box instead of a remaster, so these are held back unless the look
   * specifically calls for one.
   */
  replaces?: number;
};

/**
 * Role and fidelity for every effect the director can pick. This is the taste
 * layer: it's what lets the director reach for `godRays` when a frame needs
 * light and `posterize` only when the look actually wants a poster.
 */
const CRAFT: Record<string, Craft> = {
  // ── GRADE ──────────────────────────────────────────────────────────
  filmicTone:      { role: "grade", fidelity: "cinematic", gives: { contrast: 1.0, color: 0.3 }, cost: 0.1, replaces: 0.05 },
  hueRotate:       { role: "grade", fidelity: "neutral",   gives: { color: 0.8 }, cost: 0.1, replaces: 0.55 },
  solarize:        { role: "grade", fidelity: "neutral",   gives: { contrast: 0.7, color: 0.5 }, cost: 0.35, replaces: 0.5 },
  rainbowMap:      { role: "grade", fidelity: "neutral",   gives: { color: 1.0 }, cost: 0.5, replaces: 0.95 },
  thermal:         { role: "grade", fidelity: "cinematic", gives: { color: 0.9, contrast: 0.5 }, cost: 0.45, replaces: 0.85 },
  duotone:         { role: "grade", fidelity: "cinematic", gives: { color: 0.7, contrast: 0.6 }, cost: 0.4, replaces: 0.6 },
  infraredDream:   { role: "grade", fidelity: "cinematic", gives: { color: 0.85 }, cost: 0.4, replaces: 0.8 },
  oilSlick:        { role: "grade", fidelity: "cinematic", gives: { color: 0.9 }, cost: 0.35, replaces: 0.85 },
  acrylicBleed:    { role: "grade", fidelity: "cinematic", gives: { color: 0.9, contrast: 0.2 }, cost: 0.45, gpu: 3.6, replaces: 0.75 },
  liquidChrome:    { role: "grade", fidelity: "cinematic", gives: { contrast: 0.8, light: 0.6 }, cost: 0.5, gpu: 3.5, replaces: 0.55 },
  prismDispersion: { role: "grade", fidelity: "cinematic", gives: { color: 0.85, light: 0.4 }, cost: 0.25, gpu: 5.9 },
  colorQuake:      { role: "grade", fidelity: "neutral",   gives: { color: 0.8, contrast: 0.4 }, cost: 0.35, replaces: 0.5 },
  voltage:         { role: "grade", fidelity: "neutral",   gives: { contrast: 0.8, color: 0.5 }, cost: 0.4, gpu: 2.2 },
  chromaPulse:     { role: "grade", fidelity: "neutral",   gives: { color: 0.7 }, cost: 0.25 },
  noiseTint:       { role: "grade", fidelity: "lofi",      gives: { color: 0.4 }, cost: 0.3, replaces: 0.4 },
  vhsBleed:        { role: "grade", fidelity: "lofi",      gives: { color: 0.5 }, cost: 0.45, replaces: 0.4 },
  posterize:       { role: "grade", fidelity: "lofi",      gives: { contrast: 0.6 }, cost: 0.6, replaces: 0.5 },
  paletteDither:   { role: "grade", fidelity: "lofi",      gives: { color: 0.4 }, cost: 0.65, replaces: 0.7 },
  bitCrush:        { role: "grade", fidelity: "lofi",      gives: { contrast: 0.4 }, cost: 0.7, replaces: 0.5 },
  scanlines:       { role: "grade", fidelity: "lofi",      gives: {}, cost: 0.35 },

  halftone:         { role: "grade", fidelity: "lofi", gives: { color: 0.4, contrast: 0.6 }, cost: 0.6, gpu: 2.6, replaces: 0.75 },
  crossHatch:       { role: "grade", fidelity: "lofi", gives: { contrast: 0.8 }, cost: 0.7, replaces: 0.8 },
  kuwahara:         { role: "grade", fidelity: "cinematic", gives: { }, cost: 0.35, gpu: 10.5, replaces: 0.15 },
  anaglyph:         { role: "grade", fidelity: "neutral", gives: { color: 0.5 }, cost: 0.25, replaces: 0.35 },
  photocopy:        { role: "grade", fidelity: "lofi", gives: { contrast: 0.9 }, cost: 0.75, gpu: 6.6, replaces: 0.85 },
  contourMap:       { role: "grade", fidelity: "neutral", gives: { color: 0.85, contrast: 0.5 }, cost: 0.6, replaces: 0.8 },

  // ── FORM ───────────────────────────────────────────────────────────
  melt:            { role: "form", fidelity: "cinematic", gives: { structure: 0.7 }, cost: 0.4 },
  liquidWarp:      { role: "form", fidelity: "cinematic", gives: { structure: 0.8 }, cost: 0.4, gpu: 2.1 },
  ripple:          { role: "form", fidelity: "cinematic", gives: { structure: 0.6 }, cost: 0.3 },
  inkFlow:         { role: "form", fidelity: "cinematic", gives: { structure: 0.85 }, cost: 0.4, gpu: 3.4 },
  lensWarp:        { role: "form", fidelity: "cinematic", gives: { structure: 0.5 }, cost: 0.25 },
  zoomBlur:        { role: "form", fidelity: "cinematic", gives: { structure: 0.5, light: 0.4 }, cost: 0.45, gpu: 5.4 },
  perspectiveTilt: { role: "form", fidelity: "cinematic", gives: { structure: 0.6 }, cost: 0.3 },
  drosteTunnel:    { role: "form", fidelity: "cinematic", gives: { structure: 1.0 }, cost: 0.55 },
  voronoiShatter:  { role: "form", fidelity: "cinematic", gives: { structure: 0.95 }, cost: 0.5, gpu: 8.2 },
  crystalize:      { role: "form", fidelity: "cinematic", gives: { structure: 0.85 }, cost: 0.5, gpu: 7.7 },
  kaleidoscope:    { role: "form", fidelity: "neutral",   gives: { structure: 1.0 }, cost: 0.6 },
  mirror:          { role: "form", fidelity: "neutral",   gives: { structure: 0.8 }, cost: 0.4 },
  twirl:           { role: "form", fidelity: "neutral",   gives: { structure: 0.8 }, cost: 0.45 },
  fractalZoom:     { role: "form", fidelity: "neutral",   gives: { structure: 0.9 }, cost: 0.55, gpu: 3.9 },
  polarFold:       { role: "form", fidelity: "neutral",   gives: { structure: 0.9 }, cost: 0.55 },
  displacement:    { role: "form", fidelity: "neutral",   gives: { structure: 0.7 }, cost: 0.45, gpu: 2.2 },
  pageCurl:        { role: "form", fidelity: "neutral",   gives: { structure: 0.6 }, cost: 0.35 },
  pixelSort:       { role: "form", fidelity: "lofi",      gives: { structure: 0.7 }, cost: 0.5 },
  sliceDrift:      { role: "form", fidelity: "lofi",      gives: { structure: 0.6 }, cost: 0.5 },
  frameSmear:      { role: "form", fidelity: "cinematic", gives: { structure: 0.4 }, cost: 0.5, gpu: 4.6 },

  emboss:           { role: "form", fidelity: "cinematic", gives: { structure: 0.7, contrast: 0.5 }, cost: 0.5, gpu: 2.3 },
  extrude:         { role: "form", fidelity: "cinematic", gives: { structure: 0.85, contrast: 0.4 }, cost: 0.5, gpu: 4.5 },
  moire:            { role: "form", fidelity: "neutral", gives: { structure: 0.8, color: 0.5 }, cost: 0.55, gpu: 2.0 },
  slitScan:         { role: "form", fidelity: "neutral", gives: { structure: 0.8 }, cost: 0.5 },

  // ── ACCENT ─────────────────────────────────────────────────────────
  shockwave:       { role: "accent", fidelity: "cinematic", gives: { structure: 0.6, light: 0.5 }, cost: 0.3, gpu: 2.0 },
  rgbShift:        { role: "accent", fidelity: "cinematic", gives: { color: 0.5 }, cost: 0.2 },
  bufferEcho:      { role: "accent", fidelity: "cinematic", gives: { light: 0.4 }, cost: 0.35 },
  hexShatter:      { role: "accent", fidelity: "neutral",   gives: { structure: 0.8 }, cost: 0.5 },
  datamosh:        { role: "accent", fidelity: "neutral",   gives: { structure: 0.7 }, cost: 0.55 },
  jitter:          { role: "accent", fidelity: "neutral",   gives: {}, cost: 0.35 },
  scanFreeze:      { role: "accent", fidelity: "neutral",   gives: { light: 0.3 }, cost: 0.3 },
  pixelExplode:    { role: "accent", fidelity: "neutral",   gives: { structure: 0.7 }, cost: 0.5 },
  glitchTeleport:  { role: "accent", fidelity: "lofi",      gives: { structure: 0.6 }, cost: 0.6 },
  blockShift:      { role: "accent", fidelity: "lofi",      gives: { structure: 0.6 }, cost: 0.55 },
  compressionTears:{ role: "accent", fidelity: "lofi",      gives: { structure: 0.5 }, cost: 0.65 },
  scanBreak:       { role: "accent", fidelity: "lofi",      gives: {}, cost: 0.45 },
  scanlineWarp:    { role: "accent", fidelity: "lofi",      gives: { structure: 0.5 }, cost: 0.5 },
  asciiCollapse:   { role: "accent", fidelity: "lofi",      gives: { structure: 0.6 }, cost: 0.8 },
  staticSnow:      { role: "accent", fidelity: "lofi",      gives: {}, cost: 0.5 },

  rollingShutter:   { role: "accent", fidelity: "neutral", gives: { structure: 0.5 }, cost: 0.4 },
  echoTrails:       { role: "accent", fidelity: "cinematic", gives: { light: 0.4, structure: 0.4 }, cost: 0.4, gpu: 6.2 },

  // ── FINISH ─────────────────────────────────────────────────────────
  bloom:           { role: "finish", fidelity: "cinematic", gives: { light: 1.0 }, cost: 0.2, gpu: 6.4 },
  godRays:         { role: "finish", fidelity: "cinematic", gives: { light: 1.0 }, cost: 0.2, gpu: 5.1 },
  dreamGlow:       { role: "finish", fidelity: "cinematic", gives: { light: 0.85 }, cost: 0.25, gpu: 5.1 },
  auroraVeil:      { role: "finish", fidelity: "cinematic", gives: { light: 0.7, color: 0.7 }, cost: 0.25 },
  lightLeak:       { role: "finish", fidelity: "cinematic", gives: { light: 0.8, color: 0.5 }, cost: 0.2 },
  holoShine:       { role: "finish", fidelity: "cinematic", gives: { light: 0.7, color: 0.6 }, cost: 0.2 },
  fog:             { role: "finish", fidelity: "cinematic", gives: { light: 0.5 }, cost: 0.3 },
  dustMotes:       { role: "finish", fidelity: "cinematic", gives: { light: 0.4 }, cost: 0.1 },
  vignette:        { role: "finish", fidelity: "cinematic", gives: { contrast: 0.5 }, cost: 0.1 },
  filmGrain:       { role: "finish", fidelity: "neutral",   gives: {}, cost: 0.15 },
  neonContour:     { role: "finish", fidelity: "cinematic", gives: { structure: 0.7, light: 0.8 }, cost: 0.45, gpu: 4.0 },
  plasmaField:     { role: "finish", fidelity: "neutral",   gives: { color: 0.8, light: 0.6 }, cost: 0.4 },
  caustics:         { role: "finish", fidelity: "cinematic", gives: { light: 0.9 }, cost: 0.3, gpu: 2.0 },
  anamorphic:       { role: "finish", fidelity: "cinematic", gives: { light: 0.95 }, cost: 0.25, gpu: 6.5 },

  // Ported from the Lovable build — full-frame optical systems rather than
  // surface treatments, which is what separates them from this library's own
  // caustics / moire / contourMap.
  feedbackTunnel:   { role: "form",   fidelity: "cinematic", gives: { structure: 0.95 }, cost: 0.65, gpu: 1.6 },
  moirePulse:       { role: "form",   fidelity: "neutral",   gives: { structure: 0.8, color: 0.7 }, cost: 0.55, replaces: 0.7 },
  topoContour:      { role: "grade",  fidelity: "neutral",   gives: { color: 1.0, contrast: 0.6 }, cost: 0.5, replaces: 0.9 },
  causticWater:     { role: "finish", fidelity: "cinematic", gives: { light: 0.9, color: 0.4 }, cost: 0.3, gpu: 3.2 },

  // Temporal — the only effects that sample uFeedback, so they read as motion
  // and memory rather than as a filter. All are single-pass and cheap on GPU
  // (one or two extra texture fetches); their real expense is that they hold
  // the frame, which is why they carry real detail cost.
  trailDecay:       { role: "accent", fidelity: "neutral",   gives: { light: 0.6, structure: 0.3 }, cost: 0.45, gpu: 2.4 },
  motionMomentum:   { role: "accent", fidelity: "neutral",   gives: { structure: 0.7 }, cost: 0.5, gpu: 3.0 },
  timeDisplace:     { role: "accent", fidelity: "neutral",   gives: { structure: 0.6, color: 0.3 }, cost: 0.5, gpu: 1.8 },
  // Form, not accent: it re-projects the whole frame rather than decorating it.
  infiniteZoom:     { role: "form",   fidelity: "cinematic", gives: { structure: 0.9 }, cost: 0.6, gpu: 1.9 },
  reactionBloom:    { role: "finish", fidelity: "cinematic", gives: { light: 0.85, structure: 0.4 }, cost: 0.4, gpu: 2.6 },

  // ── DIMENSIONAL ────────────────────────────────────────────────────
  // All `form`, and deliberately the strongest structure values in the table.
  // Every other form effect re-projects one flat sheet; these move the subject
  // independently of the room behind them, or show two parts of the frame at
  // two different moments. That is a different kind of claim on the image, so
  // they carry high cost — the director should spend a whole stack's structure
  // budget on one of them rather than stacking two.
  depthShear:      { role: "form", fidelity: "cinematic", gives: { structure: 1.0 }, cost: 0.6, gpu: 1.4 },
  dimensionSplit:  { role: "form", fidelity: "cinematic", gives: { structure: 1.0, light: 0.5 }, cost: 0.7, gpu: 1.6 },
  timeShatter:     { role: "form", fidelity: "neutral",   gives: { structure: 1.0 }, cost: 0.75, gpu: 2.8 },
  parallaxExplode: { role: "form", fidelity: "cinematic", gives: { structure: 0.95 }, cost: 0.6, gpu: 1.4 },
  depthEcho:       { role: "form", fidelity: "cinematic", gives: { structure: 0.7, light: 0.5 }, cost: 0.55, gpu: 3.4 },
  strataSlice:     { role: "form", fidelity: "neutral",   gives: { structure: 0.95 }, cost: 0.7, gpu: 2.6 },
  chronoBleed:     { role: "form", fidelity: "cinematic", gives: { structure: 0.7, color: 0.7 }, cost: 0.55, gpu: 2.4 },
  volumetricPull:  { role: "form", fidelity: "cinematic", gives: { structure: 0.9 }, cost: 0.6, gpu: 1.5 },

  // ── FLOW & OPTICS ──────────────────────────────────────────────────
  // Flow effects follow real motion, so they are `form` — they restructure.
  // The optics set is graded by what it models: aberration and CRT are colour
  // and atmosphere treatments, glass genuinely re-projects.
  flowSmear:       { role: "form",   fidelity: "cinematic", gives: { structure: 0.85, light: 0.3 }, cost: 0.55, gpu: 3.6 },
  flowTurbulence:  { role: "form",   fidelity: "cinematic", gives: { structure: 0.95 }, cost: 0.6, gpu: 2.0 },
  glassRefract:    { role: "form",   fidelity: "cinematic", gives: { structure: 0.8, light: 0.5 }, cost: 0.55, gpu: 3.4 },
  mandalaBloom:    { role: "form",   fidelity: "cinematic", gives: { structure: 1.0 }, cost: 0.65, gpu: 1.5 },
  chromaAberrate:  { role: "accent", fidelity: "cinematic", gives: { color: 0.6, light: 0.2 }, cost: 0.2, gpu: 2.2 },
  crtPhosphor:     { role: "finish", fidelity: "lofi",      gives: { contrast: 0.5 }, cost: 0.5, gpu: 4.4, replaces: 0.4 },
  volumetricShaft: { role: "finish", fidelity: "cinematic", gives: { light: 1.0 }, cost: 0.3, gpu: 6.0 },
  emberField:      { role: "finish", fidelity: "cinematic", gives: { light: 0.8, color: 0.4 }, cost: 0.3, gpu: 2.6 },
  prismFlame:      { role: "finish", fidelity: "cinematic", gives: { light: 0.9, color: 0.7 }, cost: 0.5, gpu: 6.0 },

  // ── DESTRUCTION INDEX EXPANSION ────────────────────────────────────
  invert:          { role: "grade",  fidelity: "neutral",   gives: { contrast: 0.6, color: 0.3 }, cost: 0.5, replaces: 0.6 },
  threshold:       { role: "grade",  fidelity: "lofi",      gives: { contrast: 1.0 }, cost: 0.75, replaces: 0.7 },
  selfBlend:       { role: "grade",  fidelity: "cinematic", gives: { contrast: 0.6, structure: 0.3 }, cost: 0.4 },
  syncRoll:        { role: "accent", fidelity: "lofi",      gives: { structure: 0.4 }, cost: 0.5 },
  interlaceComb:   { role: "accent", fidelity: "lofi",      gives: { structure: 0.3 }, cost: 0.45, gpu: 1.5 },
  signalDropout:   { role: "accent", fidelity: "lofi",      gives: {}, cost: 0.5 },
  keyingHalo:      { role: "finish", fidelity: "cinematic", gives: { light: 0.6, color: 0.3 }, cost: 0.3, gpu: 1.8 },
  cameraShake:     { role: "form",   fidelity: "neutral",   gives: { structure: 0.3 }, cost: 0.3 },
  zoomPunch:       { role: "form",   fidelity: "cinematic", gives: { structure: 0.5, light: 0.2 }, cost: 0.35 },
  paperGrain:      { role: "finish", fidelity: "neutral",   gives: {}, cost: 0.15 },
};

export function craftOf(id: string): Craft | null {
  return CRAFT[id] ?? null;
}

/**
 * Which of an effect's own params is its true "amount" — paramsForRole
 * (below) drives that one from the brief/push and leaves the rest for
 * character variation. Convention is params[0], which fits most of the
 * collection fine. This table only holds the exceptions, verified against
 * each effect's actual shader rather than guessed from the param name
 * alone — a name that merely *differs* from "amount" (persistence, flow,
 * punch...) but still means "more = stronger" doesn't need an entry here;
 * only the ones where pushing params[0] toward its max is actually wrong —
 * either the wrong direction (posterize's levels, bitCrush's bits: fewer
 * is stronger) or not a magnitude at all (mirror's axis is a mode switch;
 * kaleidoscope-style segment/band/cell counts are structure, not "amount").
 *
 * `key: null` opts an effect out of the amount concept entirely — every
 * param falls back to character variation instead of one being forced
 * into a role it doesn't fit.
 */
const STRENGTH_OVERRIDES: Record<string, { key: string | null; direction?: "down" }> = {
  // "Levels" pushed toward its max is *fewer* discretization steps removed
  // — the opposite of more posterization. Fewer levels is the stronger end.
  posterize: { key: "levels", direction: "down" },
  // Axis is a horizontal/vertical mode switch (see the shader: `uAxis < 0.5`
  // picks which side folds) — there's no "more axis," so this opts out
  // rather than quietly biasing which axis gets picked as push rises.
  mirror: { key: null },
  // Fewer bits is more crushed, same shape as posterize's levels.
  bitCrush: { key: "bits", direction: "down" },
  // depthEcho already has an explicit "strength" param (index 1) — using
  // it directly beats guessing at "reach" (index 0).
  depthEcho: { key: "strength" },
  // zoom ranges -1..1 (zoom out vs. zoom in), not a 0..1 magnitude — "feed"
  // (how much trail is fed back in) is the actual intensity knob.
  infiniteZoom: { key: "feed" },
  // speed/spin/zoom are all motion-character params — none of the three is
  // "how much of this effect is applied," so this opts out entirely.
  feedbackTunnel: { key: null },
  // slices/spin/zoom: slice count is structure, spin/zoom are motion —
  // same situation as feedbackTunnel, no clean amount among the three.
  mandalaBloom: { key: null },
  // Band *count* is structure, not intensity — timeSpread (how far the
  // bands scatter through time) is the actual amount knob.
  strataSlice: { key: "timeSpread" },
  // Cell *count* is structure — spread (how far shards displace) is the
  // amount knob, same reasoning as strataSlice.
  timeShatter: { key: "spread" },
  // Curvature is the tube's screen-warp shape, not effect intensity — mask
  // (the phosphor shadow-mask stripe visibility) is what actually scales
  // "how much CRT" is applied (see the shader's `mix(..., uMask * 0.55)`).
  crtPhosphor: { key: "mask" },
  // Threshold pushed toward its max means *fewer* edges clear the
  // smoothstep gate — fewer glowing contours, not more (see the shader's
  // `t = mix(0.06, 0.9, uThreshold)` then `smoothstep(t*0.45, t, e)`).
  neonContour: { key: "threshold", direction: "down" },
};

/** The param key driving an effect's "amount," and which direction (up its
 *  own range, or down) makes it stronger — params[0] unless overridden
 *  above, `null` if this effect has no single knob that means "amount." */
export function strengthParamFor(effectId: string): { key: string | null; direction: "up" | "down" } {
  const override = STRENGTH_OVERRIDES[effectId];
  if (override) return { key: override.key, direction: override.direction ?? "up" };
  const first = EFFECTS_BY_ID[effectId]?.params[0];
  return { key: first?.key ?? null, direction: "up" };
}

/** Every effect that can serve a role. `tileSafe` narrows it to the ones that
 *  survive seamless tiling (see tileSafety.ts for what breaks it). */
export function poolForRole(role: Role, tileSafe = false): string[] {
  return Object.keys(CRAFT).filter(id =>
    CRAFT[id].role === role && EFFECTS_BY_ID[id] && (!tileSafe || tileVerdict(id).safe));
}

/* ────────────────────────────────────────────────────────────────────────
   4. Art directions
   ────────────────────────────────────────────────────────────────────── */

export type Look = {
  id: string;
  name: string;
  blurb: string;
  /** Preferred effects per role. The director may fall back to the wider
   *  role pool, but these define the look's character. */
  picks: Partial<Record<Role, string[]>>;
  /** What kind of frame this look flatters. Scored against the brief. */
  suits: Partial<Record<keyof FrameBrief, number>>;
  /** Overall push, 0..1 — scales param deviation and layer opacity. */
  drive: number;
  /**
   * Built entirely from tile-safe effects, for seamless pattern work.
   *
   * A separate deck rather than a filter over the main one, because most of
   * the main deck cannot survive tiling and the ones that can't are not
   * fixable: VORTEX, MANDALA BURST and INFINITE TUNNEL are *defined* by
   * centre-relative geometry, and a centre is by definition not repeatable.
   * Filtering those looks to their tile-safe picks would leave a look that no
   * longer resembles its own name. So seamless mode gets looks composed for
   * it, and these are used only there — see chooseLook's `tileSafe`.
   */
  seamless?: boolean;
};

/**
 * Twelve named looks. Most are cinematic; SIGNAL DECAY keeps a deliberate
 * lo-fi datamosh in the deck, but art-directed rather than random, so grit is
 * a choice the director makes for a reason instead of the default texture.
 */
export const LOOKS: Look[] = [
  {
    id: "chromeNoir", name: "CHROME NOIR", blurb: "Polished metal, deep falloff.",
    picks: { grade: ["liquidChrome", "filmicTone", "duotone", "photocopy", "invert"], form: ["lensWarp", "perspectiveTilt", "zoomBlur", "emboss", "cameraShake"],
             accent: ["rgbShift", "bufferEcho", "jitter"], finish: ["vignette", "godRays", "filmGrain", "anamorphic"] },
    suits: { saturation: -0.6, contrast: 0.5, needsColor: 0.3 }, drive: 0.5,
  },
  {
    id: "neonRain", name: "NEON RAIN", blurb: "Everything traced in light.",
    picks: { grade: ["duotone", "chromaPulse", "voltage", "hueRotate"], form: ["ripple", "liquidWarp", "displacement", "flowTurbulence"],
             accent: ["rgbShift", "shockwave", "chromaAberrate", "scanlineWarp"], finish: ["neonContour", "bloom", "volumetricShaft"] },
    suits: { density: 0.7, brightness: -0.5, needsLift: 0.4 }, drive: 0.65,
  },
  {
    id: "solarBloom", name: "SOLAR BLOOM", blurb: "Blown-out warmth and haze.",
    picks: { grade: ["thermal", "chromaPulse", "solarize"], form: ["zoomBlur", "lensWarp", "ripple", "liquidWarp"],
             accent: ["bufferEcho", "rgbShift", "echoTrails"], finish: ["godRays", "bloom", "lightLeak", "anamorphic"] },
    suits: { warmth: 0.7, brightness: 0.4, needsLift: 0.5 }, drive: 0.55,
  },
  {
    id: "prismDrift", name: "PRISM DRIFT", blurb: "Light split into its spectrum.",
    picks: { grade: ["prismDispersion", "oilSlick", "contourMap", "rainbowMap"], form: ["lensWarp", "drosteTunnel", "ripple", "glassRefract"],
             accent: ["rgbShift", "shockwave", "chromaAberrate"], finish: ["holoShine", "bloom", "dustMotes", "caustics"] },
    suits: { needsColor: 0.9, saturation: -0.4 }, drive: 0.6,
  },
  {
    id: "deepVoid", name: "DEEP VOID", blurb: "Weight, shadow and drift.",
    picks: { grade: ["filmicTone", "duotone", "infraredDream", "crossHatch", "noiseTint", "selfBlend"], form: ["frameSmear", "perspectiveTilt", "melt", "volumetricPull"],
             accent: ["bufferEcho", "scanFreeze", "echoTrails", "trailDecay"], finish: ["fog", "vignette", "dustMotes", "volumetricShaft", "paperGrain"] },
    suits: { needsCompression: 0.8, brightness: 0.3, clipHigh: 0.5 }, drive: 0.45,
  },
  {
    id: "liquidDream", name: "LIQUID DREAM", blurb: "Soft-focus flow, no hard edges.",
    picks: { grade: ["oilSlick", "chromaPulse", "kuwahara", "acrylicBleed"], form: ["inkFlow", "melt", "liquidWarp", "flowSmear"],
             accent: ["bufferEcho", "rgbShift", "trailDecay"], finish: ["dreamGlow", "bloom", "auroraVeil", "causticWater", "fog"] },
    suits: { needsContrast: 0.5, density: -0.5, needsStructure: 0.4 }, drive: 0.5,
  },
  {
    id: "glassFracture", name: "GLASS FRACTURE", blurb: "The frame under stress.",
    picks: { grade: ["liquidChrome", "filmicTone", "voltage", "prismDispersion", "threshold"], form: ["voronoiShatter", "crystalize", "kaleidoscope", "glassRefract", "extrude", "pageCurl", "cameraShake"],
             accent: ["shockwave", "hexShatter", "chromaAberrate"], finish: ["holoShine", "bloom", "vignette", "caustics"] },
    suits: { needsStructure: 0.9, density: -0.4 }, drive: 0.7,
  },
  {
    id: "auroraVeil", name: "AURORA VEIL", blurb: "Slow colour drifting over dark.",
    picks: { grade: ["infraredDream", "hueRotate", "chromaPulse"], form: ["polarFold", "ripple", "liquidWarp", "flowTurbulence"],
             accent: ["bufferEcho", "scanFreeze", "echoTrails", "trailDecay"], finish: ["auroraVeil", "dreamGlow", "dustMotes", "reactionBloom", "fog"] },
    suits: { brightness: -0.6, needsColor: 0.5, needsLift: 0.5 }, drive: 0.45,
  },
  {
    id: "vortex", name: "VORTEX", blurb: "Everything pulled to one point.",
    picks: { grade: ["oilSlick", "filmicTone", "colorQuake", "hueRotate"], form: ["drosteTunnel", "twirl", "fractalZoom", "infiniteZoom", "moirePulse", "zoomPunch"],
             accent: ["shockwave", "pixelExplode", "chromaAberrate", "echoTrails"], finish: ["bloom", "godRays", "vignette", "anamorphic"] },
    suits: { needsStructure: 0.7, contrast: 0.3 }, drive: 0.8,
  },
  {
    id: "titanium", name: "TITANIUM", blurb: "Desaturated, sharp, expensive.",
    picks: { grade: ["filmicTone", "liquidChrome", "posterize", "crossHatch", "halftone", "photocopy", "threshold", "selfBlend"], form: ["perspectiveTilt", "lensWarp", "mirror", "emboss"],
             accent: ["rgbShift", "jitter", "scanFreeze"], finish: ["vignette", "filmGrain", "godRays", "anamorphic", "paperGrain"] },
    suits: { saturation: -0.7, needsContrast: 0.4, density: 0.3 }, drive: 0.4,
  },
  {
    id: "infraBloom", name: "INFRA BLOOM", blurb: "Heat-mapped and glowing.",
    picks: { grade: ["thermal", "infraredDream", "contourMap", "chromaPulse"], form: ["ripple", "zoomBlur", "melt", "liquidWarp"],
             accent: ["shockwave", "rgbShift", "echoTrails", "chromaAberrate"], finish: ["bloom", "dreamGlow", "lightLeak", "volumetricShaft"] },
    suits: { needsColor: 0.8, saturation: -0.5, needsContrast: 0.3 }, drive: 0.6,
  },
  {
    id: "signalDecay", name: "SIGNAL DECAY", blurb: "Tape damage, held together on purpose.",
    picks: { grade: ["vhsBleed", "posterize", "bitCrush", "noiseTint", "scanlines", "photocopy", "invert"], form: ["pixelSort", "sliceDrift", "displacement", "slitScan"],
             accent: ["datamosh", "blockShift", "compressionTears", "staticSnow", "glitchTeleport", "scanlineWarp", "rollingShutter", "syncRoll", "signalDropout", "interlaceComb"], finish: ["filmGrain", "vignette", "fog", "crtPhosphor", "paperGrain"] },
    suits: { density: 0.5, needsRestraint: -0.3, contrast: 0.3 }, drive: 0.75,
  },

  /* The dimensional looks.
     These exist to give the director a reason to reach for the depth proxy and
     the time ring. Their grade and finish picks are deliberately restrained —
     a form effect that is pulling the subject out of the room needs the rest of
     the stack to stay out of its way, or the separation it just carved gets
     painted back over. */
  {
    id: "riftPlane", name: "RIFT PLANE", blurb: "You and the room stop sharing one space.",
    picks: { grade: ["filmicTone", "duotone", "liquidChrome", "anaglyph"],
             form: ["dimensionSplit", "depthShear", "volumetricPull", "extrude", "pageCurl"],
             accent: ["rgbShift", "shockwave", "bufferEcho", "chromaAberrate"],
             finish: ["vignette", "godRays", "anamorphic", "volumetricShaft"] },
    suits: { contrast: 0.4, needsContrast: 0.3, density: 0.3 }, drive: 0.7,
  },
  {
    id: "chronoFracture", name: "CHRONO FRACTURE", blurb: "Every shard of the frame on its own clock.",
    picks: { grade: ["filmicTone", "chromaPulse", "voltage", "posterize"],
             form: ["timeShatter", "strataSlice", "chronoBleed", "cameraShake"],
             accent: ["jitter", "rgbShift", "scanFreeze", "rollingShutter", "scanlineWarp", "glitchTeleport", "interlaceComb", "signalDropout"],
             finish: ["filmGrain", "vignette", "bloom", "crtPhosphor"] },
    suits: { density: 0.5, needsColor: 0.3 }, drive: 0.8,
  },
  {
    id: "eventHorizon", name: "EVENT HORIZON", blurb: "The near world tears outward and leaves ghosts.",
    picks: { grade: ["infraredDream", "thermal", "filmicTone", "chromaPulse"],
             form: ["parallaxExplode", "depthEcho", "volumetricPull", "zoomPunch", "cameraShake"],
             accent: ["echoTrails", "bufferEcho", "shockwave", "trailDecay"],
             finish: ["godRays", "dreamGlow", "anamorphic", "volumetricShaft", "keyingHalo"] },
    suits: { brightness: -0.3, needsLift: 0.4, needsColor: 0.4 }, drive: 0.75,
  },

  /* Named destinations.
     Each of these is one recognisable end state rather than a general mood —
     the picks are chosen so the combination lands somewhere specific, and the
     drive is set high because half-strength versions of these read as nothing
     in particular. They exist to give the director somewhere to actually aim. */
  {
    id: "mandalaBurst", name: "MANDALA BURST", blurb: "Psychedelic mandala explosion.",
    picks: { grade: ["rainbowMap", "hueRotate", "chromaPulse", "topoContour", "acrylicBleed"],
             form: ["mandalaBloom", "kaleidoscope", "polarFold", "fractalZoom", "zoomPunch"],
             accent: ["rgbShift", "chromaAberrate", "shockwave", "pixelExplode"],
             finish: ["bloom", "holoShine", "volumetricShaft", "prismFlame", "plasmaField", "keyingHalo"] },
    suits: { needsColor: 0.8, density: 0.3 }, drive: 0.88,
  },
  {
    id: "liquidMemory", name: "LIQUID MEMORY", blurb: "Flow that remembers where it's been.",
    picks: { grade: ["filmicTone", "oilSlick", "duotone", "kuwahara", "acrylicBleed"],
             form: ["flowTurbulence", "liquidWarp", "flowSmear", "melt"],
             accent: ["echoTrails", "bufferEcho", "trailDecay", "timeDisplace"],
             finish: ["dreamGlow", "fog", "auroraVeil", "causticWater", "reactionBloom"] },
    suits: { needsLift: 0.4, saturation: -0.2 }, drive: 0.72,
  },
  {
    id: "infiniteTunnel", name: "INFINITE TUNNEL", blurb: "An endless tunnel that never stops arriving.",
    picks: { grade: ["hueRotate", "rainbowMap", "infraredDream", "topoContour", "chromaPulse"],
             form: ["feedbackTunnel", "drosteTunnel", "infiniteZoom", "fractalZoom", "moire", "moirePulse"],
             accent: ["rgbShift", "chromaAberrate", "shockwave", "echoTrails"],
             finish: ["bloom", "neonContour", "dustMotes", "holoShine"] },
    suits: { needsColor: 0.7, density: 0.4 }, drive: 0.9,
  },
  {
    id: "cyberSpirit", name: "CYBER SPIRIT", blurb: "A body traced in light, the room left behind.",
    picks: { grade: ["duotone", "voltage", "thermal", "scanlines", "anaglyph", "invert"],
             form: ["depthShear", "depthEcho", "parallaxExplode", "dimensionSplit"],
             accent: ["rgbShift", "jitter", "chromaAberrate", "echoTrails"],
             finish: ["neonContour", "bloom", "emberField", "prismFlame", "volumetricShaft", "keyingHalo"] },
    suits: { brightness: -0.4, needsContrast: 0.4 }, drive: 0.8,
  },
  {
    id: "retroTape", name: "RETRO TAPE", blurb: "Retro digital nostalgia, badly preserved.",
    picks: { grade: ["vhsBleed", "posterize", "bitCrush", "paletteDither", "scanlines", "halftone", "solarize", "anaglyph", "threshold"],
             form: ["sliceDrift", "pixelSort", "slitScan", "moire", "displacement"],
             accent: ["datamosh", "blockShift", "compressionTears", "scanBreak", "staticSnow", "asciiCollapse", "syncRoll", "interlaceComb"],
             finish: ["crtPhosphor", "filmGrain", "vignette", "fog", "paperGrain"] },
    suits: { density: 0.4, contrast: 0.3 }, drive: 0.78,
  },
  {
    id: "crystalHallucination", name: "CRYSTAL HALLUCINATION", blurb: "Reality through cut glass.",
    picks: { grade: ["prismDispersion", "liquidChrome", "oilSlick"],
             form: ["glassRefract", "crystalize", "voronoiShatter", "kaleidoscope"],
             accent: ["chromaAberrate", "rgbShift", "shockwave", "hexShatter"],
             finish: ["bloom", "caustics", "holoShine", "prismFlame", "anamorphic"] },
    suits: { needsColor: 0.7, needsContrast: 0.3 }, drive: 0.82,
  },
  {
    id: "festivalPlasma", name: "FESTIVAL PLASMA", blurb: "Main-stage visuals, driven by the room.",
    picks: { grade: ["chromaPulse", "voltage", "rainbowMap", "topoContour", "hueRotate"],
             form: ["mandalaBloom", "kaleidoscope", "flowTurbulence", "moirePulse", "zoomPunch", "cameraShake"],
             accent: ["shockwave", "rgbShift", "pixelExplode", "chromaAberrate"],
             finish: ["plasmaField", "bloom", "emberField", "volumetricShaft", "holoShine", "keyingHalo"] },
    suits: { brightness: -0.3, needsColor: 0.6 }, drive: 0.95,
  },
  {
    id: "digitalMelt", name: "DIGITAL MELT", blurb: "The image sorts itself apart and runs.",
    picks: { grade: ["posterize", "bitCrush", "thermal", "solarize", "paletteDither", "selfBlend"],
             form: ["pixelSort", "melt", "strataSlice", "flowSmear", "sliceDrift"],
             accent: ["timeDisplace", "motionMomentum", "datamosh", "asciiCollapse", "glitchTeleport", "rollingShutter", "signalDropout", "syncRoll"],
             finish: ["filmGrain", "vignette", "fog", "crtPhosphor"] },
    suits: { density: 0.5, contrast: 0.3 }, drive: 0.85,
  },
  {
    id: "livingCrystal", name: "LIVING CRYSTAL", blurb: "A crystal surface that breathes and refracts.",
    picks: { grade: ["liquidChrome", "prismDispersion", "filmicTone", "oilSlick"],
             form: ["glassRefract", "ripple", "lensWarp", "crystalize"],
             accent: ["chromaAberrate", "shockwave", "bufferEcho", "echoTrails"],
             finish: ["caustics", "bloom", "dreamGlow", "anamorphic", "causticWater", "holoShine"] },
    suits: { needsLift: 0.4, needsColor: 0.4 }, drive: 0.76,
  },
  {
    id: "spiritDepths", name: "SPIRIT DEPTHS", blurb: "You in one world, the room in another.",
    picks: { grade: ["infraredDream", "duotone", "filmicTone", "thermal"],
             form: ["dimensionSplit", "timeShatter", "volumetricPull", "chronoBleed", "depthShear"],
             accent: ["echoTrails", "chromaAberrate", "rgbShift", "bufferEcho", "trailDecay"],
             finish: ["volumetricShaft", "emberField", "dustMotes", "reactionBloom", "fog"] },
    suits: { needsContrast: 0.4, brightness: -0.2 }, drive: 0.86,
  },

/* ── The seamless deck ───────────────────────────────────────────────────
   Looks for pattern work, drawn only from effects that survive tiling.

   Seamless mode used to bypass art direction entirely: it ran Forge's own
   composer, which picks role by role from the tile-safe pool but has no look,
   no brief and no named intent — so a seamless shuffle got variety without
   ever getting a point of view. Everything the director does for the camera
   (a named look, depth that varies, params read off the content) was simply
   absent from the mode the pattern business actually ships from.

   Why a separate deck rather than filtering the main one: only 59 of the 107
   directable effects tile at all, and they are not evenly spread — 11 of 39
   form effects, 10 of 21 accents. Fifteen of the twenty-five main looks have
   at least one role with no tile-safe pick whatsoever, and for several the gap
   is inherent rather than an oversight. VORTEX, MANDALA BURST, INFINITE TUNNEL
   and FESTIVAL PLASMA are built on centre-relative geometry, and a centre is
   by definition not repeatable. Filtering them would leave looks that no
   longer resemble their own names.

   Between them these seven reach every tile-safe effect in every role, so
   nothing in the seamless pool is unreachable — the same guarantee the main
   deck now carries. */
  {
    id: "acidBloom", name: "ACID BLOOM", blurb: "Wet colour blooming through itself.", seamless: true,
    picks: { grade: ["rainbowMap", "oilSlick", "chromaPulse", "hueRotate"],
             form: ["liquidWarp", "inkFlow", "melt"],
             accent: ["datamosh", "blockShift", "jitter"],
             finish: ["bloom", "dreamGlow", "plasmaField", "caustics"] },
    suits: { needsColor: 0.8, saturation: -0.3 }, drive: 0.82,
  },
  {
    id: "shatterPlate", name: "SHATTER PLATE", blurb: "Cut glass locked into a repeat.", seamless: true,
    picks: { grade: ["liquidChrome", "colorQuake", "posterize", "contourMap", "selfBlend"],
             form: ["voronoiShatter", "crystalize", "emboss", "cameraShake"],
             accent: ["hexShatter", "blockShift", "compressionTears"],
             finish: ["holoShine", "bloom", "anamorphic"] },
    suits: { needsStructure: 0.9, contrast: 0.3 }, drive: 0.74,
  },
  {
    id: "tapeRot", name: "TAPE ROT", blurb: "A pattern recovered off a damaged tape.", seamless: true,
    picks: { grade: ["vhsBleed", "bitCrush", "scanlines", "paletteDither", "invert", "threshold"],
             form: ["pixelSort", "sliceDrift", "displacement"],
             accent: ["datamosh", "staticSnow", "scanlineWarp", "glitchTeleport", "syncRoll", "signalDropout"],
             finish: ["filmGrain", "fog", "dustMotes", "paperGrain"] },
    suits: { density: 0.5, needsRestraint: -0.3 }, drive: 0.8,
  },
  {
    id: "inkFlood", name: "INK FLOOD", blurb: "Pigment finding its own channels.", seamless: true,
    picks: { grade: ["kuwahara", "oilSlick", "duotone", "filmicTone"],
             form: ["inkFlow", "melt", "liquidWarp"],
             accent: ["scanFreeze", "jitter", "blockShift"],
             finish: ["dreamGlow", "fog", "causticWater", "auroraVeil"] },
    suits: { density: -0.4, needsContrast: 0.4 }, drive: 0.6,
  },
  {
    id: "heatMap", name: "HEAT MAP", blurb: "False colour mapped to a repeating field.", seamless: true,
    picks: { grade: ["thermal", "infraredDream", "topoContour", "rainbowMap"],
             form: ["displacement", "melt", "moire"],
             accent: ["compressionTears", "jitter", "asciiCollapse"],
             finish: ["neonContour", "bloom", "godRays"] },
    suits: { needsColor: 0.7, saturation: -0.4 }, drive: 0.78,
  },
  {
    id: "pressRoom", name: "PRESS ROOM", blurb: "Ink on paper, screened and misregistered.", seamless: true,
    picks: { grade: ["halftone", "crossHatch", "photocopy", "solarize", "threshold", "selfBlend"],
             form: ["emboss", "moire", "frameSmear", "cameraShake"],
             accent: ["asciiCollapse", "staticSnow", "blockShift"],
             finish: ["filmGrain", "dustMotes", "fog", "anamorphic", "paperGrain"] },
    suits: { saturation: -0.6, contrast: 0.4 }, drive: 0.55,
  },
  {
    id: "voltCircuit", name: "VOLT CIRCUIT", blurb: "Current traced across a printed board.", seamless: true,
    picks: { grade: ["voltage", "anaglyph", "noiseTint", "chromaPulse", "invert"],
             form: ["sliceDrift", "pixelSort", "crystalize", "cameraShake"],
             accent: ["glitchTeleport", "scanlineWarp", "hexShatter", "syncRoll", "signalDropout"],
             finish: ["neonContour", "plasmaField", "bloom", "holoShine"] },
    suits: { brightness: -0.4, needsColor: 0.5 }, drive: 0.88,
  },
];


export const LOOKS_BY_ID: Record<string, Look> = Object.fromEntries(LOOKS.map(l => [l.id, l]));

/**
 * Score every look against the brief and sample from the best few.
 *
 * `avoid` holds recently used look ids — rotating the *art direction*, not
 * just the effects, is what stops consecutive rolls from feeling like the
 * same idea twice.
 */
/** How hard a fully-suppressed look gets pushed down the ranking — tuned
 *  against `suits` weights, which run roughly -1..1 per axis, so this is
 *  comparable to losing a couple of the axes a look actually fits. */
const LOOK_PENALTY_STRENGTH = 1.4;

export function chooseLook(
  brief: FrameBrief,
  rand: () => number,
  avoid: string[] = [],
  /** Soft, decaying recency suppression (0..1 per look id — see
   *  recencyPenalty in compose.ts) — the same memory Journey mode's own
   *  look-equivalent choice uses. `avoid` still hard-excludes on top of
   *  this for anything that must never come back (e.g. every look is
   *  filtered to nothing, a caller with no memory to soften); most callers
   *  should prefer this over `avoid` going forward. Applied as a
   *  subtraction, not a multiplier — `suits` weights can be negative, and
   *  multiplying a negative score by a small penalty makes it *less*
   *  negative, the opposite of suppression. */
  penalty?: ReadonlyMap<string, number>,
  previousLookId?: string | null,
  /** Draw from the seamless deck instead of the main one. The two are
   *  disjoint: a look built for tiling has no business grading a camera, and
   *  most of the camera deck cannot tile at all. */
  tileSafe = false,
): Look {
  const stale = new Set(avoid);
  const deck = LOOKS.filter(l => !!l.seamless === tileSafe);
  const scored = deck.map(look => {
    let score = 0;
    for (const [key, weight] of Object.entries(look.suits)) {
      const v = brief[key as keyof FrameBrief];
      if (typeof v === "number") score += v * (weight as number);
    }
    score -= (1 - (penalty?.get(look.id) ?? 1)) * LOOK_PENALTY_STRENGTH;
    if (previousLookId) score += lookTransitionScore(previousLookId, look.id, brief);
    return { look, score };
  });

  const fresh = scored.filter(s => !stale.has(s.look.id));
  const usable = fresh.length ? fresh : scored;
  usable.sort((a, b) => b.score - a.score);

  // Sample from the top third so the fit is honoured without being rigid.
  const width = Math.max(2, Math.ceil(usable.length / 3));
  return usable[Math.floor(rand() * Math.min(width, usable.length))].look;
}

/** Judge the relationship between consecutive looks: shared vocabulary gives
 * continuity, a controlled energy arc and a new structural idea give surprise. */
export function lookTransitionScore(previousId: string, nextId: string, brief: FrameBrief): number {
  if (previousId === nextId) return -2.2;
  const previous = LOOKS_BY_ID[previousId];
  const next = LOOKS_BY_ID[nextId];
  if (!previous || !next) return 0;
  const prevIds = new Set(Object.values(previous.picks).flat());
  const nextIds = new Set(Object.values(next.picks).flat());
  const shared = [...prevIds].filter(id => nextIds.has(id)).length;
  const continuity = Math.min(0.42, shared * 0.12);
  const driveArc = Math.abs(previous.drive - next.drive);
  const arc = driveArc >= 0.12 && driveArc <= 0.42 ? 0.28 : driveArc > 0.62 ? -0.22 : 0;
  const novelty = (next.picks.form ?? []).some(id => !(previous.picks.form ?? []).includes(id)) ? 0.18 : 0;
  const restraint = brief.needsRestraint > 0.55 && next.drive > previous.drive ? -0.45 : 0;
  return continuity + arc + novelty + restraint;
}

/* ────────────────────────────────────────────────────────────────────────
   5. Composition
   ────────────────────────────────────────────────────────────────────── */

export type ComposedLayer = {
  effectId: string;
  role: Role;
  params: Record<string, number>;
  opacity: number;
  blend: BlendMode;
  /** Confines the layer to part of the frame. Set when the form layer is
   *  dimensional, so the subject and the room get different treatments. */
  region?: LayerRegion | null;
};

export type Composition = {
  look: Look;
  brief: FrameBrief;
  layers: ComposedLayer[];
};

/**
 * Opacity ceiling per role. Accents and finishes sit *under* full strength on
 * purpose — stacking four opaque layers is what turns a frame to mud, and it
 * was the main reason the old random stacks read as sludge rather than grade.
 */
const ROLE_OPACITY: Record<Role, [number, number]> = {
  // A grade is a *blend* with the original, not a replacement of it. The
  // compositor starts from the source frame, so holding the grade under 1.0
  // leaves the real image showing through — which is the difference between
  // grading a shot and painting over it.
  grade:  [0.6, 0.92],
  form:   [0.72, 1.0],
  accent: [0.45, 0.98],
  finish: [0.4, 0.95],
};

/** Blend pools that flatter each role. */
const ROLE_BLENDS: Record<Role, BlendMode[]> = {
  grade:  ["normal"],
  form:   ["normal", "normal", "normal", "screen"],
  accent: ["screen", "overlay", "hardLight", "normal"],
  finish: ["screen", "additive", "screen", "overlay"],
};

/**
 * Deepest stack the director will build.
 *
 * Four is the complete sentence; past that it doubles roles rather than
 * inventing new ones. Seven is where added layers stop reading as composition
 * and start reading as sediment.
 */
export const MAX_ROLES = 7;

/** Total detail destruction a single stack is allowed to spend. */
const COST_BUDGET = 1.5;

/**
 * Total GPU cost a stack may spend, in passthrough-pass multiples.
 *
 * Four cheap effects cost ~4. The most expensive single effect is ~8. A cap of
 * 16 lets a stack afford one or two heavy effects but never four, which is what
 * keeps frame time bounded no matter what the director rolls. Anything cheap is
 * effectively free against this.
 */
const GPU_BUDGET = 16;

/** How hard a fully-suppressed effect gets pushed down the ranking — tuned
 *  against the score terms above, which mostly run ±0.5..1.5 with -6 for a
 *  genuine hard constraint (blows the GPU budget), so this reads as a real
 *  but survivable deduction rather than the -6 tier. */
const EFFECT_PENALTY_STRENGTH = 1.8;

/** Measured GPU cost of an effect; unmeasured effects are cheap (~1x). */
export function gpuCostOf(id: string): number {
  return CRAFT[id]?.gpu ?? 1;
}

/**
 * Choose the effect for one role, honouring the look, the brief and a
 * remaining detail budget.
 *
 * `affinityTarget` (-1..1) lets role rerolls keep their
 * similar↔incompatible axis: positive stays inside the look's own picks,
 * negative reaches outside them for something that fights the look.
 */
export function pickForRole(
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  opts: {
    exclude?: string[];
    budgetLeft?: number;
    gpuLeft?: number;
    affinityTarget?: number;
    /**
     * Ignore the role's own shelf and draw from the whole library. This is how
     * an effect ends up somewhere it was never filed — a geometry effect
     * finishing a stack, a finish used as an accent.
     */
    anyRole?: boolean;
    /** 0..1. Raises the ceiling on drama, grit and colour replacement, and
     *  widens how deep into the ranking a pick may reach. */
    wildness?: number;
    /** Soft, decaying recency suppression (0..1 per effect id — see
     *  recencyPenalty in compose.ts), the same memory Journey mode's own
     *  effect ranking uses. Unlike `exclude` (a hard rule: never repeat a
     *  role already filled in *this* stack), this is a preference a strong
     *  enough score can still overcome. */
    penalty?: ReadonlyMap<string, number>;
    /** Confine every pool to effects that survive seamless tiling. A hard
     *  filter, not a preference: an effect that breaks the seam ruins the
     *  tile outright, so it must never be reachable — not by a rule-break,
     *  not by a wide pick window, not by the fallback when a pool is thin. */
    tileSafe?: boolean;
  } = {},
): string {
  const exclude = new Set(opts.exclude ?? []);
  const tileSafe = !!opts.tileSafe;
  const admissible = (id: string) => !tileSafe || tileVerdict(id).safe;
  const budget = opts.budgetLeft ?? COST_BUDGET;
  const gpuLeft = opts.gpuLeft ?? GPU_BUDGET;
  const affinity = opts.affinityTarget ?? 1;
  const wildness = Math.max(0, Math.min(1, opts.wildness ?? 0.35));
  const penalty = opts.penalty;

  const onLook = (look.picks[role] ?? []).filter(id => CRAFT[id] && !exclude.has(id) && admissible(id));
  const wider = (opts.anyRole ? Object.keys(CRAFT).filter(admissible) : poolForRole(role, tileSafe))
    .filter(id => !exclude.has(id));
  const offLook = wider.filter(id => !(look.picks[role] ?? []).includes(id));

  // Affinity decides which shelf to reach for; the brief decides what to take.
  // A rule-break skips the look's own picks entirely — deferring to them is
  // exactly the habit it exists to break.
  let pool: string[];
  if (opts.anyRole) pool = wider.length ? wider : onLook;
  else if (affinity >= 0.2) pool = onLook.length ? onLook : wider;
  else if (affinity <= -0.2) pool = offLook.length ? offLook : wider;
  else pool = wider.length ? wider : onLook;
  if (!pool.length) pool = poolForRole(role, tileSafe);

  // Frame time is a hard constraint, not a preference. Scoring alone was enough
  // while picks only ever came from the top three, but a wider window can reach
  // past a scoring penalty — so anything unaffordable leaves the pool outright
  // whenever something affordable exists.
  const affordable = pool.filter(id => (CRAFT[id]?.gpu ?? 1) <= gpuLeft);
  if (affordable.length) {
    pool = affordable;
  } else {
    // Nothing in this role fits the remaining budget. Take the cheapest rather
    // than letting a wide pick window reach for the most expensive thing on the
    // shelf: the old width of 3 kept that out of range by accident, and without
    // this a late finish could triple the frame cost on its own.
    const cheapest = Math.min(...pool.map(id => CRAFT[id]?.gpu ?? 1));
    pool = pool.filter(id => (CRAFT[id]?.gpu ?? 1) <= cheapest + 0.001);
  }

  const scored = pool.map(id => {
    const c = CRAFT[id];
    let score = 0;

    // Give the frame what it's short of.
    score += (c.gives.light ?? 0) * (brief.needsLift * 1.2 + brief.needsColor * 0.2);
    score += (c.gives.color ?? 0) * brief.needsColor * 1.4;
    score += (c.gives.contrast ?? 0) * brief.needsContrast * 1.2;
    score += (c.gives.structure ?? 0) * brief.needsStructure * 1.3;

    // A busy frame wants restraint, and an over-bright one wants less light.
    // Content-awareness, not taste: a frame that is already busy genuinely has
    // less room for more structure. Wildness overrides preferences, not the
    // director's reading of the picture, so this one stays at full strength.
    score -= (c.gives.structure ?? 0) * brief.needsRestraint * 1.1;
    score -= (c.gives.light ?? 0) * brief.needsCompression * 1.2;
    // Cost is a proxy for how dramatic an effect is, so penalising it always
    // meant systematically preferring the tamer option. A wild roll should want
    // the expensive one.
    // Split deliberately. The flat 0.4 is a baseline aversion to drama and is
    // exactly the taste wildness exists to override. The needsRestraint term is
    // content-awareness — a busy frame genuinely does want less piled on it —
    // and must survive at any wildness, or the director stops looking at the
    // picture at all.
    score -= c.cost * (0.4 * (1 - wildness * 0.95) + brief.needsRestraint * 0.8);

    // House style: polish by default, grit only when the look asks for it —
    // or when the roll is wild enough to want it anyway.
    const wantsGrit = look.id === "signalDecay";
    if (c.fidelity === "cinematic") score += wantsGrit ? 0.0 : 0.55 * (1 - wildness * 0.6);
    if (c.fidelity === "lofi") score += wantsGrit ? 0.7 : -0.75 + wildness * 1.15;

    // Enhance before you replace. A wholesale hue remap is only worth it when
    // the frame is genuinely starved of colour AND the look reaches for one;
    // otherwise it buries the very content we're meant to be showcasing.
    //
    // Except that holding this back on every roll is why the output almost
    // never saturated. Wild rolls let the remaps through, so heavy colour is
    // something that happens sometimes rather than never.
    const onLookPick = (look.picks[role] ?? []).includes(id);
    const replaces = c.replaces ?? 0;
    score -= replaces * (1.1 - brief.needsColor * 0.8) * (onLookPick ? 0.5 : 1.0) * (1 - wildness * 0.9);

    // Anything over budget is a last resort.
    if (c.cost > budget) score -= 1.5;

    // Frame time is a hard constraint, not a preference: an effect that would
    // blow the remaining GPU budget is pushed out of contention entirely, and
    // expensive-but-affordable ones are mildly discouraged so a stack doesn't
    // spend everything on its first pick.
    const gpu = c.gpu ?? 1;
    if (gpu > gpuLeft) score -= 6;
    score -= (gpu - 1) * 0.06;

    // Soft recency suppression — applied as a subtraction, not a multiplier,
    // because this score is genuinely signed (the GPU/budget/replaces terms
    // above can all push it negative); multiplying a negative score by a
    // small penalty would make it *less* negative, the opposite of what a
    // penalty is for.
    score -= (1 - (penalty?.get(id) ?? 1)) * EFFECT_PENALTY_STRENGTH;

    return { id, score: score + rand() * 0.5 };
  });

  scored.sort((a, b) => b.score - a.score);
  /* How deep into the ranking a pick may reach.
     Fixed at 3 this was the single biggest source of repetition: a look offers
     two or three picks per role, so the top three barely changed between rolls
     and the same handful of effects came up over and over. Widening with
     wildness means a wild roll can reach an effect the brief ranked eighth —
     still directed, but no longer the same shortlist every time. */
  const width = Math.max(1, Math.min(scored.length, 2 + Math.round(wildness * 7)));
  const top = scored.slice(0, width);
  /* Weighted by rank, not uniform.

     Picking uniformly across a wide window throws the ranking away — and the
     ranking is the entire brief: what the frame is short of, how busy it
     already is, what the look wants. A wide uniform window made the director
     stop reading the picture. Falling weights keep the best pick the most
     likely while still letting the eighth-ranked effect turn up sometimes,
     which is variety without going blind. */
  let total = 0;
  const weights = top.map((_, i) => {
    const w = 1 / (1 + i * 0.55);
    total += w;
    return w;
  });
  let r = rand() * total;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].id;
  }
  return top[0].id;
}

/**
 * Set an effect's params from the brief rather than sampling blind.
 *
 * `amount`-like params scale with how much the frame actually needs the
 * effect's contribution, so a flat frame gets a strong grade and a busy one
 * gets a restrained accent.
 */
export function paramsForRole(
  effectId: string,
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  wildness = 0.35,
): Record<string, number> {
  const def = EFFECTS_BY_ID[effectId];
  const c = CRAFT[effectId];
  const out: Record<string, number> = {};
  if (!def) return out;

  // How hard to push this layer, 0..1.
  let push = look.drive;
  if (role === "accent") push *= 0.7 - brief.needsRestraint * 0.3;
  if (role === "finish") push *= 0.85 - brief.needsCompression * 0.35;
  if (role === "grade") push *= 0.8 + brief.needsContrast * 0.3;
  if (c) {
    push += (c.gives.light ?? 0) * brief.needsLift * 0.3;
    push += (c.gives.color ?? 0) * brief.needsColor * 0.3;
    push -= brief.needsRestraint * 0.15;
  }
  push = clamp01(push);

  /* Wildness lifts the ceiling.

     The amount param used to top out at 85% of its range even at maximum push,
     and secondary params only wobbled ±35% around their defaults. That is why
     two rolls of one effect looked like the same effect twice: the knobs never
     went anywhere near the ends of their travel, where effects actually stop
     resembling themselves. */
  push = clamp01(push * (0.78 + wildness * 0.42) + wildness * 0.32);

  // Which param is this effect's actual "amount," and which way up its
  // range makes it stronger — params[0]/up unless strengthParamFor
  // overrides it (see STRENGTH_OVERRIDES's own doc for why a handful of
  // effects need that: a differently-named-but-still-"more=stronger" param
  // is fine left as the default, only a wrong direction or a genuinely
  // non-magnitude param needs an entry).
  const strength = strengthParamFor(effectId);

  def.params.forEach((p) => {
    const span = p.max - p.min;
    // The strength param is the one the brief/push should drive. Every
    // other param — including all of them, if this effect has no strength
    // param at all — gets character variation instead.
    let target: number;
    if (strength.key != null && p.key === strength.key) {
      target = strength.direction === "down"
        ? p.max - span * (0.2 + push * 0.8)
        : p.min + span * (0.2 + push * 0.8);
    } else {
      // Secondary params are where an effect's character lives — the angle, the
      // cell size, the falloff. Ranging them across the full span is what makes
      // the same shader read as a different effect between rolls.
      const spread = 0.3 + wildness * 1.5;
      target = p.default + (rand() - 0.5) * span * spread;
    }
    const jitter = (rand() - 0.5) * span * (0.1 + wildness * 0.18);
    let v = Math.max(p.min, Math.min(p.max, target + jitter));
    if (p.step) v = Math.round(v / p.step) * p.step;
    out[p.key] = v;
  });
  return out;
}

export function opacityForRole(
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  effectId?: string,
  opts: { wildness?: number; regioned?: boolean } = {},
): number {
  const wildness = Math.max(0, Math.min(1, opts.wildness ?? 0.35));
  const [lo, hi] = ROLE_OPACITY[role];
  let v = lo + rand() * (hi - lo);
  // Hold accents back on an already-busy frame — but a wild roll is allowed to
  // ignore the frame's request for restraint. That refusal is the point of it.
  if (role === "accent" || role === "finish") {
    v *= 1 - brief.needsRestraint * 0.25 * (1 - wildness * 0.8);
  }

  /* The heavier an effect rewrites the frame, the further it gets held back.
     A full-strength Droste or kaleidoscope obliterates the subject; at
     two-thirds it reads as the real image seen *through* the distortion.

     Two escapes from that damping:

     A REGIONED layer barely needs it. It only covers part of the frame, so the
     subject survives in the rest — which is the real argument for regions here.
     They buy full strength without the cost full strength normally carries, and
     they are how several violent effects coexist without turning to mud: they
     are not fighting over the same pixels.

     A WILD roll accepts the cost knowingly. Sometimes obliterating the subject
     is the desired image. */
  const cost = effectId ? (CRAFT[effectId]?.cost ?? 0.4) : 0.4;
  const damp = opts.regioned
    ? cost * 0.06
    : cost * 0.34 * (1 - wildness * 0.8);
  v *= 1 - damp;
  v *= 0.85 + look.drive * 0.2 + wildness * 0.16;

  // A full-frame accent or finish at near-full opacity buries the grade and the
  // form underneath it — that is the mud this whole hierarchy exists to avoid,
  // and wildness is not allowed to reach it. A REGIONED one is a different
  // case entirely: it only covers part of the frame, so the layers beneath
  // still read everywhere else, and it may go as loud as it likes.
  if (!opts.regioned && (role === "accent" || role === "finish")) {
    // A restrained roll still holds the old 0.84 ceiling so a calm frame
    // stays calm, but a wild roll is explicitly asking to risk the mud —
    // let it climb all the way to full strength instead of being capped
    // no matter how hard wildness pushes everything else.
    v = Math.min(v, 0.84 + wildness * 0.16);
  }

  return Math.max(0.22, Math.min(1, v));
}

export function blendForRole(role: Role, rand: () => number): BlendMode {
  const pool = ROLE_BLENDS[role];
  return pool[Math.floor(rand() * pool.length)];
}

/** Compose one semantic role without disturbing the rest of a stack. */
export function composeRoleLayer(
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  options: {
    exclude: string[];
    affinityTarget?: number;
    wildness: number;
    existingRegion?: LayerRegion | null;
    /** Soft recency suppression — see pickForRole's own doc. */
    penalty?: ReadonlyMap<string, number>;
  },
): ComposedLayer | null {
  const effectId = pickForRole(role, look, brief, rand, {
    exclude: options.exclude,
    affinityTarget: options.affinityTarget,
    wildness: options.wildness,
    penalty: options.penalty,
  });
  if (!EFFECTS_BY_ID[effectId]) return null;

  const region = options.existingRegion ?? null;
  return {
    effectId,
    role,
    params: paramsForRole(effectId, role, look, brief, rand, options.wildness),
    opacity: opacityForRole(role, look, brief, rand, effectId, {
      wildness: options.wildness,
      regioned: !!region,
    }),
    blend: role === "grade" ? "normal" : blendForRole(role, rand),
    region,
  };
}

/**
 * Compose a whole stack: pick a look, then fill the roles in order.
 *
 * `roleCount` follows intensity — 2 roles is a restrained remaster
 * (grade + finish), 4 is the full sentence.
 */
export function compose(
  brief: FrameBrief,
  rand: () => number,
  opts: {
    roleCount?: number;
    avoidLooks?: string[];
    avoidEffects?: string[];
    /** Soft, decaying recency suppression — the same memory Journey mode
     *  uses (see recencyPenalty in compose.ts). Prefer this over
     *  avoidLooks/avoidEffects: those hard-exclude anything used in the
     *  last few taps until it ages out of a fixed window, which is a
     *  noticeably more mechanical "shuffle" than a repeat that's merely
     *  unlikely for a while. Both can be given together — avoid still wins
     *  for anything that must never come back at all (a locked layer's own
     *  effect id, say). */
    lookPenalty?: ReadonlyMap<string, number>;
    effectPenalty?: ReadonlyMap<string, number>;
    previousLookId?: string | null;
    look?: Look;
    /**
     * 0..1. How willing the director is to break its own grammar.
     *
     * At 0 it composes strictly: one effect per role, each drawn from that
     * role's own shelf — the four-part sentence, every time. Above 0, each
     * slot has a chance to reach into *any* shelf instead, so an effect can
     * turn up somewhere it was never filed. That is the whole point: the
     * skeleton guarantees the stack reads, and the rule-breaks stop every
     * stack reading the *same*.
     *
     * Defaults to 0 so the grammar holds unless a caller asks for chaos.
     */
    chaos?: number;
    /**
     * 0..1. How far this particular roll is willing to go.
     *
     * Distinct from `chaos`, which only decides whether an effect may sit in a
     * role it wasn't filed under. Wildness governs *magnitude*: how deep into
     * the ranking a pick reaches, how near the ends of their travel the params
     * land, how much opacity survives the damping, how heavily the frame gets
     * partitioned, and whether saturating grades and lo-fi grit are allowed
     * through at all.
     *
     * It is rolled per mosh with deliberately fat tails rather than averaged,
     * because the complaint that motivated it was not that the output was too
     * tame — it was that every roll landed the same distance from the middle.
     * Spread between taps is what makes the button worth pressing again.
     */
    wildness?: number;
    /**
     * Compose for seamless tiling.
     *
     * Draws the look from the seamless deck and confines every pick to
     * effects that survive a repeat, and suppresses region masks entirely —
     * see the `region` note below for why those are the one part of the
     * grammar that cannot be made tile-safe by filtering.
     */
    tileSafe?: boolean;
  } = {},
): Composition {
  const tileSafe = !!opts.tileSafe;
  const look = opts.look
    ?? chooseLook(brief, rand, opts.avoidLooks ?? [], opts.lookPenalty, opts.previousLookId, tileSafe);
  const roleCount = Math.max(1, Math.min(MAX_ROLES, opts.roleCount ?? 4));
  const wildness = Math.max(0, Math.min(1, opts.wildness ?? 0.35));
  // A wild roll is more willing to break the grammar — but only where the
  // caller already allowed grammar-breaking at all. chaos: 0 means strict, and
  // callers rely on that being a guarantee rather than a tendency, so wildness
  // is never allowed to turn a strict roll permissive.
  const askedChaos = Math.max(0, Math.min(1, opts.chaos ?? 0));
  const chaos = askedChaos <= 0 ? 0 : Math.min(1, Math.max(askedChaos, wildness * 0.55));

  // A 2-role stack is grade + finish: tone and light, no distortion. A 3-role
  // stack adds form. Accent is the last thing added, never the first.
  const base: Role[] =
    roleCount >= 4 ? ["grade", "form", "accent", "finish"]
    : roleCount === 3 ? ["grade", "form", "finish"]
    : roleCount === 2 ? ["grade", "finish"]
    : ["grade"];

  // Past four, the stack doubles up rather than inventing new roles: a second
  // accent, a second finish, a second form. Sorted back into role order so the
  // sentence still reads bottom-to-top however deep it gets.
  const extras: Role[] = ["accent", "finish", "form"];
  const roles: Role[] = [...base];
  for (let i = 4; i < roleCount; i++) roles.push(extras[(i - 4) % extras.length]);
  roles.sort((a, b) => ROLES.indexOf(a) - ROLES.indexOf(b));

  const used = new Set(opts.avoidEffects ?? []);
  // Deeper stacks get proportionally more to spend — otherwise a 7-layer stack
  // is four real effects and three the budget refused to pay for. Both ceilings
  // stay bounded so frame time can't run away.
  const extraRoles = Math.max(0, roleCount - 4);
  let budget = Math.min(COST_BUDGET + extraRoles * 0.3, 2.4);
  let gpu = Math.min(GPU_BUDGET + extraRoles * 4, 28);
  const layers: ComposedLayer[] = [];
  // Spatial partition for this stack, if it gets one. The form layer takes one
  // side and the accent the other, so the two loudest layers land on different
  // pixels instead of on top of each other.
  /* No partition when tiling.

     A region mask is the one part of the grammar that filtering cannot make
     safe. `radial` has a centre, and a centre never repeats. `foreground`/
     `background` read a depth proxy that means nothing against a generated
     pattern. Even `hbands`/`vbands`/`shards`, which could tile at an integral
     scale, are rolled here with a continuous scale, a random phase and a
     feather — so any given roll is overwhelmingly likely to cut the seam.
     Masking is a nice-to-have; the seam is the contract. */
  let partition = !tileSafe && rand() < 0.12 + wildness * 0.64 ? rollPartition(rand, wildness) : null;

  for (let ri = 0; ri < roles.length; ri++) {
    const role = roles[ri];
    // The rule-break. Never applied to the grade: it is the tonal foundation
    // and an arbitrary effect underneath everything wipes the frame.
    const breakRule = role !== "grade" && rand() < chaos * 0.5;
    /* Reserve frame time for the roles still to come.
       Without this an early role can spend the budget down to nothing, and the
       last one then overshoots no matter how cheap it picks — there is a floor
       of 1x per effect. Holding back that floor per remaining role is what
       makes the ceiling an actual guarantee rather than a near miss. */
    const reserve = (roles.length - ri - 1) * 1.0;
    const id = pickForRole(role, look, brief, rand, {
      exclude: [...used],
      budgetLeft: budget,
      gpuLeft: Math.max(1, gpu - reserve),
      anyRole: breakRule,
      wildness,
      penalty: opts.effectPenalty,
      tileSafe,
    });
    used.add(id);
    budget -= CRAFT[id]?.cost ?? 0.3;
    gpu -= gpuCostOf(id);

    /* Depth split.

       When the form layer is dimensional it can already separate the subject
       from the room — but applying the accent flat across the whole frame
       paints that separation straight back over. Gating the form to one side
       and the accent to the other means the two halves of the image are
       visibly running different treatments, which is the difference between
       an effect that happens *to* a picture and one that happens *inside* it.

       Only ever on the form/accent pair: the grade is the tonal foundation and
       must stay whole, and a regioned finish just looks like a mistake. */
    let region: LayerRegion | null = null;
    if (role === "form") {
      // A dimensional effect left unmasked is wasted — separating the subject
      // from the room is the entire thing it does — so it upgrades the stack
      // to partitioned even on a roll that didn't ask for one.
      if (!partition && EFFECTS_BY_ID[id]?.category === "dimension"
          && rand() < 0.5 + wildness * 0.42) {
        partition = rollPartition(rand, wildness);
      }
      region = partition?.a ?? null;
    } else if (role === "accent" && partition) {
      region = partition.b;
    } else if (role === "finish" && !tileSafe && rand() < wildness * 0.4) {
      // Light confined to one part of the frame reads as something happening
      // inside the scene rather than as a filter laid over the top of it.
      region = rollPartition(rand, wildness).a;
    }

    layers.push({
      effectId: id,
      role,
      params: paramsForRole(id, role, look, brief, rand, wildness),
      opacity: opacityForRole(role, look, brief, rand, id, { wildness, regioned: !!region }),
      // The grade always composites normally — it's a tonal foundation, and an
      // exotic blend at the bottom of the stack can wipe the frame to black.
      blend: role === "grade" ? "normal" : blendForRole(role, rand),
      region,
    });
  }

  return { look, brief, layers };
}

/* ────────────────────────────────────────────────────────────────────────
   6. Grading the finished frame
   ────────────────────────────────────────────────────────────────────── */

/** Applied to a frame that is already vivid. Small on purpose — there is
 *  nowhere for those hues to go but into clipping, where they stop being
 *  colours and become flat blocks. */
export const VIBRANCE_MIN = 0.18;
/** Applied to a near-monochrome frame, which has the whole range available. */
export const VIBRANCE_MAX = 0.72;

/**
 * How hard the finisher's vibrance lift should push, from what the frame
 * already has.
 *
 * The lift was a hardcoded 0.35 with no setter anywhere — the uniform existed,
 * nothing ever wrote to it, so every frame got the same push whether it was a
 * grey wall or a neon sign. That is the wrong shape for the problem twice
 * over: it under-serves the washed-out frames that have room for real colour,
 * and over-pushes the vivid ones into clipping, which reads as *less* range
 * rather than more, because clipped hues all resolve to the same flat block.
 *
 * Scaling inversely with measured saturation spends the lift where there is
 * something to gain. Note the finisher's own vibrance() is already
 * chroma-weighted per pixel; this is the second half of the same idea, applied
 * per frame from what analyzeSource actually measured.
 */
export function adaptiveVibrance(saturation: number): number {
  const s = Math.max(0, Math.min(1, saturation));
  return VIBRANCE_MIN + (VIBRANCE_MAX - VIBRANCE_MIN) * (1 - s);
}

/**
 * Roll how far a single mosh is willing to go.
 *
 * Deliberately trimodal rather than uniform. A uniform roll averages out: every
 * tap lands near the middle, which is exactly the failure this fixes — not that
 * the output was too tame, but that consecutive taps were all the same distance
 * from centre, so pressing the button again told you nothing new.
 *
 * Three bands instead, with real weight in the tails: roughly a fifth of rolls
 * are a restrained remaster, a third are unhinged, and the rest sit between.
 * Two taps in a row can now differ enormously, which is what makes the third
 * tap worth making.
 *
 * `floor` lifts the whole distribution for the higher intensity settings, so
 * NUCLEAR is wild more often than MILD without ever losing the spread.
 */
/**
 * Roll how many parts this particular stack is built from.
 *
 * The intensity tiers used to name one exact depth each, so every SAVAGE roll
 * was three layers and every NUCLEAR five, forever. Depth is one of the most
 * legible things about a stack — three layers and five layers do not look like
 * two takes on one idea, they look like two different amounts of effort — and
 * pinning it meant the one variable the eye reads first never moved.
 *
 * A tier now names a centre rather than a value: mostly its own depth, and
 * often a layer either side of it. Two rolls at the same setting can differ in
 * depth, which is variety the effect shortlists alone can't produce.
 *
 * Never below two — one layer is a grade with nothing on it, which reads as
 * the effect having failed rather than as restraint — and never past
 * MAX_ROLES, where added layers stop composing and start silting up.
 */
export function rollRoleCount(rand: () => number, base: number): number {
  const r = rand();
  const offset = r < 0.22 ? -1 : r < 0.70 ? 0 : 1;
  return Math.max(2, Math.min(MAX_ROLES, base + offset));
}

export function rollWildness(rand: () => number, floor = 0): number {
  const band = rand();
  const raw =
    band < 0.20 ? rand() * 0.32 :
    band < 0.66 ? 0.32 + rand() * 0.36 :
                  0.68 + rand() * 0.32;
  return Math.max(0, Math.min(1, floor + raw * (1 - floor)));
}
