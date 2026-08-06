import { create } from "zustand";
import { EFFECTS, EFFECTS_BY_ID, type EffectCategory } from "@/engine/effects";
import { BLEND_MODES, type BlendMode } from "@/engine/blend";
import {
  QUADRANT_COUNT,
  relationLabel,
  skewedAffinity,
  type QuadrantIndex,
  type RelationLabel,
} from "@/engine/quadrants";
import {
  LOOKS_BY_ID as LOOKS_LOOKUP,
  analyzeSource,
  blendForRole,
  briefFrom,
  chooseLook,
  compose,
  opacityForRole,
  paramsForRole,
  pickForRole,
  roleForQuadrant,
  type FrameBrief,
  type Look,
  type Role,
} from "@/engine/artDirector";
import { generateSeed, rngFromSeed } from "@/engine/seed";
import type { AudioMap, Favorite, Intensity, IsolationMode, Layer, Modulator, PaletteProfile, StickerEntry } from "./types";
import { facingOfTrack, type CameraFacing } from "@/lib/cameraFacing";
import { DEFAULT_TILE_UNIFORMS, type TileMode, type TileUniforms } from "@/engine/tile";
import { extractPalette } from "@/engine/imagePalette";
import { BIOME_LABELS, biomeAccentHex } from "@/engine/imagePalette";
import { upscaleImage } from "@/engine/upscaler";
import { toast } from "sonner";

const HISTORY_LIMIT = 20;
/** How many recently-used effects each quadrant refuses to roll again. */
const QUADRANT_MEMORY = 4;
/** How many recently-used effects a full mosh avoids reaching for. */
const MOSH_MEMORY = 8;
/** How many recent art directions to rotate past before reusing one. */
const LOOK_MEMORY = 4;

/**
 * How many parts of the composition each intensity fills.
 * 2 = grade + finish (a straight remaster), 4 = the full sentence.
 */
const ROLE_COUNT: Record<Intensity, number> = {
  mild: 2,
  savage: 3,
  nuclear: 5,
  interdimensional: 7,
};

/**
 * How far the director may break its own grammar at each intensity.
 *
 * Mild stays strict — it is the setting you reach for when you want the shot
 * back, not reinvented. The top end is meant to surprise you, so it reaches
 * outside the role shelves often enough that no two stacks rhyme.
 *
 * interdimensional used to be identical to nuclear; depth and chaos are what
 * now make it a different setting rather than a different word.
 */
const CHAOS: Record<Intensity, number> = {
  mild: 0,
  savage: 0.15,
  nuclear: 0.35,
  interdimensional: 0.6,
};

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
  /** Per-quadrant ring of recently-rolled effect ids (anti-repetition). */
  quadrantHistory: string[][];
  /** Recently-used effect ids across full moshes (anti-repetition). */
  recentEffects: string[];
  /** Recently-used look ids. Rotating the art direction — not just the
   *  effects — is what keeps consecutive moshes from reading the same. */
  recentLooks: string[];
  /** The art direction the current stack was composed under. */
  currentLook: { id: string; name: string; blurb: string } | null;
  /** Latest content analysis, for the UI to show what the director saw. */
  currentBrief: FrameBrief | null;
  /** Last quadrant roll — drives the transient on-canvas readout. */
  lastQuadrantRoll: QuadrantRoll | null;
  /**
   * Which voice the next plain tap re-rolls. Tapping cycles GRADE → FORM →
   * ACCENT → FINISH so the stack evolves one part at a time without the user
   * having to aim at anything; a full mosh resets it to the grade.
   */
  voiceCursor: number;
};

export type QuadrantRoll = {
  quadrant: QuadrantIndex;
  effectId: string;
  effectName: string;
  relation: RelationLabel;
  affinity: number;
  /** Which part of the composition this quadrant drives. */
  role: Role;
  /** performance.now() at roll time — used to auto-fade the readout. */
  at: number;
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

  /**
   * Re-roll a single quadrant against whatever the other three hold. Pads the
   * stack when the quadrant is still empty so the quadrant↔layer map stays
   * 1:1. Returns the roll, or null when the target layer is locked.
   */
  moshQuadrant: (q: QuadrantIndex, opts?: { targetAffinity?: number }) => QuadrantRoll | null;
  /**
   * Re-roll the next voice in rotation. This is what a plain tap does: no
   * aiming, no map to memorise, but a smaller and more steerable change than a
   * full mosh. Skips locked voices; returns null only when every voice is
   * locked.
   */
  moshNext: () => QuadrantRoll | null;
  clearQuadrantRoll: () => void;

  /**
   * Drop every effect and stop anything that would re-apply one, leaving the
   * bare HDR-remastered source on screen. Undoable like any other change.
   */
  clearAllFx: () => void;

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
  moshDirected: (layers: import("@/engine/compose").DirectedLayer[]) => void;
  moshStorm: (ids: string[], opts?: { explosive?: boolean; regions?: unknown }) => void;
  addStickerToGallery: (sticker: StickerEntry) => void;
  removeStickerFromGallery: (id: string) => void;
  setStickerMode: (b: boolean) => void;
  setIsolationMode: (m: IsolationMode) => void;
  setIsolationFeather: (n: number) => void;
  setIsolationInvert: (b: boolean) => void;
};

const newId = () => Math.random().toString(36).slice(2, 9);

/** A layer at the effect's own defaults — used when the user adds one by hand. */
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
  quadrantHistory: Array.from({ length: QUADRANT_COUNT }, () => [] as string[]),
  voiceCursor: 0,
  recentEffects: [],
  recentLooks: [],
  currentLook: null,
  currentBrief: null,
  lastQuadrantRoll: null,

  setGlCanvas: (canvas) => set({ glCanvas: canvas }),

  setImage: (url, el) => {
    // Picking an image kills any active live video.
    const prevStream = useStore.getState().videoStream;
    if (prevStream) { try { prevStream.getTracks().forEach(t => t.stop()); } catch {} }
    const prevVideo = useStore.getState().videoElement;
    if (prevVideo) { try { prevVideo.srcObject = null; } catch {} try { prevVideo.parentNode?.removeChild(prevVideo); } catch {} }
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
    // Remove any previous off-screen video node.
    const prevVideo = useStore.getState().videoElement;
    if (prevVideo) { try { prevVideo.srcObject = null; } catch {} try { prevVideo.parentNode?.removeChild(prevVideo); } catch {} }
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "true");
    // iOS Safari requires the <video> element to be in the DOM for MediaStream
    // autoplay to work — off-DOM video elements silently fail to play on iOS.
    Object.assign(video.style, {
      position: "fixed", top: "-9999px", left: "-9999px",
      width: "1px", height: "1px", opacity: "0", pointerEvents: "none",
    });
    document.body.appendChild(video);
    try { video.play()?.catch(() => {}); } catch {}
    // Derive facing from the TRACK, not from the label we passed in. The label
    // records what we asked for; the track records what we actually got. Trusting
    // the label let cameraFacing drift out of sync with reality, and since the
    // flip button computes the next side from it, the toggle could stick.
    const facing: CameraFacing | null =
      facingOfTrack(stream.getVideoTracks()[0])
      ?? (name === "front camera" ? "user" : name === "rear camera" ? "environment" : null);
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
    if (s.videoElement) {
      try { s.videoElement.srcObject = null; } catch {}
      try { s.videoElement.parentNode?.removeChild(s.videoElement); } catch {}
    }
    set({ videoElement: null, videoStream: null });
  },
  clearImage: () => {
    try { document.documentElement.style.removeProperty("--synth-accent"); } catch {}
    const s = useStore.getState();
    if (s.videoStream) { try { s.videoStream.getTracks().forEach(t => t.stop()); } catch {} }
    if (s.videoElement) {
      try { s.videoElement.srcObject = null; } catch {}
      try { s.videoElement.parentNode?.removeChild(s.videoElement); } catch {}
    }
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
    const seed = generateSeed();
    const rand = rngFromSeed(seed);

    // Look at the actual frame first. This is the whole point: the stack is
    // built for THIS content, not drawn from a hat.
    const brief = briefFrom(analyzeSource(s.videoElement ?? s.imageElement));

    const locked = s.layers.filter(l => l.locked);
    const composition = compose(brief, rand, {
      roleCount: ROLE_COUNT[inten],
      chaos: CHAOS[inten],
      avoidLooks: s.recentLooks,
      avoidEffects: [...s.recentEffects, ...locked.map(l => l.effectId)],
    });

    const fresh: Layer[] = composition.layers.map(cl => {
      const def = EFFECTS_BY_ID[cl.effectId];
      return {
        id: newId(),
        effectId: cl.effectId,
        hidden: false, locked: false,
        blend: cl.blend,
        opacity: cl.opacity,
        region: cl.region ?? null,
        params: cl.params,
        mods: Object.fromEntries(def.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
      };
    });

    const usedIds = composition.layers.map(l => l.effectId);
    return {
      ...s,
      past: pushPast(s), future: [],
      layers: [...locked, ...fresh],
      seed,
      recentEffects: [...s.recentEffects, ...usedIds].slice(-MOSH_MEMORY),
      recentLooks: [...s.recentLooks, composition.look.id].slice(-LOOK_MEMORY),
      currentLook: {
        id: composition.look.id,
        name: composition.look.name,
        blurb: composition.look.blurb,
      },
      currentBrief: brief,
      // A full mosh replaces every quadrant, so quadrant memory starts over.
      quadrantHistory: Array.from({ length: QUADRANT_COUNT }, () => [] as string[]),
      lastQuadrantRoll: null,
      // Next tap picks up at the grade again.
      voiceCursor: 0,
    };
  }),

  moshQuadrant: (q, opts) => {
    const s = get();
    const rand = rngFromSeed(generateSeed());
    const layers = s.layers;

    if (layers[q]?.locked) return null;

    const brief = s.currentBrief ?? briefFrom(analyzeSource(s.videoElement ?? s.imageElement));
    // Keep composing under the stack's existing art direction so a single
    // quadrant re-roll is a new take on the same idea, not a genre change.
    const look: Look = (s.currentLook && LOOKS_LOOKUP[s.currentLook.id])
      ?? chooseLook(brief, rand, s.recentLooks);

    // Each quadrant owns one part of the composition: Q1 grades, Q2 forms,
    // Q3 accents, Q4 finishes.
    const role = roleForQuadrant(q);
    const affinity = opts?.targetAffinity ?? skewedAffinity(rand);

    const held = layers
      .slice(0, QUADRANT_COUNT)
      .map((l, i) => (i === q ? "" : l.effectId))
      .filter(Boolean);

    const effectId = pickForRole(role, look, brief, rand, {
      exclude: [layers[q]?.effectId ?? "", ...held, ...(s.quadrantHistory[q] ?? [])].filter(Boolean),
      affinityTarget: affinity,
    });
    const def = EFFECTS_BY_ID[effectId];
    if (!def) return null;

    const next = layers.slice();
    // Pad the stack so quadrant N always addresses layers[N] — and pad it with
    // the roles those slots are supposed to hold, so the grammar stays intact.
    while (next.length < q) {
      const fillRole = roleForQuadrant(next.length);
      const fillId = pickForRole(fillRole, look, brief, rand, {
        exclude: next.map(l => l.effectId),
      });
      const fillDef = EFFECTS_BY_ID[fillId];
      next.push({
        id: newId(),
        effectId: fillId,
        hidden: false, locked: false,
        blend: fillRole === "grade" ? "normal" : blendForRole(fillRole, rand),
        opacity: opacityForRole(fillRole, look, brief, rand, fillId),
        params: paramsForRole(fillId, fillRole, look, brief, rand),
        mods: Object.fromEntries(fillDef.params.map(p => [p.key, null])),
        audioMaps: Object.fromEntries(fillDef.params.map(p => [p.key, null])),
      });
    }

    const existing = next[q];
    const layer: Layer = {
      id: existing?.id ?? newId(),
      effectId,
      hidden: false,
      locked: false,
      // The grade sits at the bottom fully opaque so the source is never
      // wiped out from underneath the stack.
      blend: role === "grade" ? "normal" : blendForRole(role, rand),
      opacity: opacityForRole(role, look, brief, rand, effectId),
      params: paramsForRole(effectId, role, look, brief, rand),
      mods: Object.fromEntries(def.params.map(p => [p.key, null])),
      audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
    };
    next[q] = layer;

    const history = s.quadrantHistory.map(h => h.slice());
    history[q] = [...(history[q] ?? []), effectId].slice(-QUADRANT_MEMORY);

    const record: QuadrantRoll = {
      quadrant: q,
      effectId,
      effectName: def.name,
      relation: relationLabel(affinity),
      affinity,
      role,
      at: (typeof performance !== "undefined" ? performance.now() : Date.now()),
    };

    set({
      past: pushPast(s), future: [],
      layers: next,
      selectedLayerId: layer.id,
      quadrantHistory: history,
      recentEffects: [...s.recentEffects, effectId].slice(-MOSH_MEMORY),
      currentBrief: brief,
      currentLook: { id: look.id, name: look.name, blurb: look.blurb },
      lastQuadrantRoll: record,
    });
    return record;
  },

  moshNext: () => {
    const s = get();
    // Rotate over the voices the stack actually uses, so tapping cycles what is
    // on screen instead of growing the stack toward four.
    const count = Math.min(QUADRANT_COUNT, Math.max(1, s.layers.length));

    // Walk forward to the first unlocked voice. Locked voices are the user's
    // "keep this" vote, so they are stepped over rather than treated as a dead
    // tap — that is what makes lock-and-keep-tapping feel like steering.
    for (let step = 0; step < count; step++) {
      const q = ((s.voiceCursor + step) % count) as QuadrantIndex;
      if (s.layers[q]?.locked) continue;
      const roll = get().moshQuadrant(q);
      if (!roll) continue;
      set({ voiceCursor: (q + 1) % count });
      return roll;
    }
    return null;
  },

  clearQuadrantRoll: () => set({ lastQuadrantRoll: null }),

  clearAllFx: () => set(s => ({
    ...s,
    past: pushPast(s), future: [],
    layers: [],
    selectedLayerId: null,
    // Auto-shuffle would re-mosh within seconds and undo the clear. The Smart
    // and Storm directors live in the editor's own state, so the caller has to
    // stop those — see Editor's clearAllFx handler.
    shuffleSec: null,
    // Forget the art direction too: the next mosh should start fresh rather
    // than continue composing under a look the user just cleared away.
    currentLook: null,
    quadrantHistory: Array.from({ length: QUADRANT_COUNT }, () => [] as string[]),
    lastQuadrantRoll: null,
    voiceCursor: 0,
  })),

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

  // Takes a fully composed stack. Opacity, blend and region arrive already
  // decided by the composition grammar and are passed through untouched —
  // overwriting them here (as this used to, with a flat 0.75–1.0 opacity on
  // every layer) is exactly what flattened composed stacks back into mud.
  moshDirected: (directed) => set(s => {
    const seed = generateSeed();
    const locked = s.layers.filter(l => l.locked);
    const fresh: Layer[] = directed.flatMap((d) => {
      const def = EFFECTS_BY_ID[d.effectId];
      if (!def) return [];
      const params: Record<string, number> = {};
      for (const p of def.params) params[p.key] = p.default;
      return [{
        id: newId(),
        effectId: d.effectId,
        hidden: false, locked: false,
        blend: d.blend,
        opacity: d.opacity,
        region: d.region ?? null,
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
