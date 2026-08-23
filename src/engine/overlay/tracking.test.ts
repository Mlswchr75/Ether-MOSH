import { describe, expect, it } from "vitest";
import { applyTrackedTarget, targetFromMask } from "./tracking";
import type { OverlayTrackingBinding, OverlayTransform } from "./types";

const base: OverlayTransform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };
const binding: OverlayTrackingBinding = {
  enabled: true,
  target: "person",
  offsetX: 0,
  offsetY: 0,
  scaleWithTarget: true,
  rotateWithTarget: false,
};

describe("overlay tracking", () => {
  it("extracts normalized bounds and center from a mask", () => {
    const data = new Float32Array(16);
    data[5] = data[6] = data[9] = data[10] = 1;
    const target = targetFromMask({ data, width: 4, height: 4 }, 0.5, 100);
    expect(target).not.toBeNull();
    expect(target!.x).toBeCloseTo(0.5);
    expect(target!.y).toBeCloseTo(0.5);
    expect(target!.width).toBeCloseTo(0.5);
    expect(target!.height).toBeCloseTo(0.5);
  });

  it("falls back to the base transform when target is missing", () => {
    expect(applyTrackedTarget(base, binding, null)).toBe(base);
  });

  it("moves and scales toward a tracked target", () => {
    const next = applyTrackedTarget(base, binding, {
      x: 0.2, y: 0.7, width: 0.5, height: 0.25, rotation: 0, confidence: 1, at: 0,
    });
    expect(next.x).toBeCloseTo(0.2);
    expect(next.y).toBeCloseTo(0.7);
    expect(next.scale).toBeGreaterThan(base.scale);
  });
});
