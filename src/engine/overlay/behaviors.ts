import type { OverlayBehavior, OverlayTransform } from "./types";

export type OverlayBehaviorDelta = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
};

const NONE: OverlayBehaviorDelta = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };

function hash01(seed: number, n: number): number {
  let x = (seed ^ Math.imul(n + 1, 0x45d9f3b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function valueNoise(seed: number, t: number, channel: number): number {
  const i = Math.floor(t);
  const f = smoothstep(t - i);
  const a = hash01(seed + channel * 1013, i) * 2 - 1;
  const b = hash01(seed + channel * 1013, i + 1) * 2 - 1;
  return a + (b - a) * f;
}

/**
 * Pure deterministic behavior sampler. `timeMs` is the only changing input;
 * callers can render at any cadence without writing frame state to Zustand.
 */
export function sampleBehavior(
  behavior: OverlayBehavior,
  timeMs: number,
  _base?: OverlayTransform,
): OverlayBehaviorDelta {
  if (behavior.kind === "none" || behavior.amount <= 0) return NONE;

  const amount = Math.max(0, Math.min(1, behavior.amount));
  const speed = Math.max(0.05, behavior.speed);
  const t = timeMs / 1000;
  const phase = ((behavior.seed % 10000) / 10000) * Math.PI * 2;
  const wave = Math.sin(t * speed * Math.PI * 2 + phase);
  const wave2 = Math.cos(t * speed * Math.PI * 2 * 0.73 + phase * 1.7);

  switch (behavior.kind) {
    case "float":
      return { ...NONE, y: wave * 0.035 * amount, x: wave2 * 0.012 * amount };
    case "pulse":
      return { ...NONE, scale: 1 + ((wave + 1) * 0.5) * 0.22 * amount };
    case "wobble":
      return { ...NONE, rotation: wave * 13 * amount, x: wave2 * 0.01 * amount };
    case "orbit":
      return {
        ...NONE,
        x: Math.cos(t * speed * Math.PI * 2 + phase) * 0.055 * amount,
        y: Math.sin(t * speed * Math.PI * 2 + phase) * 0.055 * amount,
      };
    case "bounce": {
      const bounce = Math.abs(Math.sin(t * speed * Math.PI + phase));
      return { ...NONE, y: -bounce * 0.06 * amount, scale: 1 + (1 - bounce) * 0.06 * amount };
    }
    case "flicker": {
      const bucket = Math.floor(t * speed * 10);
      const on = hash01(behavior.seed, bucket) > 0.28 * amount;
      return { ...NONE, opacity: on ? 1 : Math.max(0.08, 1 - 0.92 * amount) };
    }
    case "jitter": {
      const bucket = Math.floor(t * speed * 18);
      return {
        ...NONE,
        x: (hash01(behavior.seed, bucket * 2) * 2 - 1) * 0.025 * amount,
        y: (hash01(behavior.seed, bucket * 2 + 1) * 2 - 1) * 0.025 * amount,
        rotation: (hash01(behavior.seed + 17, bucket) * 2 - 1) * 6 * amount,
      };
    }
    case "random-walk":
      return {
        ...NONE,
        x: valueNoise(behavior.seed, t * speed * 0.75, 0) * 0.08 * amount,
        y: valueNoise(behavior.seed, t * speed * 0.75, 1) * 0.08 * amount,
        rotation: valueNoise(behavior.seed, t * speed * 0.45, 2) * 10 * amount,
      };
    default:
      return NONE;
  }
}
