import { describe, expect, it, vi } from "vitest";
import type { OverlayEntity } from "./types";
import { resolveStickerSource, selectUsableStickerMasks, withOptionalForgeIsolation } from "./stickerSource";

const canvas = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
const overlay = { asset: { id: "overlay-asset" } } as OverlayEntity;
const subject = { data: new Float32Array([1, 1, 0, 0, 1, 1, 0, 0]), width: 4, height: 2 };
const secondSubject = { data: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]), width: 4, height: 2 };

describe("resolveStickerSource", () => {
  it("keeps a selected overlay as the highest-priority source", () => {
    expect(resolveStickerSource({ selectedOverlay: overlay, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: [subject] }))
      .toEqual({ kind: "overlay", asset: overlay.asset });
  });

  it("uses isolated Forge subjects when no overlay is selected", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: [subject] }))
      .toEqual({ kind: "render-subject", canvas, subjects: [subject], sourceMode: "forge" });
  });

  it("preserves multiple selected subjects for compositing", () => {
    const subjects = [subject, secondSubject];
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas, isolatedSubjects: subjects }))
      .toMatchObject({ kind: "render-subject", subjects });
  });

  it("falls back to the complete Forge composition", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas }))
      .toEqual({ kind: "render", canvas, sourceMode: "forge" });
  });

  it("uses the rendered output in upload, camera, and Motif Maestro modes", () => {
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "upload", forgeCanvas: canvas }))
      .toEqual({ kind: "render", canvas, sourceMode: "upload" });
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "camera", forgeCanvas: canvas }))
      .toEqual({ kind: "render", canvas, sourceMode: "camera" });
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "motif", forgeCanvas: canvas }))
      .toEqual({ kind: "render", canvas, sourceMode: "motif" });
    expect(resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: null })).toBeNull();
  });

  it("does not require the stored canvas reference once a visible Forge canvas is available", () => {
    expect(resolveStickerSource({
      selectedOverlay: null,
      sourceMode: "forge",
      forgeCanvas: canvas,
    })?.kind).toBe("render");
  });

  it("falls back to the complete Forge render when isolation fails", async () => {
    const source = resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas });
    const fallback = vi.fn();
    const resolved = await withOptionalForgeIsolation(source!, async () => { throw new Error("model unavailable"); }, fallback);
    expect(resolved).toEqual({ kind: "render", canvas, sourceMode: "forge" });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("keeps every detected subject for a multi-subject Forge sticker", async () => {
    const source = resolveStickerSource({ selectedOverlay: null, sourceMode: "forge", forgeCanvas: canvas });
    const subjects = [subject, secondSubject];
    const resolved = await withOptionalForgeIsolation(source!, async () => subjects);
    expect(resolved).toMatchObject({ kind: "render-subject", subjects });
  });

  it("rejects empty and full-frame masks", () => {
    const empty = { data: new Float32Array(100), width: 10, height: 10 };
    const full = { data: new Float32Array(100).fill(1), width: 10, height: 10 };
    expect(selectUsableStickerMasks([empty, full])).toEqual([]);
  });

  it("deduplicates overlapping subject proposals", () => {
    const duplicate = { ...subject, data: new Float32Array(subject.data) };
    expect(selectUsableStickerMasks([subject, duplicate])).toHaveLength(1);
  });

  it("can preserve three distinct masks for a layered sticker", () => {
    const third = { data: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]), width: 4, height: 2 };
    expect(selectUsableStickerMasks([subject, secondSubject, third], 3).length).toBeGreaterThanOrEqual(2);
  });
});
