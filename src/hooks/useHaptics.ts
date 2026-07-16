/**
 * Haptic feedback helper — no-ops silently where the Vibration API is
 * unavailable (iOS Safari, desktop). Patterns are ms on/off pairs.
 */
export function haptic(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // vibration blocked — ignore
  }
}
