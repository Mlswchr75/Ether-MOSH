import { describe, expect, it } from "vitest";
import { buildEncodedFrameSequenceLottie, organicMaskAlpha, type OrganicFocus } from "./lottieStickerMode";

const focus: OrganicFocus = { x: .5, y: .5, rx: .44, ry: .42, phase: 0 };

describe("Lottie Sticker organic mask", () => {
  it("never reaches a canvas edge while keeping a substantial center", () => {
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      expect(organicMaskAlpha(0, p, focus, 1)).toBe(0);
      expect(organicMaskAlpha(1, p, focus, 1)).toBe(0);
      expect(organicMaskAlpha(p, 0, focus, 1)).toBe(0);
      expect(organicMaskAlpha(p, 1, focus, 1)).toBe(0);
    }
    expect(organicMaskAlpha(.5, .5, focus, 1)).toBe(1);
  });

  it("builds a transparent raster-sequence Lottie with one timed layer per frame", () => {
    const frames = [0, 1].map(index => ({ width: 4, height: 4, dataUrl: `data:image/png;base64,frame${index}` }));
    const json = buildEncodedFrameSequenceLottie("test", frames, 10);
    expect(json.fr).toBe(10);
    expect(json.op).toBe(2);
    expect(json.assets).toHaveLength(2);
    expect(json.layers).toHaveLength(2);
    expect(json.assets[0].p).toMatch(/^data:image\/png;base64,/);
  });
});
