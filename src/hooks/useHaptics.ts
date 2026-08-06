export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { (navigator as Navigator).vibrate(pattern); } catch { /* noop */ }
  }
}
