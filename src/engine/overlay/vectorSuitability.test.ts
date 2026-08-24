import { describe, expect, it } from "vitest";
import { scoreVectorSuitability } from "./vectorSuitability";

function image(width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a] = pixel(x, y);
    const i = (y * width + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return new ImageData(data, width, height);
}

describe("scoreVectorSuitability", () => {
  it("recommends vector for a clean flat icon", () => {
    const data = image(64, 64, (x, y) => x > 12 && x < 52 && y > 12 && y < 52 ? [20, 220, 255, 255] : [0, 0, 0, 0]);
    const result = scoreVectorSuitability(data);
    expect(result.score).toBeGreaterThanOrEqual(0.72);
    expect(result.recommendation).toBe("vector");
  });

  it("recommends universal for noisy photographic texture", () => {
    const data = image(64, 64, (x, y) => {
      const n = (x * 73 + y * 151 + x * y * 17) % 256;
      return [n, (n * 7) % 256, (n * 13) % 256, 255];
    });
    const result = scoreVectorSuitability(data);
    expect(result.score).toBeLessThan(0.72);
    expect(result.recommendation).toBe("universal");
  });

  it("treats empty transparent images as universal", () => {
    const data = image(32, 32, () => [0, 0, 0, 0]);
    const result = scoreVectorSuitability(data);
    expect(result.score).toBe(0);
    expect(result.metrics.alphaOccupancy).toBe(0);
    expect(result.recommendation).toBe("universal");
  });
});
