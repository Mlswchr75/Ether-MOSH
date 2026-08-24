import { describe, expect, it, vi } from "vitest";
import type { OverlayEntity } from "./types";
import { resolveStickerSource, withOptionalForgeIsolation } from "./stickerSource";

const canvas = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
const overlay = { asset: { id: "overlay-asset" } } as OverlayEntity;
const subject = { data: new Float32Array([1]), width: 1, height: 1 };

describe("resolveStickerSource", () => {
  it("keeps a selected overlay as the highest-priority source", () => {
    expect(resolveStickerSource({ selectedOverlay: overlay, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: [subject] }))
      .toEqual({ kind: "overlay", asset: overlay.asset });
  });

  it("uses isolated Forge subjects when no overlay is selected", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: [subject] }))
      .toEqual({ kind: "forge-subject", canvas, subjects: [subject] });
  });

  it("preserves multiple selected subjects for compositing", () => {
    const subjects = [subject, { ...subject, data: new Float32Array([0.5]) }];
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: subjects }))
      .toMatchObject({ kind: "forge-subject", subjects });
  });

  it("falls back to the complete Forge composition", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas }))
      .toEqual({ kind: "forge-render", canvas });
  });

  it("returns no source outside Forge when no overlay is selected", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "upload", forgeCanvas: canvas })).toBeNull();
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: null })).toBeNull();
  });

  it("does not require the stored canvas reference once a visible Forge canvas is available", () => {
    expect(resolveStickerSource({
      selectedOverlay: null,
      sourceMode: "forge",
      forgeCanvas: canvas,
    })?.kind).toBe("forge-render");
  });

  it("falls back to the complete Forge render when isolation fails", async () => {
    const source = resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas });
    const fallback = vi.fn();
    const resolved = await withOptionalForgeIsolation(source!, async () => { throw new Error("model unavailable"); }, fallback);
    expect(resolved).toEqual({ kind: "forge-render", canvas });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("keeps every detected subject for a multi-subject Forge sticker", async () => {
    const source = resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas });
    const subjects = [subject, { ...subject, data: new Float32Array([0.25]) }];
    const resolved = await withOptionalForgeIsolation(source!, async () => subjects);
    expect(resolved).toMatchObject({ kind: "forge-subject", subjects });
  });
});
