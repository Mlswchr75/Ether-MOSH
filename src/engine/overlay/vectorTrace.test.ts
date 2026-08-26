import { describe, expect, it } from "vitest";
import { traceStickerShapes } from "./vectorTrace";

function image(width: number, height: number, on: (x: number, y: number) => boolean): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (on(x, y)) { data[i] = 40; data[i + 1] = 220; data[i + 2] = 255; data[i + 3] = 255; }
  }
  return new ImageData(data, width, height);
}

describe("traceStickerShapes", () => {
  it("traces a simple opaque rectangle into a bounded polygon", () => {
    const result = traceStickerShapes(image(32, 32, (x, y) => x >= 6 && x <= 25 && y >= 8 && y <= 23));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shapes.length).toBeGreaterThan(0);
    expect(result.shapes[0].points.length).toBeGreaterThanOrEqual(4);
    expect(result.shapes[0].points.length).toBeLessThanOrEqual(320);
  });

  it("returns no shapes for transparent input", () => {
    const result = traceStickerShapes(image(16, 16, () => false));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.shapes).toHaveLength(0);
  });
});
