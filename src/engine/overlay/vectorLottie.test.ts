import { describe, expect, it } from "vitest";
import { buildVectorStickerLottie } from "./vectorLottie";

describe("buildVectorStickerLottie", () => {
  it("creates shape layers without raster assets or a background", () => {
    const lottie = buildVectorStickerLottie({
      name: "vector sticker",
      width: 200,
      height: 100,
      preset: "float",
      shapes: [{ points: [[20,20],[180,20],[180,80],[20,80]], color: [20,220,255,255] }],
    });
    expect(lottie.assets).toHaveLength(0);
    expect(lottie.layers.length).toBe(1);
    expect(lottie.layers[0].ty).toBe(4);
    expect(lottie.layers.every((layer: any) => layer.ty !== 1 && layer.ty !== 2)).toBe(true);
  });
});
