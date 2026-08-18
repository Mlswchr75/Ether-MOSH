import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STICKERS, useMoshStickerStore, type StickerClip } from "./moshStickerStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function makeClip(overrides: Partial<StickerClip> = {}): StickerClip {
  const video = document.createElement("video");
  return {
    kind: "video",
    el: video,
    objectUrl: `blob:test-${Math.random()}`,
    naturalW: 320,
    naturalH: 240,
    duration: 6,
    trimStart: 0,
    trimEnd: 6,
    ...overrides,
  };
}

describe("moshStickerStore", () => {
  beforeEach(() => {
    useMoshStickerStore.getState().disposeAll();
    useMoshStickerStore.setState({ enabled: true, panelOpen: false, selectedId: null });
  });

  it("adds a sticker and selects it", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip());
    expect(id).not.toBeNull();
    const state = useMoshStickerStore.getState();
    expect(state.stickers).toHaveLength(1);
    expect(state.selectedId).toBe(id);
    expect(state.stickers[0].opacity).toBe(1);
    expect(state.stickers[0].hidden).toBe(false);
  });

  it("caps at MAX_STICKERS and rejects further adds", () => {
    for (let i = 0; i < MAX_STICKERS; i++) {
      expect(useMoshStickerStore.getState().addSticker(makeClip())).not.toBeNull();
    }
    expect(useMoshStickerStore.getState().stickers).toHaveLength(MAX_STICKERS);

    const rejectedId = useMoshStickerStore.getState().addSticker(makeClip());
    expect(rejectedId).toBeNull();
    expect(useMoshStickerStore.getState().stickers).toHaveLength(MAX_STICKERS);
  });

  it("removes a sticker and clears selection if it was selected", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip())!;
    useMoshStickerStore.getState().removeSticker(id);
    const state = useMoshStickerStore.getState();
    expect(state.stickers).toHaveLength(0);
    expect(state.selectedId).toBeNull();
  });

  it("selects and deselects by id", () => {
    const a = useMoshStickerStore.getState().addSticker(makeClip())!;
    const b = useMoshStickerStore.getState().addSticker(makeClip())!;
    expect(useMoshStickerStore.getState().selectedId).toBe(b);
    useMoshStickerStore.getState().selectSticker(a);
    expect(useMoshStickerStore.getState().selectedId).toBe(a);
    useMoshStickerStore.getState().selectSticker(null);
    expect(useMoshStickerStore.getState().selectedId).toBeNull();
  });

  it("updates and clamps transform fields", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip())!;
    useMoshStickerStore.getState().setTransform(id, { x: 1.5, y: -0.5, w: 5, h: 0.01, rotation: 400 });
    const s = useMoshStickerStore.getState().stickers.find(st => st.id === id)!;
    expect(s.x).toBe(1);
    expect(s.y).toBe(0);
    expect(s.w).toBe(1);
    expect(s.h).toBeCloseTo(0.06);
    expect(s.rotation).toBe(400); // rotation is intentionally unclamped (full spin allowed)
  });

  it("does not transform a locked sticker", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip())!;
    useMoshStickerStore.getState().toggleLocked(id);
    useMoshStickerStore.getState().setTransform(id, { x: 0.9 });
    const s = useMoshStickerStore.getState().stickers.find(st => st.id === id)!;
    expect(s.x).toBe(0.5); // unchanged default
    expect(s.locked).toBe(true);
  });

  it("clamps opacity to 0..1", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip())!;
    useMoshStickerStore.getState().setOpacity(id, 2);
    expect(useMoshStickerStore.getState().stickers.find(st => st.id === id)!.opacity).toBe(1);
    useMoshStickerStore.getState().setOpacity(id, -1);
    expect(useMoshStickerStore.getState().stickers.find(st => st.id === id)!.opacity).toBe(0);
  });

  it("swapping the effect reseeds params to the new effect's defaults", () => {
    const id = useMoshStickerStore.getState().addSticker(makeClip())!;
    const before = useMoshStickerStore.getState().stickers.find(st => st.id === id)!;
    useMoshStickerStore.getState().setEffect(id, "rgbShift");
    const after = useMoshStickerStore.getState().stickers.find(st => st.id === id)!;
    expect(after.effectId).toBe("rgbShift");
    expect(after.params).not.toBe(before.params);
  });

  it("toggles the master enabled light-switch", () => {
    expect(useMoshStickerStore.getState().enabled).toBe(true);
    useMoshStickerStore.getState().setEnabled(false);
    expect(useMoshStickerStore.getState().enabled).toBe(false);
    useMoshStickerStore.getState().setEnabled(true);
    expect(useMoshStickerStore.getState().enabled).toBe(true);
  });

  it("confirmTrim adds a sticker from the pending clip and clears pendingTrim", () => {
    const clip = makeClip({ duration: 12, trimEnd: 12 });
    useMoshStickerStore.getState().setPendingTrim({ clip });
    useMoshStickerStore.getState().confirmTrim(2, 8);
    const state = useMoshStickerStore.getState();
    expect(state.pendingTrim).toBeNull();
    expect(state.stickers).toHaveLength(1);
    expect(state.stickers[0].clip.trimStart).toBe(2);
    expect(state.stickers[0].clip.trimEnd).toBe(8);
  });

  it("cancelPendingClip discards the pending clip without adding a sticker", () => {
    useMoshStickerStore.getState().setPendingTrim({ clip: makeClip() });
    useMoshStickerStore.getState().cancelPendingClip();
    const state = useMoshStickerStore.getState();
    expect(state.pendingTrim).toBeNull();
    expect(state.stickers).toHaveLength(0);
  });

  it("disposeAll clears every sticker and pending clip", () => {
    useMoshStickerStore.getState().addSticker(makeClip());
    useMoshStickerStore.getState().addSticker(makeClip());
    useMoshStickerStore.getState().setPendingTrim({ clip: makeClip() });
    useMoshStickerStore.getState().disposeAll();
    const state = useMoshStickerStore.getState();
    expect(state.stickers).toHaveLength(0);
    expect(state.pendingTrim).toBeNull();
    expect(state.selectedId).toBeNull();
  });
});
