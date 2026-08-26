export type RadialPoint = { x: number; y: number };
export type RadialLayout = Record<string, RadialPoint>;

export function defaultRadialPoint(index: number, total: number): RadialPoint {
  const outerCount = Math.min(14, total);
  const inner = index >= outerCount;
  const count = inner ? Math.max(1, total - outerCount) : Math.max(1, outerCount);
  const ringIndex = inner ? index - outerCount : index;
  const angle = ringIndex * Math.PI * 2 / count;
  const radius = inner ? 0.29 : 0.43;
  return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
}

export function nearestRadialId(
  point: RadialPoint,
  ids: string[],
  layout: RadialLayout,
  maxDistance = 0.17,
): string | null {
  let nearest: string | null = null;
  let nearestDistance = maxDistance;
  ids.forEach((id, index) => {
    const target = layout[id] ?? defaultRadialPoint(index, ids.length);
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance <= nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  });
  return nearest;
}

export function clampRadialPoint(point: RadialPoint): RadialPoint {
  return {
    x: Math.max(-0.46, Math.min(0.46, point.x)),
    y: Math.max(-0.46, Math.min(0.46, point.y)),
  };
}
