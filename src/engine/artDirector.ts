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
 * It also maps onto the quadrant instrument: Q1 grades, Q2 forms, Q3 accents,
 * Q4 finishes. Re-rolling one quadrant swaps that part of the sentence and
 * leaves the grammar intact.
 */
import { EFFECTS, EFFECTS_BY_ID } from "./effects";
import type { BlendMode } from "./blend";

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
};

export const NEUTRAL_STATS: SourceStats = {
  brightness: 0.5, contrast: 0.4, saturation: 0.4,
  density: 0.4, warmth: 0.5, hueSpread: 0.4,
  clipLow: 0, clipHigh: 0,
};

/** Reused sampling surface — analysis runs on every mosh, so don't reallocate. */
let sampleCanvas: HTMLCanvasElement | null = null;
let sampleCtx: CanvasRenderingContext2D | null = null;
const SAMPLE_W = 64;
const SAMPLE_H = 36;

/**
 * Measure the live source. Deliberately tiny (64×36 ≈ 2.3k pixels) so it can
 * run synchronously on every mosh without touching the render loop.
 *
 * Works for both <video> and <img>, which matters because MOSH is
 * camera-first — the existing palette worker only ever ran on still images, so
 * the live path had no analysis at all.
 */
export function analyzeSource(el: HTMLVideoElement | HTMLImageElement | null): SourceStats {
  if (!el || typeof document === "undefined") return { ...NEUTRAL_STATS };
  try {
    const w = (el as HTMLVideoElement).videoWidth || (el as HTMLImageElement).naturalWidth || 0;
    const h = (el as HTMLVideoElement).videoHeight || (el as HTMLImageElement).naturalHeight || 0;
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

type Craft = {
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
 * Role and fidelity for all 65 effects. This is the taste layer: it's what
 * lets the director reach for `godRays` when a frame needs light and
 * `posterize` only when the look actually wants a poster.
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
};

export function craftOf(id: string): Craft | null {
  return CRAFT[id] ?? null;
}

/** Every effect that can serve a role. */
export function poolForRole(role: Role): string[] {
  return Object.keys(CRAFT).filter(id => CRAFT[id].role === role && EFFECTS_BY_ID[id]);
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
};

/**
 * Twelve named looks. Most are cinematic; SIGNAL DECAY keeps a deliberate
 * lo-fi datamosh in the deck, but art-directed rather than random, so grit is
 * a choice the director makes for a reason instead of the default texture.
 */
export const LOOKS: Look[] = [
  {
    id: "chromeNoir", name: "CHROME NOIR", blurb: "Polished metal, deep falloff.",
    picks: { grade: ["liquidChrome", "filmicTone", "duotone"], form: ["lensWarp", "perspectiveTilt", "zoomBlur"],
             accent: ["rgbShift", "bufferEcho"], finish: ["vignette", "godRays", "filmGrain"] },
    suits: { saturation: -0.6, contrast: 0.5, needsColor: 0.3 }, drive: 0.5,
  },
  {
    id: "neonRain", name: "NEON RAIN", blurb: "Everything traced in light.",
    picks: { grade: ["duotone", "chromaPulse"], form: ["ripple", "liquidWarp", "displacement"],
             accent: ["rgbShift", "shockwave"], finish: ["neonContour", "bloom"] },
    suits: { density: 0.7, brightness: -0.5, needsLift: 0.4 }, drive: 0.65,
  },
  {
    id: "solarBloom", name: "SOLAR BLOOM", blurb: "Blown-out warmth and haze.",
    picks: { grade: ["thermal", "chromaPulse"], form: ["zoomBlur", "lensWarp", "ripple"],
             accent: ["bufferEcho", "rgbShift"], finish: ["godRays", "bloom", "lightLeak"] },
    suits: { warmth: 0.7, brightness: 0.4, needsLift: 0.5 }, drive: 0.55,
  },
  {
    id: "prismDrift", name: "PRISM DRIFT", blurb: "Light split into its spectrum.",
    picks: { grade: ["prismDispersion", "oilSlick"], form: ["lensWarp", "drosteTunnel", "ripple"],
             accent: ["rgbShift", "shockwave"], finish: ["holoShine", "bloom", "dustMotes"] },
    suits: { needsColor: 0.9, saturation: -0.4 }, drive: 0.6,
  },
  {
    id: "deepVoid", name: "DEEP VOID", blurb: "Weight, shadow and drift.",
    picks: { grade: ["filmicTone", "duotone", "infraredDream"], form: ["frameSmear", "perspectiveTilt", "melt"],
             accent: ["bufferEcho", "scanFreeze"], finish: ["fog", "vignette", "dustMotes"] },
    suits: { needsCompression: 0.8, brightness: 0.3, clipHigh: 0.5 }, drive: 0.45,
  },
  {
    id: "liquidDream", name: "LIQUID DREAM", blurb: "Soft-focus flow, no hard edges.",
    picks: { grade: ["oilSlick", "chromaPulse"], form: ["inkFlow", "melt", "liquidWarp"],
             accent: ["bufferEcho", "rgbShift"], finish: ["dreamGlow", "bloom", "auroraVeil"] },
    suits: { needsContrast: 0.5, density: -0.5, needsStructure: 0.4 }, drive: 0.5,
  },
  {
    id: "glassFracture", name: "GLASS FRACTURE", blurb: "The frame under stress.",
    picks: { grade: ["liquidChrome", "filmicTone", "voltage"], form: ["voronoiShatter", "crystalize", "kaleidoscope"],
             accent: ["shockwave", "hexShatter"], finish: ["holoShine", "bloom", "vignette"] },
    suits: { needsStructure: 0.9, density: -0.4 }, drive: 0.7,
  },
  {
    id: "auroraVeil", name: "AURORA VEIL", blurb: "Slow colour drifting over dark.",
    picks: { grade: ["infraredDream", "hueRotate"], form: ["polarFold", "ripple", "liquidWarp"],
             accent: ["bufferEcho", "scanFreeze"], finish: ["auroraVeil", "dreamGlow", "dustMotes"] },
    suits: { brightness: -0.6, needsColor: 0.5, needsLift: 0.5 }, drive: 0.45,
  },
  {
    id: "vortex", name: "VORTEX", blurb: "Everything pulled to one point.",
    picks: { grade: ["oilSlick", "filmicTone", "colorQuake"], form: ["drosteTunnel", "twirl", "fractalZoom"],
             accent: ["shockwave", "pixelExplode"], finish: ["bloom", "godRays", "vignette"] },
    suits: { needsStructure: 0.7, contrast: 0.3 }, drive: 0.8,
  },
  {
    id: "titanium", name: "TITANIUM", blurb: "Desaturated, sharp, expensive.",
    picks: { grade: ["filmicTone", "liquidChrome", "posterize"], form: ["perspectiveTilt", "lensWarp", "mirror"],
             accent: ["rgbShift", "jitter"], finish: ["vignette", "filmGrain", "godRays"] },
    suits: { saturation: -0.7, needsContrast: 0.4, density: 0.3 }, drive: 0.4,
  },
  {
    id: "infraBloom", name: "INFRA BLOOM", blurb: "Heat-mapped and glowing.",
    picks: { grade: ["thermal", "infraredDream"], form: ["ripple", "zoomBlur", "melt"],
             accent: ["shockwave", "rgbShift"], finish: ["bloom", "dreamGlow", "lightLeak"] },
    suits: { needsColor: 0.8, saturation: -0.5, needsContrast: 0.3 }, drive: 0.6,
  },
  {
    id: "signalDecay", name: "SIGNAL DECAY", blurb: "Tape damage, held together on purpose.",
    picks: { grade: ["vhsBleed", "posterize", "bitCrush"], form: ["pixelSort", "sliceDrift", "displacement"],
             accent: ["datamosh", "blockShift", "compressionTears"], finish: ["filmGrain", "vignette", "fog"] },
    suits: { density: 0.5, needsRestraint: -0.3, contrast: 0.3 }, drive: 0.75,
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
export function chooseLook(brief: FrameBrief, rand: () => number, avoid: string[] = []): Look {
  const stale = new Set(avoid);
  const scored = LOOKS.map(look => {
    let score = 0;
    for (const [key, weight] of Object.entries(look.suits)) {
      const v = brief[key as keyof FrameBrief];
      if (typeof v === "number") score += v * (weight as number);
    }
    return { look, score };
  });

  const fresh = scored.filter(s => !stale.has(s.look.id));
  const usable = fresh.length ? fresh : scored;
  usable.sort((a, b) => b.score - a.score);

  // Sample from the top third so the fit is honoured without being rigid.
  const width = Math.max(2, Math.ceil(usable.length / 3));
  return usable[Math.floor(rand() * Math.min(width, usable.length))].look;
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
  grade:  [0.6, 0.88],
  form:   [0.72, 0.95],
  accent: [0.45, 0.75],
  finish: [0.4, 0.8],
};

/** Blend pools that flatter each role. */
const ROLE_BLENDS: Record<Role, BlendMode[]> = {
  grade:  ["normal"],
  form:   ["normal", "normal", "normal", "screen"],
  accent: ["screen", "overlay", "hardLight", "normal"],
  finish: ["screen", "additive", "screen", "overlay"],
};

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

/** Measured GPU cost of an effect; unmeasured effects are cheap (~1x). */
export function gpuCostOf(id: string): number {
  return CRAFT[id]?.gpu ?? 1;
}

/**
 * Choose the effect for one role, honouring the look, the brief and a
 * remaining detail budget.
 *
 * `affinityTarget` (-1..1) lets the quadrant instrument keep its
 * similar↔incompatible axis: positive stays inside the look's own picks,
 * negative reaches outside them for something that fights the look.
 */
export function pickForRole(
  role: Role,
  look: Look,
  brief: FrameBrief,
  rand: () => number,
  opts: { exclude?: string[]; budgetLeft?: number; gpuLeft?: number; affinityTarget?: number } = {},
): string {
  const exclude = new Set(opts.exclude ?? []);
  const budget = opts.budgetLeft ?? COST_BUDGET;
  const gpuLeft = opts.gpuLeft ?? GPU_BUDGET;
  const affinity = opts.affinityTarget ?? 1;

  const onLook = (look.picks[role] ?? []).filter(id => CRAFT[id] && !exclude.has(id));
  const wider = poolForRole(role).filter(id => !exclude.has(id));
  const offLook = wider.filter(id => !(look.picks[role] ?? []).includes(id));

  // Affinity decides which shelf to reach for; the brief decides what to take.
  let pool: string[];
  if (affinity >= 0.2) pool = onLook.length ? onLook : wider;
  else if (affinity <= -0.2) pool = offLook.length ? offLook : wider;
  else pool = wider.length ? wider : onLook;
  if (!pool.length) pool = poolForRole(role);

  const scored = pool.map(id => {
    const c = CRAFT[id];
    let score = 0;

    // Give the frame what it's short of.
    score += (c.gives.light ?? 0) * (brief.needsLift * 1.2 + brief.needsColor * 0.2);
    score += (c.gives.color ?? 0) * brief.needsColor * 1.4;
    score += (c.gives.contrast ?? 0) * brief.needsContrast * 1.2;
    score += (c.gives.structure ?? 0) * brief.needsStructure * 1.3;

    // A busy frame wants restraint, and an over-bright one wants less light.
    score -= (c.gives.structure ?? 0) * brief.needsRestraint * 1.1;
    score -= (c.gives.light ?? 0) * brief.needsCompression * 1.2;
    score -= c.cost * (0.4 + brief.needsRestraint * 0.8);

    // House style: polish by default, grit only when the look asks for it.
    const wantsGrit = look.id === "signalDecay";
    if (c.fidelity === "cinematic") score += wantsGrit ? 0.0 : 0.55;
    if (c.fidelity === "lofi") score += wantsGrit ? 0.7 : -0.75;

    // Enhance before you replace. A wholesale hue remap is only worth it when
    // the frame is genuinely starved of colour AND the look reaches for one;
    // otherwise it buries the very content we're meant to be showcasing.
    const onLookPick = (look.picks[role] ?? []).includes(id);
    const replaces = c.replaces ?? 0;
    score -= replaces * (1.1 - brief.needsColor * 0.8) * (onLookPick ? 0.5 : 1.0);

    // Anything over budget is a last resort.
    if (c.cost > budget) score -= 1.5;

    // Frame time is a hard constraint, not a preference: an effect that would
    // blow the remaining GPU budget is pushed out of contention entirely, and
    // expensive-but-affordable ones are mildly discouraged so a stack doesn't
    // spend everything on its first pick.
    const gpu = c.gpu ?? 1;
    if (gpu > gpuLeft) score -= 6;
    score -= (gpu - 1) * 0.06;

    return { id, score: score + rand() * 0.5 };
  });

  scored.sort((a, b) => b.score - a.score);
  const width = Math.max(1, Math.min(3, scored.length));
  return scored[Math.floor(rand() * width)].id;
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

  def.params.forEach((p, i) => {
    const span = p.max - p.min;
    // The first param is the effect's "amount" by convention — that's the one
    // the brief should drive. Later params get character variation instead.
    const target = i === 0
      ? p.min + span * (0.25 + push * 0.6)
      : p.default + (rand() - 0.5) * span * (0.35 + look.drive * 0.4);
    const jitter = (rand() - 0.5) * span * 0.14;
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
): number {
  const [lo, hi] = ROLE_OPACITY[role];
  let v = lo + rand() * (hi - lo);
  // Hold accents back further on an already-busy frame.
  if (role === "accent" || role === "finish") v *= 1 - brief.needsRestraint * 0.25;

  // The heavier an effect rewrites the frame, the further it gets held back.
  // A full-strength Droste or kaleidoscope obliterates the subject; the same
  // effect at two-thirds reads as the real image seen through the distortion,
  // which is both more legible and more interesting. This is what keeps the
  // stack showcasing the content instead of replacing it.
  const cost = effectId ? (CRAFT[effectId]?.cost ?? 0.4) : 0.4;
  v *= 1 - cost * 0.34;

  return Math.max(0.22, Math.min(1, v * (0.85 + look.drive * 0.2)));
}

export function blendForRole(role: Role, rand: () => number): BlendMode {
  const pool = ROLE_BLENDS[role];
  return pool[Math.floor(rand() * pool.length)];
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
  opts: { roleCount?: number; avoidLooks?: string[]; avoidEffects?: string[]; look?: Look } = {},
): Composition {
  const look = opts.look ?? chooseLook(brief, rand, opts.avoidLooks ?? []);
  const roleCount = Math.max(1, Math.min(4, opts.roleCount ?? 4));
  // A 2-role stack is grade + finish: tone and light, no distortion. A 3-role
  // stack adds form. Accent is the last thing added, never the first.
  const roles: Role[] =
    roleCount >= 4 ? ["grade", "form", "accent", "finish"]
    : roleCount === 3 ? ["grade", "form", "finish"]
    : roleCount === 2 ? ["grade", "finish"]
    : ["grade"];

  const used = new Set(opts.avoidEffects ?? []);
  let budget = COST_BUDGET;
  let gpu = GPU_BUDGET;
  const layers: ComposedLayer[] = [];

  for (const role of roles) {
    const id = pickForRole(role, look, brief, rand, {
      exclude: [...used], budgetLeft: budget, gpuLeft: gpu,
    });
    used.add(id);
    budget -= CRAFT[id]?.cost ?? 0.3;
    gpu -= gpuCostOf(id);
    layers.push({
      effectId: id,
      role,
      params: paramsForRole(id, role, look, brief, rand),
      opacity: opacityForRole(role, look, brief, rand, id),
      // The grade always composites normally — it's a tonal foundation, and an
      // exotic blend at the bottom of the stack can wipe the frame to black.
      blend: role === "grade" ? "normal" : blendForRole(role, rand),
    });
  }

  return { look, brief, layers };
}

/** Which role a quadrant drives. Q1 grades, Q2 forms, Q3 accents, Q4 finishes. */
export function roleForQuadrant(q: number): Role {
  return ROLES[Math.max(0, Math.min(3, q))];
}
