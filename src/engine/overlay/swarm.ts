import type { OverlaySwarm } from "./types";

export type SwarmInstance = {
  id: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  speed: number;
  direction: 1 | -1;
};

export const MAX_SWARM_INSTANCES = 32;
export const MAX_LOTTIE_SWARM_INSTANCES = 12;

function rand(seed: number, index: number): number {
  let x = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0xffffffff;
}

export function generateSwarmInstances(swarm: OverlaySwarm, lottie = false): SwarmInstance[] {
  if (!swarm.enabled) return [];
  const hardCap = lottie ? MAX_LOTTIE_SWARM_INSTANCES : MAX_SWARM_INSTANCES;
  const count = Math.max(1, Math.min(hardCap, Math.round(swarm.count)));
  const spread = Math.max(0, Math.min(3, swarm.spread));
  const chaos = Math.max(0, Math.min(1, swarm.chaos));

  return Array.from({ length: count }, (_, i) => {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + (rand(swarm.seed, i * 7) - 0.5) * chaos * 1.5;
    const ring = 0.25 + rand(swarm.seed, i * 7 + 1) * 0.75;
    const radius = ring * spread * 85;
    const sizeJitter = (rand(swarm.seed, i * 7 + 2) - 0.5) * chaos;
    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      scale: Math.max(0.15, 0.7 + sizeJitter * 0.8),
      rotation: (rand(swarm.seed, i * 7 + 3) - 0.5) * 180 * chaos,
      opacity: Math.max(0.25, 0.7 + (rand(swarm.seed, i * 7 + 4) - 0.5) * 0.55),
      speed: Math.max(0.3, 1 + (rand(swarm.seed, i * 7 + 5) - 0.5) * chaos * 1.2),
      direction: rand(swarm.seed, i * 7 + 6) > 0.5 ? 1 : -1,
    };
  });
}
