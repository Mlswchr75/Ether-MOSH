/**
 * Preset ⇄ URL codec.
 *
 * A look has to survive being a link. Once it does, several things stop being
 * features and start being free: an OBS browser source is a URL, a VJ setlist
 * is a folder of bookmarks, sharing a look is sharing a link back to MOSH, and
 * a partner embed is an iframe.
 *
 * Two properties matter more than compactness:
 *
 * DURABILITY — a link posted today must still open the same look in a year.
 * That rules out storing effect *indices*, which would silently re-point at a
 * different effect the moment the library is reordered. Ids cost more bytes and
 * are worth every one of them.
 *
 * TOTALITY — decode never throws. A truncated, hand-edited, or
 * older/newer-version link degrades to whatever it can recover, or to null. A
 * shared link that crashes the app is worse than one that opens the wrong look.
 *
 * Param values are stored normalised to their declared range rather than
 * absolute, so widening a param's range later rescales old links sensibly
 * instead of putting them out of bounds.
 */
import { BLEND_MODES, REGION_MODES, type BlendMode, type LayerRegion, type RegionMode } from "./blend";
import { EFFECTS_BY_ID } from "./effects";
import { ROLE_ORDER, normalizeLayerRoles } from "./effectRoles";
import type { AudioMap, AudioSource, Intensity, Layer, Modulator, ModulatorType } from "@/store/types";

const VERSION = 1;

const INTENSITIES: Intensity[] = ["mild", "savage", "nuclear", "interdimensional"];
const MOD_TYPES: ModulatorType[] = [
  "sine", "triangle", "saw", "perlin", "random", "beat", "bass", "mid", "high", "audio",
];
const AUDIO_SOURCES: AudioSource[] = ["bass", "mid", "treble", "overall", "beat"];

/** Fixed-point scale for normalised values. 1000 steps is finer than the eye. */
const Q = 1000;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const qEnc = (v01: number) => Math.round(clamp01(v01) * Q);
const qDec = (q: number) => clamp01((Number(q) || 0) / Q);

export type PresetPayload = {
  seed?: string;
  intensity?: Intensity;
  lookId?: string;
  layers: Layer[];
};

type WireLayer = {
  e: string;
  o: number;
  b: number;
  g?: 0 | 1 | 2 | 3;
  h?: 1;
  p?: Record<string, number>;
  r?: [number, number, number, number, number, number];
  m?: Record<string, [number, number, number, number]>;
  a?: Record<string, [number, number, number]>;
};

type Wire = {
  v: number;
  s?: string;
  i?: number;
  k?: string;
  l: WireLayer[];
};

/* ── base64url, unicode-safe both directions ─────────────────────────── */

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string | null {
  try {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/* ── encode ──────────────────────────────────────────────────────────── */

export function encodePreset(input: PresetPayload): string {
  const layers: WireLayer[] = [];

  for (const l of input.layers) {
    const def = EFFECTS_BY_ID[l.effectId];
    if (!def) continue; // never emit a layer that cannot be decoded back

    const w: WireLayer = {
      e: l.effectId,
      o: qEnc(l.opacity),
      b: Math.max(0, BLEND_MODES.indexOf(l.blend)),
    };
    if (l.role) {
      const roleIndex = ROLE_ORDER.indexOf(l.role);
      if (roleIndex >= 0) w.g = roleIndex as 0 | 1 | 2 | 3;
    }
    if (l.hidden) w.h = 1;

    // Normalise against the declared range so a later range change rescales
    // rather than clipping.
    const p: Record<string, number> = {};
    let anyParam = false;
    for (const spec of def.params) {
      const raw = l.params?.[spec.key];
      if (raw === undefined) continue;
      const span = spec.max - spec.min;
      p[spec.key] = qEnc(span > 0 ? (raw - spec.min) / span : 0);
      anyParam = true;
    }
    if (anyParam) w.p = p;

    if (l.region && l.region.mode !== "none") {
      const r = l.region;
      w.r = [
        Math.max(0, REGION_MODES.indexOf(r.mode)),
        // Scale is unbounded (band counts, shard density, radius) — store it
        // scaled by 10 and rounded rather than normalised.
        Math.round((r.scale ?? 1) * 10),
        qEnc(r.phase ?? 0),
        qEnc(r.gate ?? 0.5),
        qEnc(r.feather ?? 0.12),
        r.invert ? 1 : 0,
      ];
    }

    const mods: Record<string, [number, number, number, number]> = {};
    let anyMod = false;
    for (const [k, m] of Object.entries(l.mods ?? {})) {
      if (!m) continue;
      mods[k] = [
        Math.max(0, MOD_TYPES.indexOf(m.type)),
        Math.round(m.speed * 100),
        qEnc(m.depth),
        qEnc((m.offset + 1) / 2), // -1..1 -> 0..1
      ];
      anyMod = true;
    }
    if (anyMod) w.m = mods;

    const maps: Record<string, [number, number, number]> = {};
    let anyMap = false;
    for (const [k, a] of Object.entries(l.audioMaps ?? {})) {
      if (!a) continue;
      maps[k] = [
        Math.max(0, AUDIO_SOURCES.indexOf(a.source)),
        qEnc((a.amount + 1) / 2), // -1..1 -> 0..1
        qEnc(a.smoothing),
      ];
      anyMap = true;
    }
    if (anyMap) w.a = maps;

    layers.push(w);
  }

  const wire: Wire = { v: VERSION, l: layers };
  if (input.seed) wire.s = input.seed;
  if (input.intensity) {
    const i = INTENSITIES.indexOf(input.intensity);
    if (i >= 0) wire.i = i;
  }
  if (input.lookId) wire.k = input.lookId;

  return toB64Url(JSON.stringify(wire));
}

/* ── decode ──────────────────────────────────────────────────────────── */

let nextId = 0;
const layerId = () => `p${Date.now().toString(36)}${(nextId++).toString(36)}`;

/**
 * Decode a preset string. Never throws.
 *
 * Unknown effect ids are skipped rather than failing the whole link: a preset
 * shared before an effect was renamed should still open, minus that layer,
 * instead of opening nothing at all.
 */
export function decodePreset(encoded: string): PresetPayload | null {
  if (!encoded || typeof encoded !== "string") return null;
  const json = fromB64Url(encoded.trim());
  if (!json) return null;

  let wire: Wire;
  try {
    wire = JSON.parse(json) as Wire;
  } catch {
    return null;
  }
  if (!wire || typeof wire !== "object" || !Array.isArray(wire.l)) return null;
  // Unknown future versions are refused rather than half-read: guessing at a
  // layout we do not know produces a wrong look, which is worse than none.
  if (typeof wire.v !== "number" || wire.v > VERSION) return null;

  const layers: Layer[] = [];
  for (const w of wire.l) {
    if (!w || typeof w.e !== "string") continue;
    const def = EFFECTS_BY_ID[w.e];
    if (!def) continue;

    const params: Record<string, number> = {};
    for (const spec of def.params) {
      const span = spec.max - spec.min;
      const stored = w.p?.[spec.key];
      let v = stored === undefined ? spec.default : spec.min + qDec(stored) * span;
      if (spec.step) v = Math.round(v / spec.step) * spec.step;
      params[spec.key] = Math.max(spec.min, Math.min(spec.max, v));
    }

    let region: LayerRegion | null = null;
    if (Array.isArray(w.r) && w.r.length >= 6) {
      const mode = REGION_MODES[w.r[0]] as RegionMode | undefined;
      if (mode && mode !== "none") {
        region = {
          mode,
          scale: (Number(w.r[1]) || 0) / 10,
          phase: qDec(w.r[2]),
          gate: qDec(w.r[3]),
          feather: qDec(w.r[4]),
          invert: !!w.r[5],
        };
      }
    }

    const mods: Record<string, Modulator | null> = {};
    const audioMaps: Record<string, AudioMap | null> = {};
    for (const spec of def.params) {
      mods[spec.key] = null;
      audioMaps[spec.key] = null;
    }
    for (const [k, m] of Object.entries(w.m ?? {})) {
      if (!(k in mods) || !Array.isArray(m) || m.length < 4) continue;
      mods[k] = {
        type: MOD_TYPES[m[0]] ?? "sine",
        speed: (Number(m[1]) || 0) / 100,
        depth: qDec(m[2]),
        offset: qDec(m[3]) * 2 - 1,
      };
    }
    for (const [k, a] of Object.entries(w.a ?? {})) {
      if (!(k in audioMaps) || !Array.isArray(a) || a.length < 3) continue;
      audioMaps[k] = {
        source: AUDIO_SOURCES[a[0]] ?? "overall",
        amount: qDec(a[1]) * 2 - 1,
        smoothing: qDec(a[2]),
      };
    }

    layers.push({
      id: layerId(),
      effectId: w.e,
      hidden: w.h === 1,
      locked: false,
      opacity: qDec(w.o),
      blend: (BLEND_MODES[w.b] ?? "normal") as BlendMode,
      region,
      params,
      mods,
      audioMaps,
      role: typeof w.g === "number" ? ROLE_ORDER[w.g] : undefined,
    });
  }

  if (!layers.length) return null;

  return {
    layers: normalizeLayerRoles(layers),
    seed: typeof wire.s === "string" ? wire.s : undefined,
    intensity: typeof wire.i === "number" ? INTENSITIES[wire.i] : undefined,
    lookId: typeof wire.k === "string" ? wire.k : undefined,
  };
}

/* ── URL helpers ─────────────────────────────────────────────────────── */

/** Query key the preset travels under. */
export const PRESET_PARAM = "p";

export function presetToUrl(payload: PresetPayload, base?: string): string {
  const origin = base ?? (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "/");
  const url = new URL(origin, typeof window !== "undefined" ? window.location.href : "https://ether-mosh.netlify.app");
  url.searchParams.set(PRESET_PARAM, encodePreset(payload));
  return url.toString();
}

/** Read a preset out of a URL (or the current location). Never throws. */
export function presetFromUrl(href?: string): PresetPayload | null {
  try {
    const h = href ?? (typeof window !== "undefined" ? window.location.href : "");
    if (!h) return null;
    const raw = new URL(h).searchParams.get(PRESET_PARAM);
    return raw ? decodePreset(raw) : null;
  } catch {
    return null;
  }
}
