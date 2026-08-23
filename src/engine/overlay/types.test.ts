import { beforeEach, describe, expect, it } from "vitest";
import { makeOverlayEntity, duplicateOverlayEntity, type OverlayAsset } from "./types";
import { overlayAssetFromSticker, useOverlayStore } from "@/store/useOverlayStore";

const asset: OverlayAsset = {
  id: "asset-1",
  name: "eye.webp",
  kind: "raster",
  url: "blob:eye",
  mimeType: "image/webp",
  width: 512,
  height: 512,
  animated: false,
  createdAt: 1,
  objectUrl: true,
};

describe("overlay entities", () => {
  beforeEach(() => useOverlayStore.getState().clear());

  it("creates an after-fx entity centered on the stage", () => {
    const entity = makeOverlayEntity(asset, { id: "entity-1", createdAt: 2 });
    expect(entity.asset).toBe(asset);
    expect(entity.transform).toMatchObject({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 });
    expect(entity.compositing).toBe("after-fx");
    expect(entity.playback).toMatchObject({ playing: true, loop: true, speed: 1, direction: 1 });
    expect(entity.behavior.kind).toBe("none");
  });

  it("duplicates deeply mutable state and offsets the copy", () => {
    const source = makeOverlayEntity(asset, { id: "entity-1", createdAt: 2 });
    const copy = duplicateOverlayEntity(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.transform.x).toBeGreaterThan(source.transform.x);
    expect(copy.transform).not.toBe(source.transform);
    expect(copy.playback).not.toBe(source.playback);
    expect(copy.reactions).not.toBe(source.reactions);
  });

  it("reorders entities without changing their identity", () => {
    const store = useOverlayStore.getState();
    const first = store.addAsset({ ...asset, id: "a" });
    const second = useOverlayStore.getState().addAsset({ ...asset, id: "b" });
    useOverlayStore.getState().reorderEntity(second.id, -1);
    expect(useOverlayStore.getState().entities.map(e => e.id)).toEqual([second.id, first.id]);
  });

  it("migrates legacy StickerEntry metadata into an overlay asset", () => {
    const migrated = overlayAssetFromSticker({
      id: "legacy",
      url: "blob:legacy",
      animated: true,
      w: 320,
      h: 240,
      ts: 42,
    });
    expect(migrated).toMatchObject({
      id: "sticker-asset-legacy",
      kind: "raster",
      url: "blob:legacy",
      animated: true,
      width: 320,
      height: 240,
      createdAt: 42,
      objectUrl: true,
    });
  });
});
