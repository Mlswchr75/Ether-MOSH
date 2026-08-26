import { describe, expect, it } from "vitest";
import { applyPinch, clampTransform, translateNormalized } from "./transform";
import type { OverlayTransform } from "./types";

const base: OverlayTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };

describe("overlay transform helpers", () => {
  it("translates pixels into normalized stage coordinates", () => {
    expect(translateNormalized(base, { x: 100, y: -50 }, { width: 1000, height: 500 }))
      .toMatchObject({ x: 0.6, y: 0.4 });
  });

  it("clamps position, scale and opacity", () => {
    expect(clampTransform({ x: 2, y: -1, scale: 99, rotation: 0, opacity: -2 }))
      .toEqual({ x: 1, y: 0, scale: 12, rotation: 0, opacity: 0 });
  });

  it("scales and rotates from a two-pointer pinch", () => {
    const result = applyPinch(
      base,
      { x: 0, y: 0 }, { x: 100, y: 0 },
      { x: 0, y: 0 }, { x: 0, y: 200 },
    );
    expect(result.scale).toBeCloseTo(2);
    expect(result.rotation).toBeCloseTo(90);
  });
});
