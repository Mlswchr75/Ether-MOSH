import type { OverlayReaction, OverlayReactionSource } from "./types";

export type OverlayAudioSnapshot = Record<OverlayReactionSource, number>;

export type OverlayReactionDelta = {
  scale: number;
  rotation: number;
  opacity: number;
  playbackSpeed: number;
  playbackPosition: number | null;
};

export const SILENT_OVERLAY_AUDIO: OverlayAudioSnapshot = {
  bass: 0,
  mid: 0,
  treble: 0,
  overall: 0,
  beat: 0,
};

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function sourceValue(reaction: OverlayReaction, audio: OverlayAudioSnapshot): number {
  const raw = clamp01(audio[reaction.source] ?? 0);
  return reaction.invert ? 1 - raw : raw;
}

/**
 * Stateless mapping step. Smoothing is deliberately handled by the renderer,
 * which owns frame cadence and can preserve one tiny local value per mapping
 * without pushing high-frequency state into Zustand.
 */
export function mapOverlayReactions(
  reactions: OverlayReaction[],
  audio: OverlayAudioSnapshot,
  smoothed: Record<string, number> = {},
): OverlayReactionDelta {
  let scale = 1;
  let rotation = 0;
  let opacity = 1;
  let playbackSpeed = 1;
  let playbackPosition: number | null = null;

  for (const reaction of reactions) {
    const value = clamp01(smoothed[reaction.id] ?? sourceValue(reaction, audio));
    const amount = Math.max(-2, Math.min(2, reaction.amount));
    switch (reaction.target) {
      case "scale":
        scale *= Math.max(0.05, 1 + value * amount * 0.65);
        break;
      case "rotation":
        rotation += value * amount * 180;
        break;
      case "opacity":
        opacity *= clamp01(1 + value * amount);
        break;
      case "playback-speed":
        playbackSpeed *= Math.max(0.05, 1 + value * amount * 2);
        break;
      case "playback-position":
        playbackPosition = clamp01(value);
        break;
    }
  }

  return { scale, rotation, opacity, playbackSpeed, playbackPosition };
}

export function smoothReactionValue(previous: number, next: number, smoothing: number): number {
  const s = clamp01(smoothing);
  return previous + (next - previous) * Math.max(0.01, 1 - s);
}
