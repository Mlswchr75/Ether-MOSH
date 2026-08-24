export type TracePoint = [number, number];
export type TracedStickerShape = { points: TracePoint[]; color: [number, number, number, number] };
export type TraceResult = { ok: true; shapes: TracedStickerShape[] } | { ok: false; reason: "too-complex" };

const MAX_SHAPES = 24;
const MAX_POINTS_PER_SHAPE = 320;

function cross(o: TracePoint, a: TracePoint, b: TracePoint) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: TracePoint[]): TracePoint[] {
  if (points.length <= 3) return points;
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: TracePoint[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  const upper: TracePoint[] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function simplify(points: TracePoint[], maxPoints = MAX_POINTS_PER_SHAPE): TracePoint[] {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % stride === 0).slice(0, maxPoints);
}

export function traceStickerShapes(imageData: ImageData): TraceResult {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const on = (x: number, y: number) => data[(y * width + x) * 4 + 3] > 24;
  const shapes: TracedStickerShape[] = [];

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const idx = y * width + x;
    if (visited[idx] || !on(x, y)) continue;
    const queue: TracePoint[] = [[x, y]];
    visited[idx] = 1;
    const boundary: TracePoint[] = [];
    let rs = 0, gs = 0, bs = 0, as = 0, count = 0;

    for (let q = 0; q < queue.length; q++) {
      const [cx, cy] = queue[q];
      const pi = (cy * width + cx) * 4;
      rs += data[pi]; gs += data[pi + 1]; bs += data[pi + 2]; as += data[pi + 3]; count++;
      let edge = false;
      const neighbors: TracePoint[] = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !on(nx, ny)) { edge = true; continue; }
        const ni = ny * width + nx;
        if (!visited[ni]) { visited[ni] = 1; queue.push([nx, ny]); }
      }
      if (edge) boundary.push([cx, cy]);
    }

    if (count < 4 || boundary.length < 3) continue;
    const hull = simplify(convexHull(boundary));
    if (hull.length > MAX_POINTS_PER_SHAPE) return { ok: false, reason: "too-complex" };
    shapes.push({ points: hull, color: [Math.round(rs / count), Math.round(gs / count), Math.round(bs / count), Math.round(as / count)] });
    if (shapes.length > MAX_SHAPES) return { ok: false, reason: "too-complex" };
  }

  return { ok: true, shapes };
}

export { MAX_SHAPES, MAX_POINTS_PER_SHAPE };
