import { describe, expect, it } from "vitest";
import type { MaskResult } from "@/engine/SegmentationEngine";
import { FIELD_SIZE } from "./lottieStickerMode";
import { focusFromSegmentationMasks } from "./stickerIsolation";

function rectangleMask(x0: number, y0: number, x1: number, y1: number): MaskResult {
  const width = 20, height = 20;
  const data = new Float32Array(width * height);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = .95;
  return { data, width, height };
}

describe("Sticker Studio semantic isolation", () => {
  it("uses a tap to choose the matching subject instead of merging every proposal", () => {
    const left = rectangleMask(2, 5, 8, 15);
    const right = rectangleMask(12, 5, 18, 15);
    const focus = focusFromSegmentationMasks([left, right], "tap", { x: .8, y: .5 });
    expect(focus).not.toBeNull();
    const at = (x: number, y: number) => focus!.field[y * FIELD_SIZE + x];
    expect(at(76, 48)).toBeGreaterThan(.5);
    expect(at(20, 48)).toBeLessThan(.1);
  });

  it("retains transparent separation between multiple selected scene layers", () => {
    const focus = focusFromSegmentationMasks([
      rectangleMask(1, 5, 7, 15),
      rectangleMask(13, 5, 19, 15),
    ], "layers");
    expect(focus).not.toBeNull();
    const at = (x: number, y: number) => focus!.field[y * FIELD_SIZE + x];
    expect(at(18, 48)).toBeGreaterThan(.5);
    expect(at(78, 48)).toBeGreaterThan(.5);
    expect(at(48, 48)).toBeLessThan(.1);
  });
});
