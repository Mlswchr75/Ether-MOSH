export type OrganicPoint = { x: number; y: number };

const clamp01 = (value: number) => Math.min(.995, Math.max(.005, value));

export function parsePolygonClip(clip: string): OrganicPoint[] {
  const match = clip.trim().match(/^polygon\((.*)\)$/i);
  if (!match) return [];
  return match[1].split(",").map(pair => {
    const values = pair.trim().match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
    return values ? { x: Number(values[1]) / 100, y: Number(values[2]) / 100 } : null;
  }).filter((point): point is OrganicPoint => point !== null);
}

function organicVariation(points: OrganicPoint[], seed: number, amount: number) {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return points.map((point, index) => {
    const angle = Math.atan2(point.y - cy, point.x - cx);
    const wave = Math.sin(seed * .013 + index * 2.173) * .58 + Math.sin(seed * .031 + index * .817) * .42;
    const tangent = Math.cos(seed * .019 + index * 1.311) * amount * .42;
    return {
      x: clamp01(point.x + Math.cos(angle) * wave * amount - Math.sin(angle) * tangent),
      y: clamp01(point.y + Math.sin(angle) * wave * amount + Math.cos(angle) * tangent),
    };
  });
}

function smoothClosedPath(points: OrganicPoint[]) {
  if (points.length < 3) return "";
  const n = points.length;
  const number = (value: number) => value.toFixed(4);
  let path = `M${number(points[0].x)} ${number(points[0].y)}`;
  for (let index = 0; index < n; index += 1) {
    const p0 = points[(index - 1 + n) % n];
    const p1 = points[index];
    const p2 = points[(index + 1) % n];
    const p3 = points[(index + 2) % n];
    // Most vertices flow through a generous Catmull-Rom-like handle, while
    // occasional shorter handles preserve the authored tear instead of
    // rounding every specimen into the same generic blob.
    const strength = index % 5 === 0 ? .145 : .205;
    const c1 = { x: p1.x + (p2.x - p0.x) * strength, y: p1.y + (p2.y - p0.y) * strength };
    const c2 = { x: p2.x - (p3.x - p1.x) * strength, y: p2.y - (p3.y - p1.y) * strength };
    path += ` C${number(c1.x)} ${number(c1.y)} ${number(c2.x)} ${number(c2.y)} ${number(p2.x)} ${number(p2.y)}`;
  }
  return `${path} Z`;
}

export function createOrganicClipPaths(clip: string, seed: number) {
  const points = parsePolygonClip(clip);
  if (points.length < 3) return [];
  return [
    smoothClosedPath(organicVariation(points, seed, .008)),
    smoothClosedPath(organicVariation(points, seed + 97, .052)),
    smoothClosedPath(organicVariation(points, seed + 211, .039)),
    smoothClosedPath(organicVariation(points, seed, .008)),
  ];
}
