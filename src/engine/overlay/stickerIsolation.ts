import type { MaskResult } from "@/engine/SegmentationEngine";
import { selectUsableStickerMasks } from "./stickerSource";
import { FIELD_SIZE, type OrganicFocus, type OrganicIsolationMode } from "./lottieStickerMode";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function sampleMask(mask: MaskResult, u: number, v: number): number {
  const x = clamp01(u) * Math.max(0, mask.width - 1);
  const y = clamp01(v) * Math.max(0, mask.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(mask.width - 1, x0 + 1), y1 = Math.min(mask.height - 1, y0 + 1);
  const tx = x - x0, ty = y - y0;
  const a = mask.data[y0 * mask.width + x0] ?? 0;
  const b = mask.data[y0 * mask.width + x1] ?? 0;
  const c = mask.data[y1 * mask.width + x0] ?? 0;
  const d = mask.data[y1 * mask.width + x1] ?? 0;
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

function maskCenter(mask: MaskResult) {
  let sx = 0, sy = 0, weight = 0;
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) {
    const value = Math.max(0, (mask.data[y * mask.width + x] ?? 0) - .25);
    sx += x * value; sy += y * value; weight += value;
  }
  return weight > 0
    ? { x: sx / weight / Math.max(1, mask.width - 1), y: sy / weight / Math.max(1, mask.height - 1) }
    : { x: .5, y: .5 };
}

function blurField(source: Float32Array) {
  const output = new Float32Array(source.length);
  for (let y = 0; y < FIELD_SIZE; y++) for (let x = 0; x < FIELD_SIZE; x++) {
    let sum = 0, weight = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= FIELD_SIZE || yy < 0 || yy >= FIELD_SIZE) continue;
      const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
      sum += source[yy * FIELD_SIZE + xx] * w; weight += w;
    }
    output[y * FIELD_SIZE + x] = sum / weight;
  }
  return output;
}

/** Convert one or more on-device interactive-segmentation proposals into the
 * same normalized field the Lottie/GIF renderer already consumes. This keeps
 * the proven export route untouched while giving it a real semantic subject
 * boundary when the local model is available. */
export function focusFromSegmentationMasks(
  masks: MaskResult[],
  mode: OrganicIsolationMode,
  point?: { x: number; y: number } | null,
): OrganicFocus | null {
  const usable = selectUsableStickerMasks(masks, mode === "layers" ? 3 : 4);
  if (!usable.length) return null;
  let chosen: MaskResult[];
  if (mode === "layers") chosen = usable.slice(0, 3);
  else if (mode === "tap" && point) {
    chosen = [[...usable].sort((a, b) => {
      const directA = sampleMask(a, point.x, point.y), directB = sampleMask(b, point.x, point.y);
      if (Math.abs(directA - directB) > .08) return directB - directA;
      const ca = maskCenter(a), cb = maskCenter(b);
      return Math.hypot(ca.x - point.x, ca.y - point.y) - Math.hypot(cb.x - point.x, cb.y - point.y);
    })[0]];
  } else chosen = usable.slice(0, 1);

  const rawField = new Float32Array(FIELD_SIZE * FIELD_SIZE);
  for (let y = 0; y < FIELD_SIZE; y++) for (let x = 0; x < FIELD_SIZE; x++) {
    const u = (x + .5) / FIELD_SIZE, v = (y + .5) / FIELD_SIZE;
    let value = 0;
    for (const mask of chosen) value = Math.max(value, sampleMask(mask, u, v));
    rawField[y * FIELD_SIZE + x] = value;
  }
  const field = blurField(rawField);
  let left = FIELD_SIZE, right = -1, top = FIELD_SIZE, bottom = -1;
  let edgeEnergy = 0, edgeCount = 0;
  for (let y = 0; y < FIELD_SIZE; y++) for (let x = 0; x < FIELD_SIZE; x++) {
    const index = y * FIELD_SIZE + x;
    if (field[index] >= .28) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (x + 1 < FIELD_SIZE) { edgeEnergy += Math.abs(field[index] - field[index + 1]); edgeCount++; }
    if (y + 1 < FIELD_SIZE) { edgeEnergy += Math.abs(field[index] - field[index + FIELD_SIZE]); edgeCount++; }
  }
  if (right < left || bottom < top) return null;
  const pad = 2.5;
  return {
    left: clamp01((left - pad) / FIELD_SIZE),
    right: clamp01((right + pad + 1) / FIELD_SIZE),
    top: clamp01((top - pad) / FIELD_SIZE),
    bottom: clamp01((bottom + pad + 1) / FIELD_SIZE),
    field,
    rawField,
    threshold: .42,
    jaggedness: clamp01((edgeEnergy / Math.max(1, edgeCount)) * 10),
    flowX: 0,
    flowY: 0,
    phase: 0,
  };
}

