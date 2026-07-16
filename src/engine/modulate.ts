import { EFFECTS_BY_ID } from "./effects";
import type { AudioLevels } from "./audio";
import type { Layer, Modulator } from "@/store/types";
import type { RenderLayer } from "./Renderer";

/** Cheap value-noise for the "perlin" modulator — good enough for wobble. */
function vnoise(t: number, seed: number) {
  const i = Math.floor(t), f = t - i;
  const r = (n: number) => {
    const x = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const u = f * f * (3 - 2 * f);
  return r(i) * (1 - u) + r(i + 1) * u;
}

function wave(mod: Modulator, t: number, levels: AudioLevels, pulse: number, seed: number): number {
  const ph = t * mod.speed;
  switch (mod.type) {
    case "sine":     return Math.sin(ph * Math.PI * 2);
    case "triangle": return 1 - 4 * Math.abs(((ph + 0.25) % 1) - 0.5);
    case "saw":      return (ph % 1) * 2 - 1;
    case "perlin":   return vnoise(ph * 2, seed) * 2 - 1;
    case "random":   return vnoise(Math.floor(ph * 4), seed) * 2 - 1; // stepped S&H
    case "beat":     return Math.max(levels.beat, pulse) * 2 - 1;
    case "bass":     return levels.bass * 2 - 1;
    case "mid":      return levels.mid * 2 - 1;
    case "high":     return levels.treble * 2 - 1;
    case "audio":    return levels.overall * 2 - 1;
  }
}

/**
 * Resolve a layer stack into per-frame RenderLayers: applies modulators and
 * audio maps on top of the static params, clamped to each param's range.
 */
export function resolveLayers(
  layers: Layer[],
  t: number,
  levels: AudioLevels,
  pulse: number,
): RenderLayer[] {
  const out: RenderLayer[] = [];
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const def = EFFECTS_BY_ID[layer.effectId];
    if (!def) continue;
    const params: Record<string, number> = {};
    for (const p of def.params) {
      let v = layer.params[p.key] ?? p.default;
      const span = p.max - p.min;
      const mod = layer.mods[p.key];
      if (mod && mod.depth > 0) {
        const w = wave(mod, t, levels, pulse, li * 13.7 + p.key.length);
        v += (w + mod.offset) * mod.depth * span * 0.5;
      }
      const am = layer.audioMaps?.[p.key];
      if (am && am.amount !== 0) {
        const src = am.source === "treble" ? levels.treble
                  : am.source === "beat" ? Math.max(levels.beat, pulse)
                  : levels[am.source];
        v += src * am.amount * span;
      }
      params[p.key] = Math.max(p.min, Math.min(p.max, v));
    }
    out.push({
      id: layer.id,
      effectId: layer.effectId,
      hidden: layer.hidden,
      opacity: layer.opacity,
      blend: layer.blend,
      params,
    });
  }
  return out;
}

/** Metronome envelope from BPM: sharp attack on the beat, cubic decay. */
export function bpmPulse(t: number, bpm: number): number {
  const phase = (t * bpm / 60) % 1;
  return Math.pow(1 - phase, 3);
}
