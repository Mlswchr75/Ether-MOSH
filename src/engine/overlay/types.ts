import type { BlendMode } from "@/engine/blend";
import type { Layer } from "@/store/types";

export type OverlayAssetKind =
  | "raster"
  | "svg"
  | "gif"
  | "lottie-json"
  | "dotlottie";

export type OverlayCompositingMode = "before-fx" | "after-fx" | "own-fx";
export type OverlayBehaviorKind =
  | "none"
  | "float"
  | "pulse"
  | "wobble"
  | "orbit"
  | "bounce"
  | "flicker"
  | "jitter"
  | "random-walk";
export type OverlayReactionSource = "bass" | "mid" | "treble" | "overall" | "beat";
export type OverlayReactionTarget =
  | "scale"
  | "rotation"
  | "opacity"
  | "playback-speed"
  | "playback-position";
export type OverlayTrackingTarget = "hand" | "face" | "person" | "object" | "journey";

export type OverlayAsset = {
  id: string;
  name: string;
  kind: OverlayAssetKind;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
  animated: boolean;
  createdAt: number;
  /** True when url was created with URL.createObjectURL and must be revoked. */
  objectUrl?: boolean;
};

export type OverlayTransform = {
  /** Normalized stage coordinates, 0..1. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

export type OverlayPlayback = {
  playing: boolean;
  loop: boolean;
  speed: number;
  direction: 1 | -1;
  segment: [number, number] | null;
};

export type OverlayBehavior = {
  kind: OverlayBehaviorKind;
  amount: number;
  speed: number;
  seed: number;
};

export type OverlayReaction = {
  id: string;
  source: OverlayReactionSource;
  target: OverlayReactionTarget;
  amount: number;
  smoothing: number;
  invert: boolean;
};

export type OverlayTrackingBinding = {
  enabled: boolean;
  target: OverlayTrackingTarget;
  targetId?: string;
  offsetX: number;
  offsetY: number;
  scaleWithTarget: boolean;
  rotateWithTarget: boolean;
};

export type OverlayEntity = {
  id: string;
  asset: OverlayAsset;
  transform: OverlayTransform;
  playback: OverlayPlayback;
  compositing: OverlayCompositingMode;
  blend: BlendMode;
  hidden: boolean;
  locked: boolean;
  behavior: OverlayBehavior;
  reactions: OverlayReaction[];
  tracking: OverlayTrackingBinding | null;
  ownFx: Layer[];
  createdAt: number;
};

export const DEFAULT_OVERLAY_TRANSFORM: OverlayTransform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

export const DEFAULT_OVERLAY_PLAYBACK: OverlayPlayback = {
  playing: true,
  loop: true,
  speed: 1,
  direction: 1,
  segment: null,
};

export const DEFAULT_OVERLAY_BEHAVIOR: OverlayBehavior = {
  kind: "none",
  amount: 0.5,
  speed: 1,
  seed: 0,
};

export function makeOverlayEntity(
  asset: OverlayAsset,
  overrides: Partial<OverlayEntity> = {},
): OverlayEntity {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    asset,
    transform: { ...DEFAULT_OVERLAY_TRANSFORM, ...(overrides.transform ?? {}) },
    playback: { ...DEFAULT_OVERLAY_PLAYBACK, ...(overrides.playback ?? {}) },
    compositing: overrides.compositing ?? "after-fx",
    blend: overrides.blend ?? "normal",
    hidden: overrides.hidden ?? false,
    locked: overrides.locked ?? false,
    behavior: {
      ...DEFAULT_OVERLAY_BEHAVIOR,
      seed: DEFAULT_OVERLAY_BEHAVIOR.seed || hashOverlaySeed(id),
      ...(overrides.behavior ?? {}),
    },
    reactions: overrides.reactions?.map(r => ({ ...r })) ?? [],
    tracking: overrides.tracking ? { ...overrides.tracking } : null,
    ownFx: overrides.ownFx?.map(layer => ({
      ...layer,
      params: { ...layer.params },
      mods: { ...layer.mods },
      audioMaps: { ...(layer.audioMaps ?? {}) },
    })) ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
  };
}

export function duplicateOverlayEntity(source: OverlayEntity): OverlayEntity {
  return makeOverlayEntity(source.asset, {
    ...source,
    id: crypto.randomUUID(),
    transform: { ...source.transform, x: Math.min(1, source.transform.x + 0.03), y: Math.min(1, source.transform.y + 0.03) },
    playback: { ...source.playback },
    behavior: { ...source.behavior, seed: hashOverlaySeed(crypto.randomUUID()) },
    reactions: source.reactions.map(r => ({ ...r, id: crypto.randomUUID() })),
    tracking: source.tracking ? { ...source.tracking } : null,
    ownFx: source.ownFx.map(layer => ({
      ...layer,
      id: crypto.randomUUID(),
      params: { ...layer.params },
      mods: { ...layer.mods },
      audioMaps: { ...(layer.audioMaps ?? {}) },
    })),
    createdAt: Date.now(),
  });
}

function hashOverlaySeed(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
