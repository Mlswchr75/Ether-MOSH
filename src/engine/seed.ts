/**
 * AegisMosh seed engine — short shareable codes.
 * Format: AEGIS://vibe/<base36>
 */
export function generateSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, "0").slice(0, 7);
}

export function seedToCode(seed: string): string {
  return `AEGIS://vibe/${seed}`;
}

/** Mulberry32 deterministic PRNG */
export function rngFromSeed(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
