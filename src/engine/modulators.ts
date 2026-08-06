import type { ModulatorType } from "@/store/types";
import { getAudioData } from "./audioAnalyzer";


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
      const f = (t * speed) % 1;
      v = f < 0.5 ? f * 4 - 1 : 3 - f * 4;
      break;
    }
    case "saw":
      v = ((t * speed) % 1) * 2 - 1;
      break;
    case "perlin":
      // cheap value-noise
      v = Math.sin(t * speed * 1.7) * 0.5 + Math.sin(t * speed * 0.31 + 1.7) * 0.5;
      break;
    case "random":
      v = Math.sin(Math.floor(t * speed) * 9301.0) * 2 - 1;
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
