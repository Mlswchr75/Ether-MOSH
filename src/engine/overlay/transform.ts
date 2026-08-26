import type { OverlayTransform } from "./types";

export type Point = { x: number; y: number };

export function clampTransform(transform: OverlayTransform): OverlayTransform {
  return {
    ...transform,
    x: clamp(transform.x, 0, 1),
    y: clamp(transform.y, 0, 1),
    scale: clamp(transform.scale, 0.05, 12),
    opacity: clamp(transform.opacity, 0, 1),
  };
}

export function translateNormalized(
  start: OverlayTransform,
  deltaPx: Point,
  viewport: { width: number; height: number },
): OverlayTransform {
  if (viewport.width <= 0 || viewport.height <= 0) return start;
  return clampTransform({
    ...start,
    x: start.x + deltaPx.x / viewport.width,
    y: start.y + deltaPx.y / viewport.height,
  });
}

export function applyPinch(
  start: OverlayTransform,
  initialA: Point,
  initialB: Point,
  currentA: Point,
  currentB: Point,
): OverlayTransform {
  const initialDistance = distance(initialA, initialB);
  const currentDistance = distance(currentA, currentB);
  if (initialDistance < 1) return start;

  const initialAngle = angle(initialA, initialB);
  const currentAngle = angle(currentA, currentB);
  const initialMid = midpoint(initialA, initialB);
  const currentMid = midpoint(currentA, currentB);

  return clampTransform({
    ...start,
    scale: start.scale * (currentDistance / initialDistance),
    rotation: start.rotation + normalizeDegrees(currentAngle - initialAngle),
    x: start.x,
    y: start.y,
    // midpoint movement is applied by the caller because it needs viewport size.
  });
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

function normalizeDegrees(value: number): number {
  let out = value;
  while (out > 180) out -= 360;
  while (out < -180) out += 360;
  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
