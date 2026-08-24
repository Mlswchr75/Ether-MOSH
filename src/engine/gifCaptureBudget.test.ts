import { describe, expect, it } from "vitest";
import { resolveGifCaptureBudget } from "./gifCaptureBudget";

describe("GIF capture device budget", () => {
  it("keeps full quality on capable devices", () => {
    expect(resolveGifCaptureBudget({ hardwareConcurrency: 8, coarsePointer: false }, 12, 480)).toEqual({ fps: 12, maxWidth: 480 });
  });

  it("reduces encode pressure on low-core touch devices", () => {
    expect(resolveGifCaptureBudget({ hardwareConcurrency: 4, coarsePointer: true }, 12, 480)).toEqual({ fps: 10, maxWidth: 400 });
  });
});
