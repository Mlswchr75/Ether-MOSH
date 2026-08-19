/**
 * Standalone state for "live mosh stickers" — short looping video/GIF clips
 * (uploaded or camera-captured), placed and transformed freely on top of the
 * main canvas, each running its own single mosh effect. Kept separate from
 * the main visualizer store so nothing in the existing editor ever needs to
 * change behaviorally — same isolation principle as kaossStore.ts.
 */
import { create } from "zustand";
import { toast } from "sonner";
import { EFFECTS, EFFECTS_BY_ID } from "@/engine/effects";

export const MAX_STICKERS = 5;
export const MIN_CLIP_SECONDS = 5;
export const MAX_CLIP_SECONDS = 7;

export type StickerClip = {
  kind: "video" | "gif";
  el: HTMLVideoElement | HTMLImageElement;
  objectUrl: string;
  naturalW: number;
  naturalH: number;
  /** Video only — 0 for GIF (native loop, not seekable without a decoder). */
  duration: number;
  trimStart: number;
  trimEnd: number;
};

export type MoshSticker = {
  id: string;
  clip: StickerClip;
  effectId: string;
  params: Record<string, number>;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  hidden: boolean;
  locked: boolean;
};

type State = {
  /** Master light-switch — show/hide + pause/resume the whole stack instantly. */
  enabled: boolean;
  panelOpen: boolean;
  stickers: MoshSticker[];
  selectedId: string | null;
  /** A clip that finished loading and is awaiting trim confirmation (video > 7s). */
  pendingTrim: { clip: StickerClip } | null;
};

type Actions = {
  setEnabled: (b: boolean) => void;
  setPanelOpen: (b: boolean) => void;
  setPendingTrim: (p: { clip: StickerClip } | null) => void;
  confirmTrim: (start: number, end: number) => void;
  cancelPendingClip: () => void;
  addSticker: (clip: StickerClip) => string | null;
  removeSticker: (id: string) => void;
  selectSticker: (id: string | null) => void;
  setTransform: (id: string, t: Partial<Pick<MoshSticker, "x" | "y" | "w" | "h" | "rotation">>) => void;
  setOpacity: (id: string, v: number) => void;
  setEffect: (id: string, effectId: string) => void;
  setParam: (id: string, key: string, v: number) => void;
  toggleHidden: (id: string) => void;
  toggleLocked: (id: string) => void;
  disposeAll: () => void;
};

function disposeClip(clip: StickerClip) {
  try {
    if (clip.kind === "video") {
      const v = clip.el as HTMLVideoElement;
      v.pause();
      v.srcObject = null;
      v.removeAttribute("src");
      v.load();
    }
  } catch { /* noop */ }
  try { URL.revokeObjectURL(clip.objectUrl); } catch { /* noop */ }
}

function defaultParams(effectId: string): Record<string, number> {
  const def = EFFECTS_BY_ID[effectId];
  if (!def) return {};
  return Object.fromEntries(def.params.map(p => [p.key, p.default]));
}

/** First non-dimension effect, matching FxPicker's own category filter — dimension
 *  effects lean on the main renderer's depth/flow proxies in a load-bearing way
 *  that a small isolated sticker renderer doesn't provide. */
function defaultEffectId(): string {
  return EFFECTS.find(e => e.category !== "dimension")?.id ?? EFFECTS[0]?.id ?? "";
}

let nextId = 0;
function makeId(): string {
  nextId += 1;
  return `sticker-${Date.now()}-${nextId}`;
}

export const useMoshStickerStore = create<State & Actions>((set, get) => ({
  enabled: true,
  panelOpen: false,
  stickers: [],
  selectedId: null,
  pendingTrim: null,

  setEnabled: (b) => set({ enabled: b }),
  setPanelOpen: (b) => set({ panelOpen: b }),
  setPendingTrim: (p) => set({ pendingTrim: p }),

  confirmTrim: (start, end) => {
    const pending = get().pendingTrim;
    if (!pending) return;
    const clip: StickerClip = { ...pending.clip, trimStart: start, trimEnd: end };
    set({ pendingTrim: null });
    get().addSticker(clip);
  },

  cancelPendingClip: () => {
    const pending = get().pendingTrim;
    if (pending) disposeClip(pending.clip);
    set({ pendingTrim: null });
  },

  addSticker: (clip) => {
    if (get().stickers.length >= MAX_STICKERS) {
      disposeClip(clip);
      toast.error(`Max ${MAX_STICKERS} mosh stickers — remove one first`);
      return null;
    }
    const id = makeId();
    const effectId = defaultEffectId();
    const sticker: MoshSticker = {
      id,
      clip,
      effectId,
      params: defaultParams(effectId),
      x: 0.5,
      y: 0.5,
      w: 0.32,
      h: 0.32,
      rotation: 0,
      opacity: 1,
      hidden: false,
      locked: false,
    };
    set(s => ({ stickers: [...s.stickers, sticker], selectedId: id, enabled: true }));
    return id;
  },

  removeSticker: (id) => {
    const s = get().stickers.find(st => st.id === id);
    if (s) disposeClip(s.clip);
    set(state => ({
      stickers: state.stickers.filter(st => st.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }));
  },

  selectSticker: (id) => set({ selectedId: id }),

  setTransform: (id, t) => set(state => ({
    stickers: state.stickers.map(s => {
      if (s.id !== id || s.locked) return s;
      return {
        ...s,
        x: t.x !== undefined ? Math.max(0, Math.min(1, t.x)) : s.x,
        y: t.y !== undefined ? Math.max(0, Math.min(1, t.y)) : s.y,
        w: t.w !== undefined ? Math.max(0.06, Math.min(1, t.w)) : s.w,
        h: t.h !== undefined ? Math.max(0.06, Math.min(1, t.h)) : s.h,
        rotation: t.rotation !== undefined ? t.rotation : s.rotation,
      };
    }),
  })),

  setOpacity: (id, v) => set(state => ({
    stickers: state.stickers.map(s => s.id === id ? { ...s, opacity: Math.max(0, Math.min(1, v)) } : s),
  })),

  setEffect: (id, effectId) => set(state => ({
    stickers: state.stickers.map(s => s.id === id ? { ...s, effectId, params: defaultParams(effectId) } : s),
  })),

  setParam: (id, key, v) => set(state => ({
    stickers: state.stickers.map(s => s.id === id ? { ...s, params: { ...s.params, [key]: v } } : s),
  })),

  toggleHidden: (id) => set(state => ({
    stickers: state.stickers.map(s => s.id === id ? { ...s, hidden: !s.hidden } : s),
  })),

  toggleLocked: (id) => set(state => ({
    stickers: state.stickers.map(s => s.id === id ? { ...s, locked: !s.locked } : s),
  })),

  disposeAll: () => {
    const pending = get().pendingTrim;
    if (pending) disposeClip(pending.clip);
    get().stickers.forEach(s => disposeClip(s.clip));
    set({ stickers: [], selectedId: null, pendingTrim: null });
  },
}));
