import type { BlendMode } from "@/engine/blend";
export type { PaletteProfile, BiomeId } from "@/engine/imagePalette";

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
};

export type Intensity = "mild" | "savage" | "nuclear" | "interdimensional";

export type Snapshot = {
  layers: Layer[];
  seed: string;
};
