import type { MaskResult } from "@/engine/SegmentationEngine";
import type { OverlayTrackingBinding, OverlayTrackingTarget, OverlayTransform } from "./types";

export type OverlayTrackedTarget = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  confidence: number;
  at: number;
};

const targets = new Map<OverlayTrackingTarget, OverlayTrackedTarget>();

export function setTrackedTarget(kind: OverlayTrackingTarget, target: OverlayTrackedTarget | null): void {
  if (target) targets.set(kind, target);
  else targets.delete(kind);
}

export function getTrackedTarget(kind: OverlayTrackingTarget, maxAgeMs = 800): OverlayTrackedTarget | null {
  const target = targets.get(kind) ?? null;
  if (!target) return null;
  if (performance.now() - target.at > maxAgeMs) return null;
  return target;
}

export function targetFromMask(mask: MaskResult, threshold = 0.5, at = performance.now()): OverlayTrackedTarget | null {
  let minX = mask.width, minY = mask.height, maxX = -1, maxY = -1;
  let weight = 0, sx = 0, sy = 0, active = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const value = mask.data[y * mask.width + x] ?? 0;
      if (value < threshold) continue;
      active++;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      weight += value; sx += x * value; sy += y * value;
    }
  }
  if (!active || maxX < minX || maxY < minY) return null;
  const x = weight > 0 ? sx / weight : (minX + maxX) / 2;
  const y = weight > 0 ? sy / weight : (minY + maxY) / 2;
  return {
    x: x / Math.max(1, mask.width - 1),
    y: y / Math.max(1, mask.height - 1),
    width: (maxX - minX + 1) / mask.width,
    height: (maxY - minY + 1) / mask.height,
    rotation: 0,
    confidence: active / mask.data.length,
    at,
  };
}

export function targetFromPoint(x: number, y: number, confidence = 1, at = performance.now()): OverlayTrackedTarget {
  return { x, y, width: 0.22, height: 0.22, rotation: 0, confidence, at };
}

export function applyTrackedTarget(base: OverlayTransform, binding: OverlayTrackingBinding, target: OverlayTrackedTarget | null): OverlayTransform {
  if (!binding.enabled || !target) return base;
  const targetScale = binding.scaleWithTarget ? Math.max(0.2, Math.min(3, Math.max(target.width, target.height) / 0.25)) : 1;
  return {
    ...base,
    x: Math.max(0, Math.min(1, target.x + binding.offsetX)),
    y: Math.max(0, Math.min(1, target.y + binding.offsetY)),
    scale: base.scale * targetScale,
    rotation: binding.rotateWithTarget ? base.rotation + target.rotation : base.rotation,
  };
}
