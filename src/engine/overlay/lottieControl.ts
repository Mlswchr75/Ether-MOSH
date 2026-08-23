export type LottieReactionDelta = {
  playbackSpeed: number;
  playbackPosition: number | null;
};

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Segment values are stored as normalized 0..1 percentages so the UI does
 * not need to know an animation's frame count before dotLottie finishes loading. */
export function normalizeSegment(segment: [number, number]): [number, number] {
  const a = clamp01(segment[0]);
  const b = clamp01(segment[1]);
  return a <= b ? [a, b] : [b, a];
}

export function resolveLottieReaction(baseSpeed: number, delta: LottieReactionDelta): { speed: number; position: number | null } {
  return {
    speed: Math.max(0.05, Math.min(8, Math.abs(baseSpeed) * Math.max(0.05, delta.playbackSpeed))),
    position: delta.playbackPosition == null ? null : clamp01(delta.playbackPosition),
  };
}

export function normalizedToFrame(position: number, totalFrames: number, segment: [number, number] | null): number {
  const total = Math.max(1, totalFrames - 1);
  const [start, end] = segment ? normalizeSegment(segment) : [0, 1];
  return Math.round((start + (end - start) * clamp01(position)) * total);
}
