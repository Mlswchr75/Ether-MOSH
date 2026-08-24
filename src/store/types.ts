import type { BlendMode } from "@/engine/blend";
import type { Role } from "@/engine/artDirector";
export type { PaletteProfile, BiomeId } from "@/engine/imagePalette";

export type IsolationMode = 'off' | 'auto' | 'tap';

export type StickerEntry = {
  id: string;
  url: string;
  animated: boolean;
  w: number;
  h: number;
  ts: number;
};

export type ModulatorType = "sine" | "triangle" | "saw" | "perlin" | "random" | "beat" | "bass" | "mid" | "high" | "audio";

export type Modulator = {
  type: ModulatorType;
  speed: number;   // Hz / cycles per second
  depth: number;   // 0..1 of param range
  offset: number;  // -1..1
};

export type AudioSource = "bass" | "mid" | "treble" | "overall" | "beat";

export type AudioMap = {
  source: AudioSource;
  /** -1..1, fraction of param range to apply */
  amount: number;
  /** 0..1, dampening of rapid changes */
  smoothing: number;
};

export type Layer = {
  id: string;
  effectId: string;
  role?: Role;
  hidden: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  /** static param values (key -> 0..1 normalized) */
  params: Record<string, number>;
  /** modulators per param key */
  mods: Record<string, Modulator | null>;
  /** audio reactivity mappings per param key */
  audioMaps?: Record<string, AudioMap | null>;
  /** Confines the layer to part of the frame (depth gate, bands, shards).
   *  Null or absent means it covers everything, which is the old behaviour. */
  region?: import("@/engine/blend").LayerRegion | null;
};

export type Intensity = "mild" | "savage" | "nuclear" | "interdimensional";

export type Favorite = {
  id: string;
  name: string;
  layers: Layer[];
  seed?: string;
  createdAt?: string;
  /** Optional preview retained by legacy/cloud favorite payloads. */
  thumb?: string;
  /**
   * Shareable link that re-applies this exact stack — computed once at save
   * time (not derived on read) so a favorite still opens the same look even
   * after the effect library or encoding scheme moves on. See presetUrl.ts.
   */
  link?: string;
};

export type Snapshot = {
  layers: Layer[];
  seed: string;
};

/** Which of the three ways to feed the renderer is currently active. */
export type SourceMode = "upload" | "camera" | "forge";

/**
 * Pattern Forge's own state, folded into the main store so switching into and
 * out of forge mode doesn't tear down and rebuild a page. `stack` is already
 * shaped as ordinary `Layer[]` (see randomiseForge in useStore.ts) so the
 * existing render loop's audio-reactivity, HDR and modulator code apply to it
 * unchanged — forge only replaces what feeds the effects, not how they run.
 */
export type ForgeState = {
  paletteIdx: number;
  seed: number;
  /** 0..1 — layer count and how far params travel from their defaults. */
  intensity: number;
  /** Confines the effect pool to tile-safe effects and wraps sampling. */
  seamless: boolean;
  stack: Layer[];
  /** Optional photo the generated pattern composites over. */
  baseImage: HTMLImageElement | null;
  baseName: string | null;
  /** Repeat the uploaded base photo into a crop-varied field before MOSH. */
  mosaicEnabled: boolean;
  /** 0..1: cells on the short edge, from a loose 3-up field to 18-up. */
  mosaicDensity: number;
  /** How much of the generated field sits over `baseImage`, 0..1. */
  overlay: number;
  /** Id of the generator currently producing Forge's source imagery. */
  activeGeneratorId: string;
  /** Fold count if kaleidoscope symmetry is wrapping the active generator this shuffle, else null. */
  kaleidoscopeFolds: number | null;
  /**
   * Set on shuffle/reseed to the *previous* generator id so
   * paintForgeSource can crossfade into the new one instead of hard-cutting.
   * Cleared once the transition window elapses.
   */
  transitionFromGeneratorId: string | null;
  /** performance.now() timestamp the current transition began, or null when settled. */
  transitionStartedAt: number | null;
};
