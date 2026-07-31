import { create } from "zustand";
import { EFFECTS, EFFECTS_BY_ID, type EffectCategory } from "@/engine/effects";
import { BLEND_MODES, type BlendMode } from "@/engine/blend";
import { generateSeed, rngFromSeed } from "@/engine/seed";
import type { AudioMap, Favorite, Intensity, IsolationMode, Layer, Modulator, PaletteProfile, StickerEntry } from "./types";
import type { CameraFacing } from "@/hooks/useCamera";
import { DEFAULT_TILE_UNIFORMS, type TileMode, type TileUniforms } from "@/engine/tile";
import { extractPalette } from "@/engine/imagePalette";
import { BIOME_LABELS, biomeAccentHex } from "@/engine/imagePalette";
import { upscaleImage } from "@/engine/upscaler";
import { toast } from "sonner";

const HISTORY_LIMIT = 20;
const MOSH_EXCLUDED_EFFECTS = new Set(["bloom", "frameSmear"]);

type State = {
  imageUrl: string | null;
  imageElement: HTMLImageElement | null;
  /** Live MediaStream source (camera). When set, takes precedence over imageElement. */
  videoElement: HTMLVideoElement | null;
  videoStream: MediaStream | null;
  /** The WebGL canvas element managed by GlCanvas; used by StickerCapture. */
  glCanvas: HTMLCanvasElement | null;
  layers: Layer[];
  selectedLayerId: string | null;
  seed: string;
  intensity: Intensity;
  showBeforeAfter: boolean;
  beforeAfterSplit: number;
  bpm: number;
  beatEnabled: boolean;
  micEnabled: boolean;
  systemAudioEnabled: boolean;
  micSensitivity: number;
  isPerformanceMode: boolean;
  showMetersInPerformance: boolean;
  /** Auto-mosh shuffle interval in seconds (null = off). */
  shuffleSec: number | null;
  past: Layer[][];
  future: Layer[][];
  slots: Array<Layer[] | null>; // length 9
  activeSlot: number | null;
  lastTouchedParam: { layerId: string; key: string } | null;
  /** UI: live FPS counter visibility (toggled via command palette). */
  showFps: boolean;
  /** UI: transient SLOT N indicator (auto-clears ~1.2s). */
  slotFlash: number | null;
  /** Display name of currently loaded source (for page title). */
  sourceName: string | null;
  /** Seamless tile post-process. */
  tileMode: TileMode;
  tileUniforms: TileUniforms;
  /** Latest extracted palette/biome profile for the current image (null until extracted). */
  paletteProfile: PaletteProfile | null;
  /** Saved effect presets. */
  favorites: Favorite[];
  /** Isolation overlay mode. */
  isolationMode: IsolationMode;
  isolationFeather: number;
  isolationInvert: boolean;
  /** Sticker capture mode. */
  stickerMode: boolean;
  stickerGallery: StickerEntry[];
  /** Which camera is active ('user' = front, 'environment' = rear). */
  cameraFacing: CameraFacing | null;
};

type Actions = {
  setImage: (url: string, el: HTMLImageElement) => void;
  setVideoSource: (stream: MediaStream, name?: string) => void;
  clearVideoSource: () => void;
  clearImage: () => void;
  setGlCanvas: (canvas: HTMLCanvasElement | null) => void;

  addLayer: (effectId: string) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayer: (id: string, dir: -1 | 1) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  setOpacity: (id: string, opacity: number) => void;
  setBlend: (id: string, blend: BlendMode) => void;
  setParam: (id: string, key: string, value: number) => void;
  setModulator: (id: string, key: string, mod: Modulator | null) => void;
  setAudioMap: (id: string, key: string, map: AudioMap | null) => void;
  selectLayer: (id: string | null) => void;

  mosh: (intensity?: Intensity) => void;
  reset: () => void;

  setIntensity: (i: Intensity) => void;
  setBeforeAfter: (open: boolean) => void;
  setBeforeAfterSplit: (v: number) => void;
  setBpm: (bpm: number) => void;
  setBeatEnabled: (b: boolean) => void;
  setMicEnabled: (b: boolean) => void;
  setSystemAudioEnabled: (b: boolean) => void;
  setMicSensitivity: (v: number) => void;
  setPerformanceMode: (b: boolean) => void;
  togglePerformanceMode: () => void;
  setShowMetersInPerformance: (b: boolean) => void;

  shuffleSec: number | null;
  setShuffleSec: (sec: number | null) => void;

  undo: () => void;
  redo: () => void;

  saveSlot: (i: number) => void;
  loadSlot: (i: number) => boolean;
  rerollSeed: () => void;
  clearLayers: () => void;
  removeTopLayer: () => void;
  setLastTouchedParam: (p: { layerId: string; key: string } | null) => void;
  setShowFps: (b: boolean) => void;
  flashSlot: (i: number | null) => void;
  setSourceName: (s: string | null) => void;
  setTileMode: (m: TileMode) => void;
  updateTileUniforms: (u: Partial<TileUniforms>) => void;
  setPaletteProfile: (p: PaletteProfile | null) => void;
  saveFavorite: () => void;
  applyFavorite: (id: string) => boolean;
  removeFavorite: (id: string) => void;
  renameFavorite: (id: string, name: string) => void;
  moshDirected: (ids: string[]) => void;
  moshStorm: (ids: string[], opts?: { explosive?: boolean; regions?: unknown }) => void;
  addStickerToGallery: (sticker: StickerEntry) => void;
  removeStickerFromGallery: (id: string) => void;
  setStickerMode: (b: boolean) => void;
  setIsolationMode: (m: IsolationMode) => void;
  setIsolationFeather: (n: number) => void;
  setIsolationInvert: (b: boolean) => void;
};

const newId = () => Math.random().toString(36).slice(2, 9);

const intensityProfile = (i: Intensity) => {
  switch (i) {
    case "mild":             return { count: [1, 1] as [number, number], opacityRange: [0.65, 0.9] as [number, number], range: 0.65, exoticBlendChance: 0.0 };
    case "savage":           return { count: [2, 3] as [number, number], opacityRange: [0.68, 0.95] as [number, number], range: 0.82, exoticBlendChance: 0.12 };
    case "nuclear":          return { count: [3, 4] as [number, number], opacityRange: [0.72, 0.98] as [number, number], range: 0.95, exoticBlendChance: 0.22 };
    case "interdimensional": return { count: [4, 5] as [number, number], opacityRange: [0.78, 1.0] as [number, number], range: 1.0, exoticBlendChance: 0.3 };
  }
};

/** Blend modes that READ as effects on top of an image (won't usually wipe to black/white). */
const SAFE_BLENDS: BlendMode[] = ["normal", "normal", "normal", "screen", "overlay", "hardLight"];
const EXOTIC_BLENDS: BlendMode[] = ["multiply", "difference", "additive", "screen", "overlay"];

const sampleParam = (
  rand: () => number,
  min: number,
  max: number,
  defaultV: number,
  range: number,
  step?: number,
) => {
  const span = (max - min) * range;
  let v = defaultV + (rand() - 0.5) * span;
  v = Math.max(min, Math.min(max, v));
  if (step) v = Math.round(v / step) * step;
  return v;
};

function pickEffectsWeighted(rand: () => number, count: number): string[] {
  const byCat: Record<EffectCategory, string[]> = {
    corruption: EFFECTS.filter(e => e.category === "corruption" && !MOSH_EXCLUDED_EFFECTS.has(e.id)).map(e => e.id),
    color:      EFFECTS.filter(e => e.category === "color" && !MOSH_EXCLUDED_EFFECTS.has(e.id)).map(e => e.id),
    geometry:   EFFECTS.filter(e => e.category === "geometry" && !MOSH_EXCLUDED_EFFECTS.has(e.id)).map(e => e.id),
    atmosphere: EFFECTS.filter(e => e.category === "atmosphere" && !MOSH_EXCLUDED_EFFECTS.has(e.id)).map(e => e.id),
  };
  const cats: EffectCategory[] = ["corruption", "color", "geometry", "corruption", "atmosphere"];
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length];
    const pool = byCat[cat];
    picked.push(pool[Math.floor(rand() * pool.length)]);
  }
  return picked;
}

function makeLayer(effectId: string, opts: Partial<Layer> = {}): Layer {
  const def = EFFECTS_BY_ID[effectId];
  const params: Record<string, number> = {};
  const mods: Record<string, Modulator | null> = {};
  const audioMaps: Record<string, AudioMap | null> = {};
  for (const p of def.params) {
    params[p.key] = p.default;
    mods[p.key] = null;
    audioMaps[p.key] = null;
  }
  return {
    id: newId(),
    effectId,
    hidden: false,
    locked: false,
    opacity: 1,
    blend: "normal",
    params,
    mods,
    audioMaps,
    ...opts,
  };
}

export const useStore = create<State & Actions>((set, get) => ({
  imageUrl: null,
  imageElement: null,
  videoElement: null,
  videoStream: null,
  glCanvas: null,
  layers: [],
  selectedLayerId: null,
  seed: generateSeed(),
  intensity: "savage",
  showBeforeAfter: false,
  beforeAfterSplit: 0.5,
  bpm: 120,
  beatEnabled: false,
  micEnabled: false,
  systemAudioEnabled: false,
  micSensitivity: 1,
  isPerformanceMode: false,
  showMetersInPerformance: typeof localStorage !== "undefined" && localStorage.getItem("cathedral_meters_in_perf") === "1",
  shuffleSec: null,
  past: [],
  future: [],
  slots: loadSlotsFromStorage(),
  activeSlot: null,
  lastTouchedParam: null,
  showFps: false,
  slotFlash: null,
  sourceName: null,
  tileMode: "none",
  tileUniforms: { ...DEFAULT_TILE_UNIFORMS },
  paletteProfile: null,
  favorites: loadFavoritesFromStorage(),
  isolationMode: "off" as IsolationMode,
  isolationFeather: 4,
  isolationInvert: false,
  stickerMode: false,
  stickerGallery: [],
  cameraFacing: null,

  setGlCanvas: (canvas) => set({ glCanvas: canvas }),

  setImage: (url, el) => {
    // Picking an image kills any active live video.
    const prevStream = useStore.getState().videoStream;
    if (prevStream) { try { prevStream.getTracks().forEach(t => t.stop()); } catch {} }
    set({ imageUrl: url, imageElement: el, videoElement: null, videoStream: null, paletteProfile: null });
    // Async upscale — runs in a worker so the render loop isn't disturbed.
    // When done, swap in the higher-res element so fullscreen / zoom stays crisp.
    upscaleImage(el).then((hi) => {
      if (!hi) return;
      if (useStore.getState().imageElement !== el) return; // a newer image won
      set({ imageElement: hi });
    }).catch(() => {});
    // Async palette extraction; UI never blocks on this.
    extractPalette(el).then((profile) => {
      // Bail if a newer image has loaded since we started.
      if (useStore.getState().imageElement !== el) return;
      useStore.getState().setPaletteProfile(profile);
      try {
        const accent = biomeAccentHex(profile);
        document.documentElement.style.setProperty("--synth-accent", accent);
        toast(`Biome: ${BIOME_LABELS[profile.biome]}`, {
          duration: 2500,
          position: "top-right",
          className: "font-mono uppercase tracking-[0.2em] text-[hsl(var(--accent))]",
        });
      } catch {}
    }).catch(() => {});
  },
  setVideoSource: (stream, name) => {
    // Switching to live video kills any prior stream + still image.
    const prevStream = useStore.getState().videoStream;
    if (prevStream && prevStream !== stream) {
      try { prevStream.getTracks().forEach(t => t.stop()); } catch {}
    }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "true");
    try { video.play()?.catch(() => {}); } catch {}
    const facing: CameraFacing | null =
      name === "front camera" ? "user" : name === "rear camera" ? "environment" : null;
    set({
      imageUrl: null,
      imageElement: null,
      videoElement: video,
      videoStream: stream,
      sourceName: name ?? "live camera",
      paletteProfile: null,
      cameraFacing: facing,
    });
  },
  clearVideoSource: () => {
    const s = useStore.getState();
    if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
    if (s.videoElement) { try { s.videoElement.srcObject = null; } catch {} }
    set({ videoElement: null, videoStream: null });
  },
  clearImage: () => {
    try { document.documentElement.style.removeProperty("--synth-accent"); } catch {}
    const s = useStore.getState();
    if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
    set({ imageUrl: null, imageElement: null, videoElement: null, videoStream: null, sourceName: null, layers: [], past: [], future: [], paletteProfile: null });
  },

  addLayer: (effectId) => {
    const l = makeLayer(effectId);
    set(s => ({ past: pushPast(s), future: [], layers: [...s.layers, l], selectedLayerId: l.id }));
  },

  removeLayer: (id) => set(s => ({
    past: pushPast(s), future: [],
    layers: s.layers.filter(l => l.id !== id),
    selectedLayerId: s.selectedLayerId === id ? null : s.selectedLayerId,
  })),

  duplicateLayer: (id) => set(s => {
    const l = s.layers.find(x => x.id === id);
    if (!l) return s;
    const copy: Layer = { ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } };
    const idx = s.layers.findIndex(x => x.id === id);
    const next = [...s.layers];
    next.splice(idx + 1, 0, copy);
    return { ...s, past: pushPast(s), future: [], layers: next, selectedLayerId: copy.id };
  }),

  reorderLayer: (id, dir) => set(s => {
    const idx = s.layers.findIndex(l => l.id === id);
    if (idx < 0) return s;
    const j = idx + dir;
    if (j < 0 || j >= s.layers.length) return s;
    const next = [...s.layers];
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...s, past: pushPast(s), future: [], layers: next };
  }),

  toggleHidden: (id) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, hidden: !l.hidden })) })),
  toggleLocked: (id) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, locked: !l.locked })) })),
  setOpacity: (id, opacity) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, opacity })) })),
  setBlend: (id, blend) => set(s => ({ layers: mapLayer(s.layers, id, l => ({ ...l, blend })) })),
  setParam: (id, key, value) => set(s => ({
    lastTouchedParam: { layerId: id, key },
    layers: mapLayer(s.layers, id, l => ({ ...l, params: { ...l.params, [key]: value } })),
  })),
  setModulator: (id, key, mod) => set(s => ({
    layers: mapLayer(s.layers, id, l => ({ ...l, mods: { ...l.mods, [key]: mod } })),
  })),
  setAudioMap: (id, key, map) => set(s => ({
    past: pushPast(s), future: [],
    layers: mapLayer(s.layers, id, l => ({ ...l, audioMaps: { ...(l.audioMaps ?? {}), [key]: map } })),
  })),
  selectLayer: (id) => set({ selectedLayerId: id }),

  mosh: (intensity) => set(s => {
    const inten = intensity ?? s.intensity;
    const profile = intensityProfile(inten);
    const seed = generateSeed();
    const rand = rngFromSeed(seed);

    const locked = s.layers.filter(l => l.locked);
    const targetCount = Math.floor(profile.count[0] + rand() * (profile.count[1] - profile.count[0] + 1));
    const newEffects = pickEffectsWeighted(rand, targetCount);

    const fresh: Layer[] = newEffects.map((eid, idx) => {
      const def = EFFECTS_BY_ID[eid];
      const params: Record<string, number> = {};
      for (const p of def.params) {
        params[p.key] = sampleParam(rand, p.min, p.max, p.default, profile.range, p.step);
      }
      // First layer is always 'normal' so we have a base; subsequent layers
      // pick from safe pool, occasionally exotic. This prevents the stack
      // from collapsing to black/white at high intensity.
      let blend: BlendMode;
      if (idx === 0) {
        blend = "normal";
      } else if (rand() < profile.exoticBlendChance) {
        blend = EXOTIC_BLENDS[Math.floor(rand() * EXOTIC_BLENDS.length)];
      } else {
        blend = SAFE_BLENDS[Math.floor(rand() * SAFE_BLENDS.length)];
      }
      // First layer always full opacity so the image is visible.
      const opacity = idx === 0
        ? 1
        : profile.opacityRange[0] + rand() * (profile.opacityRange[1] - profile.opacityRange[0]);
      return {
        id: newId(),
        effectId: eid,
        hidden: false, locked: false,
        blend, opacity,
        params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      };
    });

    return { ...s, past: pushPast(s), future: [], layers: [...locked, ...fresh], seed };
  }),

  reset: () => set(s => ({ ...s, past: pushPast(s), future: [], layers: [] })),

  setIntensity: (i) => set({ intensity: i }),
  setBeforeAfter: (open) => set({ showBeforeAfter: open }),
  setBeforeAfterSplit: (v) => set({ beforeAfterSplit: v }),
  setBpm: (bpm) => set({ bpm }),
  setBeatEnabled: (b) => set({ beatEnabled: b }),
  setMicEnabled: (b) => set(s => b ? { micEnabled: true, systemAudioEnabled: false } : { micEnabled: false }),
  setSystemAudioEnabled: (b) => set(s => b ? { systemAudioEnabled: true, micEnabled: false } : { systemAudioEnabled: false }),
  setMicSensitivity: (v) => set({ micSensitivity: v }),
  setPerformanceMode: (b) => set({ isPerformanceMode: b }),
  togglePerformanceMode: () => set(s => ({ isPerformanceMode: !s.isPerformanceMode })),
  setShowMetersInPerformance: (b) => {
    try { localStorage.setItem("cathedral_meters_in_perf", b ? "1" : "0"); } catch {}
    set({ showMetersInPerformance: b });
  },

  setShuffleSec: (sec) => set({ shuffleSec: sec }),

  undo: () => set(s => {
    if (!s.past.length) return s;
    const prev = s.past[s.past.length - 1];
    return { ...s, layers: prev, past: s.past.slice(0, -1), future: [s.layers, ...s.future].slice(0, HISTORY_LIMIT) };
  }),
  redo: () => set(s => {
    if (!s.future.length) return s;
    const next = s.future[0];
    return { ...s, layers: next, past: [...s.past, s.layers].slice(-HISTORY_LIMIT), future: s.future.slice(1) };
  }),

  saveSlot: (i) => set(s => {
    if (i < 0 || i > 8) return s;
    const slots = s.slots.slice();
    // deep-ish clone of layers
    slots[i] = s.layers.map(l => ({ ...l, params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    saveSlotsToStorage(slots);
    return { ...s, slots, activeSlot: i };
  }),
  loadSlot: (i) => {
    const s = get();
    const slot = s.slots[i];
    if (!slot) return false;
    const cloned = slot.map(l => ({ ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    set({ ...s, past: pushPast(s), future: [], layers: cloned, activeSlot: i, selectedLayerId: null });
    return true;
  },
  rerollSeed: () => set({ seed: generateSeed() }),
  clearLayers: () => set(s => ({ ...s, past: pushPast(s), future: [], layers: [], selectedLayerId: null })),
  removeTopLayer: () => set(s => {
    if (!s.layers.length) return s;
    return { ...s, past: pushPast(s), future: [], layers: s.layers.slice(0, -1) };
  }),
  setLastTouchedParam: (p) => set({ lastTouchedParam: p }),
  setShowFps: (b) => set({ showFps: b }),
  flashSlot: (i) => set({ slotFlash: i }),
  setSourceName: (s) => set({ sourceName: s }),
  setTileMode: (m) => set({ tileMode: m }),
  updateTileUniforms: (u) => set(s => ({ tileUniforms: { ...s.tileUniforms, ...u } })),
  setPaletteProfile: (p) => set({ paletteProfile: p }),

  saveFavorite: () => {
    const s = get();
    const fav: Favorite = {
      id: (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
      name: `Preset ${new Date().toLocaleTimeString()}`,
      layers: s.layers.map(l => ({ ...l, params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } })),
      seed: s.seed,
      createdAt: new Date().toISOString(),
    };
    set(st => {
      const next = [...st.favorites, fav];
      try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
      return { favorites: next };
    });
  },

  applyFavorite: (id) => {
    const s = get();
    const fav = s.favorites.find(f => f.id === id);
    if (!fav) return false;
    const cloned = fav.layers.map(l => ({ ...l, id: newId(), params: { ...l.params }, mods: { ...l.mods }, audioMaps: { ...(l.audioMaps ?? {}) } }));
    set({ past: pushPast(s), future: [], layers: cloned, seed: fav.seed ?? s.seed });
    return true;
  },

  removeFavorite: (id) => set(st => {
    const next = st.favorites.filter(f => f.id !== id);
    try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
    return { favorites: next };
  }),

  renameFavorite: (id, name) => set(st => {
    const next = st.favorites.map(f => f.id === id ? { ...f, name } : f);
    try { localStorage.setItem("cathedral_favorites_v1", JSON.stringify(next)); } catch {}
    return { favorites: next };
  }),

  moshDirected: (ids) => set(s => {
    const seed = generateSeed();
    const rand = rngFromSeed(seed);
    const locked = s.layers.filter(l => l.locked);
    const fresh: Layer[] = ids.flatMap((eid, idx) => {
      const def = EFFECTS_BY_ID[eid];
      if (!def) return [];
      const params: Record<string, number> = {};
      for (const p of def.params) params[p.key] = p.default;
      return [{
        id: newId(),
        effectId: eid,
        hidden: false, locked: false,
        blend: (idx === 0 ? "normal" : SAFE_BLENDS[Math.floor(rand() * SAFE_BLENDS.length)]) as import("@/engine/blend").BlendMode,
        opacity: idx === 0 ? 1 : 0.75 + rand() * 0.25,
        params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      }];
    });
    return { ...s, past: pushPast(s), future: [], layers: [...locked, ...fresh], seed };
  }),

  moshStorm: (ids) => set(s => {
    const seed = generateSeed();
    const rand = rngFromSeed(seed);
    const locked = s.layers.filter(l => l.locked);
    const fresh: Layer[] = ids.flatMap((eid, idx) => {
      const def = EFFECTS_BY_ID[eid];
      if (!def) return [];
      const params: Record<string, number> = {};
      for (const p of def.params) {
        params[p.key] = sampleParam(rand, p.min, p.max, p.default, 0.9, p.step);
      }
      return [{
        id: newId(),
        effectId: eid,
        hidden: false, locked: false,
        blend: (idx === 0 ? "normal" : EXOTIC_BLENDS[Math.floor(rand() * EXOTIC_BLENDS.length)]) as import("@/engine/blend").BlendMode,
        opacity: idx === 0 ? 1 : 0.7 + rand() * 0.3,
        params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      }];
    });
    return { ...s, past: pushPast(s), future: [], layers: [...locked, ...fresh], seed };
  }),

  addStickerToGallery: (sticker) => set(s => ({ stickerGallery: [...s.stickerGallery, sticker] })),
  removeStickerFromGallery: (id) => set(s => ({ stickerGallery: s.stickerGallery.filter(x => x.id !== id) })),
  setStickerMode: (b) => set({ stickerMode: b }),
  setIsolationMode: (m) => set({ isolationMode: m }),
  setIsolationFeather: (n) => set({ isolationFeather: n }),
  setIsolationInvert: (b) => set({ isolationInvert: b }),
}));

function mapLayer(layers: Layer[], id: string, fn: (l: Layer) => Layer): Layer[] {
  return layers.map(l => l.id === id ? fn(l) : l);
}
function pushPast(s: State): Layer[][] {
  return [...s.past, s.layers].slice(-HISTORY_LIMIT);
}

function loadFavoritesFromStorage(): Favorite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("cathedral_favorites_v1");
    if (raw) return JSON.parse(raw) as Favorite[];
  } catch {}
  return [];
}

function loadSlotsFromStorage(): Array<Layer[] | null> {
  const out: Array<Layer[] | null> = Array(9).fill(null);
  if (typeof localStorage === "undefined") return out;
  for (let i = 0; i < 9; i++) {
    try {
      const raw = localStorage.getItem(`cathedral_slot_${i + 1}`);
      if (raw) out[i] = JSON.parse(raw) as Layer[];
    } catch {}
  }
  return out;
}
function saveSlotsToStorage(slots: Array<Layer[] | null>) {
  if (typeof localStorage === "undefined") return;
  for (let i = 0; i < 9; i++) {
    try {
      const key = `cathedral_slot_${i + 1}`;
      if (slots[i]) localStorage.setItem(key, JSON.stringify(slots[i]));
      else localStorage.removeItem(key);
    } catch {}
  }
}
