import type { ModulatorType } from "@/store/types";
import { getAudioData } from "./audioAnalyzer";


/**
 * Wraps into [0, 1), unlike JS's `%` which follows the sign of the dividend
 * and returns values in `(-1, 0]` for negative input. Needed so triangle/saw
 * modulators keep oscillating in -1..1 instead of pinning to an extreme when
 * reverse-time playback drives `t` negative.
 */
function wrap01(x: number): number {
  const m = x % 1;
  return m < 0 ? m + 1 : m;
}

/** Evaluate a modulator value at time `t` (seconds) with optional beat pulse. */
export function evalModulator(
  type: ModulatorType,
  t: number,
  speed: number,
  depth: number,
  offset: number,
  pulse: number,
): number {
  // returns -1..1 then scaled to depth and offset added
  let v = 0;
  switch (type) {
    case "sine":
      v = Math.sin(t * speed * Math.PI * 2);
      break;
    case "triangle": {
      const f = wrap01(t * speed);
      v = f < 0.5 ? f * 4 - 1 : 3 - f * 4;
      break;
    }
    case "saw":
      v = wrap01(t * speed) * 2 - 1;
      break;
    case "perlin":
      // cheap value-noise
      v = Math.sin(t * speed * 1.7) * 0.5 + Math.sin(t * speed * 0.31 + 1.7) * 0.5;
      break;
    case "random":
      // Math.sin(n * largeConstant) is already a pseudo-random-looking value
      // in -1..1 for integer n (9301 isn't a rational multiple of 2π, so
      // consecutive steps land at uncorrelated phases). It does not need —
      // and must not get — the *2-1 rescale used for the other modulators,
      // since that would push an already -1..1 value out to -3..1.
      v = Math.sin(Math.floor(t * speed) * 9301.0);
      break;
    case "beat":
      v = pulse * 2 - 1;
      break;
    case "bass":  v = getAudioData().bass * 2 - 1;   break;
    case "mid":   v = getAudioData().mid  * 2 - 1;   break;
    case "high":  v = getAudioData().high * 2 - 1;   break;
    case "audio": v = getAudioData().energy * 2 - 1; break;
    default:
      v = 0;
  }
  return offset + v * depth;
}
