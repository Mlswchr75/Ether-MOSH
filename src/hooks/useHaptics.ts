/**
 * Haptic vocabulary.
 *
 * Two problems with the raw `navigator.vibrate(12)` calls this replaces.
 * First, the durations were magic numbers picked per call site — 3, 4, 10,
 * 12 and 15ms all appeared, with no shared meaning, so the same event felt
 * different depending on which surface you triggered it from. Second, and
 * more seriously, the Vibration API is effectively an Android/Chromium
 * feature: Safari's support on iOS is at best inconsistent and historically
 * absent. An interface whose only confirmation is a buzz is a silent
 * interface on an iPhone.
 *
 * So the vocabulary is named, and `hapticsAvailable()` lets a surface know
 * when it has to carry the whole message visually.
 */

export type HapticKind =
  /** Crossing a detent — ring steps, slider notches. The lightest thing here. */
  | "step"
  /** A new item came under the finger. */
  | "select"
  /** The thing you were pointing at happened. */
  | "commit"
  /** A surface appeared under your hand. */
  | "open"
  /** A surface went away. */
  | "close"
  /** You pushed a value into its end stop. */
  | "limit"
  /** The gesture was refused. */
  | "reject";

const PATTERNS: Record<HapticKind, number | number[]> = {
  step: 2,
  select: 4,
  commit: 11,
  open: 14,
  close: 6,
  limit: [3, 26, 3],
  reject: [9, 40, 9],
};

export function hapticsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function haptic(pattern: HapticKind | number | number[] = "commit"): void {
  if (!hapticsAvailable()) return;
  const resolved = typeof pattern === "string" ? PATTERNS[pattern] : pattern;
  try { navigator.vibrate(resolved); } catch { /* a refused vibration is not an error */ }
}
