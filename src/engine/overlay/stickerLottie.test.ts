import { describe, expect, it } from "vitest";
import { buildStickerLottie } from "./stickerLottie";

describe("buildStickerLottie", () => {
  it("creates a transparent self-contained Lottie image animation", () => {
    const lottie = buildStickerLottie({
      name: "test sticker",
      width: 256,
      height: 128,
      imageDataUrl: "data:image/png;base64,AAAA",
      preset: "float",
      durationSeconds: 2,
      fps: 30,
    });

    expect(lottie.w).toBe(256);
    expect(lottie.h).toBe(128);
    expect(lottie.fr).toBe(30);
    expect(lottie.op).toBe(60);
    expect(lottie.assets[0].p).toContain("data:image/png;base64,");
    expect(lottie.assets[0].e).toBe(1);
    expect(lottie.layers).toHaveLength(1);
    expect(lottie.layers[0].ty).toBe(2);
    expect(lottie.layers[0].ks.p.a).toBe(1);
  });

  it("does not add a background layer", () => {
    const lottie = buildStickerLottie({
      name: "transparent",
      width: 100,
      height: 100,
      imageDataUrl: "data:image/png;base64,AAAA",
      preset: "pulse",
    });
    expect(lottie.layers.every(layer => layer.ty !== 1)).toBe(true);
  });
});
