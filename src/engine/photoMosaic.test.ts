import { describe, expect, it } from "vitest";
import { mosaicGridFor } from "./photoMosaic";

describe("photo mosaic layout", () => {
  it("makes a bounded, denser field as the density control rises", () => {
    const sparse = mosaicGridFor(1920, 1080, 0);
    const dense = mosaicGridFor(1920, 1080, 1);
    expect(sparse.columns * sparse.rows).toBeGreaterThanOrEqual(4);
    expect(dense.columns * dense.rows).toBeGreaterThan(sparse.columns * sparse.rows);
    expect(dense.columns).toBeLessThanOrEqual(32);
    expect(dense.rows).toBeLessThanOrEqual(32);
  });

  it("keeps every cell inside the rendered source dimensions", () => {
    const grid = mosaicGridFor(375, 812, 0.7);
    expect(grid.cellWidth * grid.columns).toBeCloseTo(375);
    expect(grid.cellHeight * grid.rows).toBeCloseTo(812);
  });
});
