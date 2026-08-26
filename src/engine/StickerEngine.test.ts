import { describe, expect, it } from "vitest";
import { applyOrganicAlphaMask } from "./StickerEngine";

describe("applyOrganicAlphaMask", () => {
  it("keeps every fallback silhouette away from flat frame edges and corners", () => {
    const width = 40, height = 30;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const masked = applyOrganicAlphaMask(new ImageData(pixels, width, height));
    const alpha = (x: number, y: number) => masked.data[(y * width + x) * 4 + 3];

    for (let x = 0; x < width; x++) {
      expect(alpha(x, 0)).toBe(0);
      expect(alpha(x, height - 1)).toBe(0);
    }
    for (let y = 0; y < height; y++) {
      expect(alpha(0, y)).toBe(0);
      expect(alpha(width - 1, y)).toBe(0);
    }
    expect(alpha(Math.floor(width / 2), Math.floor(height / 2))).toBe(255);
  });
});
