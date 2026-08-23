import { create } from "zustand";
import type { StickerEntry } from "./types";
import {
  duplicateOverlayEntity,
  makeOverlayEntity,
  type OverlayAsset,
  type OverlayEntity,
  type OverlayTransform,
} from "@/engine/overlay/types";

type OverlayState = {
  entities: OverlayEntity[];
  selectedId: string | null;
};

type OverlayActions = {
  addAsset: (asset: OverlayAsset) => OverlayEntity;
  addEntity: (entity: OverlayEntity) => void;
  removeEntity: (id: string) => void;
  duplicateEntity: (id: string) => OverlayEntity | null;
  reorderEntity: (id: string, dir: -1 | 1) => void;
  selectEntity: (id: string | null) => void;
  patchEntity: (id: string, patch: Partial<OverlayEntity>) => void;
  patchTransform: (id: string, patch: Partial<OverlayTransform>) => void;
  importStickerEntry: (entry: StickerEntry) => OverlayEntity;
  clear: () => void;
};

function stickerKind(entry: StickerEntry): OverlayAsset["kind"] {
  if (entry.animated && /\.gif(?:$|\?)/i.test(entry.url)) return "gif";
  return "raster";
}

export function overlayAssetFromSticker(entry: StickerEntry): OverlayAsset {
  return {
    id: `sticker-asset-${entry.id}`,
    name: `Sticker ${entry.id.slice(0, 8)}`,
    kind: stickerKind(entry),
    url: entry.url,
    mimeType: entry.animated ? "image/apng" : "image/webp",
    width: entry.w,
    height: entry.h,
    animated: entry.animated,
    createdAt: entry.ts,
    objectUrl: entry.url.startsWith("blob:"),
  };
}

export const useOverlayStore = create<OverlayState & OverlayActions>((set, get) => ({
  entities: [],
  selectedId: null,

  addAsset: (asset) => {
    const entity = makeOverlayEntity(asset);
    set(s => ({ entities: [...s.entities, entity], selectedId: entity.id }));
    return entity;
  },

  addEntity: (entity) => set(s => ({
    entities: [...s.entities, entity],
    selectedId: entity.id,
  })),

  removeEntity: (id) => set(s => {
    const entities = s.entities.filter(entity => entity.id !== id);
    return {
      entities,
      selectedId: s.selectedId === id ? (entities.at(-1)?.id ?? null) : s.selectedId,
    };
  }),

  duplicateEntity: (id) => {
    const source = get().entities.find(entity => entity.id === id);
    if (!source) return null;
    const copy = duplicateOverlayEntity(source);
    set(s => {
      const index = s.entities.findIndex(entity => entity.id === id);
      const entities = [...s.entities];
      entities.splice(index + 1, 0, copy);
      return { entities, selectedId: copy.id };
    });
    return copy;
  },

  reorderEntity: (id, dir) => set(s => {
    const index = s.entities.findIndex(entity => entity.id === id);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= s.entities.length) return s;
    const entities = [...s.entities];
    [entities[index], entities[nextIndex]] = [entities[nextIndex], entities[index]];
    return { entities };
  }),

  selectEntity: (id) => set({ selectedId: id }),

  patchEntity: (id, patch) => set(s => ({
    entities: s.entities.map(entity => entity.id === id ? { ...entity, ...patch } : entity),
  })),

  patchTransform: (id, patch) => set(s => ({
    entities: s.entities.map(entity => entity.id === id
      ? { ...entity, transform: { ...entity.transform, ...patch } }
      : entity),
  })),

  importStickerEntry: (entry) => {
    const entity = makeOverlayEntity(overlayAssetFromSticker(entry));
    set(s => ({ entities: [...s.entities, entity], selectedId: entity.id }));
    return entity;
  },

  clear: () => set({ entities: [], selectedId: null }),
}));
