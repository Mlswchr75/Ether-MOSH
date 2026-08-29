import { GIFEncoder, applyPalette, quantize } from "gifenc";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clamp01 = (value: number) => clamp(value, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Resolution of the content-energy field analyzeOrganicFocus samples at.
 * Every cell gets its own reading — this is what makes the mask capable of
 * any topology (a hole, two disconnected fragments, a spiral, a thin
 * trailing streak) rather than the single radius-per-angle a polar contour
 * could ever express, which can only ever describe a shape star-convex
 * from one center. Cheap enough to run several times a second: 9k cells is
 * well under what a 64×36 SourceStats pass elsewhere in this app already
 * does routinely.
 */
export const FIELD_SIZE = 96;

export type OrganicFocus = {
  /**
   * Tight bounding box of where the content's own energy exceeds its
   * adaptive threshold, in SOURCE-frame normalized coordinates (0..1) —
   * each side read independently, so the result is exactly as asymmetric
   * as the content actually is. A shape that sprawls left and barely
   * right, or stretches tall and thin, produces a box that says exactly
   * that; it is never pulled back toward a centered, symmetric region.
   * This is what the sticker's own output frame gets cropped to — the
   * *frame*, not just the alpha inside a fixed frame, is content-shaped.
   */
  left: number;
  right: number;
  top: number;
  bottom: number;
  /**
   * The energy field itself, already temporally smoothed — sampled on a
   * FIELD_SIZE × FIELD_SIZE grid in SOURCE-frame space (not yet remapped
   * to the bounding box), so it can be resampled into any output size.
   */
  field: Float32Array;
  /**
   * Adaptive threshold (mean + a data-driven multiple of spread)
   * separating "this is content" from "this is background" in the field
   * above — recomputed on every analysis, never a fixed constant, so a
   * low-contrast frame and a blown-out one both get a real cut instead of
   * one guessing wrong for the other.
   */
  threshold: number;
  /**
   * 0 (soft gradient — smoke, a face, a glow) .. 1 (hard directional edges
   * — a logo, a girder, a fence). The field's own high-frequency energy
   * relative to a blurred copy of itself. Drives feather width, how much a
   * frame trusts its fresh read over its history, and how tightly the
   * bounding box itself is allowed to move frame to frame.
   */
  jaggedness: number;
  /** 2D drift of the content's centroid between analyses, in normalized
   *  units — bends the mask's feather to trail behind motion instead of
   *  just breathing in place. The 2D generalization of what used to be an
   *  angular-only flow term. */
  flowX: number;
  flowY: number;
  /** Frame-local phase for the small "alive" jitter — advances every
   *  analysis regardless of content. */
  phase: number;
};

const emptyFocus = (): OrganicFocus => ({
  left: .12, right: .88, top: .12, bottom: .88,
  field: new Float32Array(FIELD_SIZE * FIELD_SIZE).fill(.5),
  threshold: .3, jaggedness: 0, flowX: 0, flowY: 0, phase: 0,
});

/**
 * Content-aware focal analysis — the whole reason this file can build a
 * mask that never guesses.
 *
 * Builds a genuine per-pixel energy field over the source (edge strength +
 * local color contrast), derives an adaptive threshold from the field's own
 * distribution, and reads the field's real bounding box off independently
 * on all four sides. A single-valued "radius per angle" model (what this
 * used to be) can only ever describe star-convex blobs; a real 2D field can
 * express anything — because nothing here assumes the shape has one center
 * it radiates from.
 */
export function analyzeOrganicFocus(source: HTMLCanvasElement, previous?: OrganicFocus): OrganicFocus {
  const size = FIELD_SIZE;
  // The live GL canvas can be transiently 0×0 mid-capture — a resize, a
  // source-mode switch, WebGL context recreation — not just before capture
  // starts. drawImage throws on a 0×0 source, so this used to surface as an
  // export crash if the hiccup landed on any frame but the first; holding
  // onto the previous read for one tick (or a sane default with none yet)
  // is a better failure than losing the whole capture.
  if (source.width < 1 || source.height < 1) return previous ?? emptyFocus();
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return previous ?? emptyFocus();
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  const lum = (x: number, y: number) => {
    const i = (clamp(y, 0, size - 1) * size + clamp(x, 0, size - 1)) * 4;
    return data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  };

  // Raw per-pixel content signal: edge strength plus local chroma range.
  // Either alone misses cases the other catches — a flat-colored
  // silhouette against a flat background has real edges but low chroma
  // range at its center; a colorful soft gradient is the opposite.
  const raw = new Float32Array(size * size);
  let sum = 0, sumSq = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const edge = Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1));
    const v = clamp(edge / 255 * .72 + (max - min) / 255 * .34, 0, 2);
    raw[y * size + x] = v;
    sum += v; sumSq += v * v;
  }
  const n = size * size;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stddev = Math.sqrt(variance);

  // Jaggedness — how much of the field's own energy is high-frequency
  // texture rather than smooth gradient. Computed from the raw field
  // against a cheap box-blurred copy of itself, before temporal smoothing
  // touches either.
  const blurred = new Float32Array(size * size);
  let blurDiffSq = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
      s += raw[yy * size + xx]; c++;
    }
    const b = s / c;
    blurred[y * size + x] = b;
    const d = raw[y * size + x] - b;
    blurDiffSq += d * d;
  }
  const jaggedness = clamp01(Math.sqrt(blurDiffSq / n) * 3.4);

  // Temporal field blend — jagged content trusts its fresh read almost
  // entirely (a hard edge should snap to a new true position, not lag);
  // smooth content leans on its history so the shape doesn't flicker
  // pixel to pixel between two nearly-identical reads. Each cell also
  // leans on its own blurred neighborhood rather than the raw single-texel
  // value, so isolated sensor noise can't drive the cut on its own.
  const temporalWeight = previous ? clamp01(.62 - jaggedness * .48) : 0;
  const field = new Float32Array(n);
  for (let idx = 0; idx < n; idx++) {
    const fresh = raw[idx] * .3 + blurred[idx] * .7;
    field[idx] = previous ? previous.field[idx] * temporalWeight + fresh * (1 - temporalWeight) : fresh;
  }

  // Adaptive threshold — data-driven every single analysis, never a fixed
  // constant, so a low-contrast frame and a blown-out one both get a real
  // cut instead of one guessing wrong for the other.
  const threshold = Math.max(.06, mean + stddev * .55);

  // Bounding box — independently on all four sides, exactly as asymmetric
  // as the field actually is. This is the "sprawls left, barely right"
  // requirement: nothing here assumes or restores symmetry.
  let left = size, right = -1, top = size, bottom = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (field[y * size + x] >= threshold) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const hasContent = right >= left && bottom >= top;
  const pad = 1.5; // a couple of field cells of breathing room around the true edge
  let boxLeft = hasContent ? clamp01((left - pad) / size) : .12;
  let boxRight = hasContent ? clamp01((right + pad) / size) : .88;
  let boxTop = hasContent ? clamp01((top - pad) / size) : .12;
  let boxBottom = hasContent ? clamp01((bottom + pad) / size) : .88;
  // Never fully degenerate — a single hot cell shouldn't produce a
  // zero-area frame.
  if (boxRight - boxLeft < .08) { const c = (boxLeft + boxRight) / 2; boxLeft = clamp01(c - .04); boxRight = clamp01(c + .04); }
  if (boxBottom - boxTop < .08) { const c = (boxTop + boxBottom) / 2; boxTop = clamp01(c - .04); boxBottom = clamp01(c + .04); }

  // Temporally blend the box itself the same way the field does — jagged
  // or fast-moving content is allowed to resize/reposition the frame
  // quickly; calm content keeps the frame steady so the crop doesn't drift
  // for no reason.
  const boxWeight = previous ? clamp01(.72 - jaggedness * .5) : 0;
  const finalLeft = previous ? lerp(boxLeft, previous.left, boxWeight) : boxLeft;
  const finalRight = previous ? lerp(boxRight, previous.right, boxWeight) : boxRight;
  const finalTop = previous ? lerp(boxTop, previous.top, boxWeight) : boxTop;
  const finalBottom = previous ? lerp(boxBottom, previous.bottom, boxWeight) : boxBottom;

  const cx = (finalLeft + finalRight) / 2, cy = (finalTop + finalBottom) / 2;
  const prevCx = previous ? (previous.left + previous.right) / 2 : cx;
  const prevCy = previous ? (previous.top + previous.bottom) / 2 : cy;
  const flowX = clamp((cx - prevCx) * 6, -1, 1);
  const flowY = clamp((cy - prevCy) * 6, -1, 1);

  return {
    left: finalLeft, right: finalRight, top: finalTop, bottom: finalBottom,
    field, threshold, jaggedness, flowX, flowY,
    phase: (previous?.phase ?? 0) + .31,
  };
}

/**
 * Output canvas dimensions for a capture — the content's own bounding box
 * aspect ratio, scaled to fit within maxDimension on its longer side.
 * Never forced back to the source's own aspect: a tall, thin shape gets a
 * tall, thin frame; a shape that's nearly square gets a square one. This is
 * the "doesn't always have to be landscape" behavior — the frame itself is
 * content-shaped, not just the alpha drawn inside a fixed landscape canvas.
 */
export function contentFrameSize(focus: OrganicFocus, maxDimension: number): { width: number; height: number } {
  const aspect = (focus.right - focus.left) / Math.max(.001, focus.bottom - focus.top);
  let width: number, height: number;
  if (aspect >= 1) { width = maxDimension; height = maxDimension / aspect; }
  else { height = maxDimension; width = maxDimension * aspect; }
  return { width: Math.max(2, Math.round(width)), height: Math.max(2, Math.round(height)) };
}

/** Bilinear-sample the energy field at a normalized SOURCE-frame coordinate. */
function sampleField(focus: OrganicFocus, u: number, v: number): number {
  const size = FIELD_SIZE;
  const fx = clamp(u * size - .5, 0, size - 1);
  const fy = clamp(v * size - .5, 0, size - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const f = focus.field;
  const a = f[y0 * size + x0], b = f[y0 * size + x1];
  const c = f[y1 * size + x0], d = f[y1 * size + x1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/**
 * Crop the source to the focus's own bounding box and cut it by the energy
 * field's threshold, soft-edged. Because the cut comes straight from a real
 * per-pixel field rather than a reconstructed radial contour, it can be any
 * topology the content actually has — a hole, disconnected fragments, a
 * spiral, a thin trailing streak — never approximated as one star-convex
 * blob.
 */
export function renderOrganicStickerFrame(
  source: HTMLCanvasElement,
  focus: OrganicFocus,
  width: number,
  height: number,
  time: number,
): ImageData {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Lottie Sticker canvas unavailable");

  const boxW = Math.max(.001, focus.right - focus.left);
  const boxH = Math.max(.001, focus.bottom - focus.top);
  // Draw only the content's own bounding box from the source, scaled to
  // fill this output canvas — the crop *is* the frame now, not the full
  // source scaled down with a mask floating somewhere inside it.
  // Same transient-0×0 hiccup analyzeOrganicFocus guards against —
  // drawImage throws on a 0×0 source. Skipping the draw for this one tick
  // (leaving the frame blank/transparent) is a far better failure than
  // losing an entire multi-second capture to a mid-loop resize.
  if (source.width > 0 && source.height > 0) {
    const sx = focus.left * source.width, sy = focus.top * source.height;
    const sw = Math.max(1, boxW * source.width), sh = Math.max(1, boxH * source.height);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  }
  const frame = ctx.getImageData(0, 0, width, height);

  // Feather width, in field-units so it scales with FIELD_SIZE rather than
  // output size — jagged content gets a thin, crisp cut that reads as its
  // own true edge; smooth content keeps a soft flowing feather.
  const featherLo = lerp(.09, .025, focus.jaggedness);
  const featherHi = featherLo + lerp(.05, .012, focus.jaggedness);
  const featherSpan = Math.max(.001, featherHi + featherLo);
  // A hard transparent rim at the crop's own edges — breathing room even
  // where the field's threshold crossing runs right to the boundary.
  const rimPx = Math.max(1, Math.round(Math.min(width, height) * .028));

  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    // Map this output pixel back into SOURCE-frame normalized space,
    // offset slightly against the flow so the mask trails behind fast
    // motion — the 2D generalization of the old system's "protrusions
    // bend behind rotating content".
    const u = focus.left + (x + .5) / width * boxW - focus.flowX * .02;
    const v = focus.top + (y + .5) / height * boxH - focus.flowY * .02;
    const value = sampleField(focus, u, v);
    // Soft threshold: a smoothstep band straddling the adaptive threshold.
    // This is what lets the mask trace any topology the field actually has
    // — a hole reads as a hole, two separate hot regions read as two
    // separate pieces, a thin bright streak reads as a thin streak —
    // instead of approximating everything as one star-convex blob.
    const t = clamp01((value - (focus.threshold - featherLo)) / featherSpan);
    let alpha = t * t * (3 - 2 * t);
    // Small idle "alive" jitter so a static image doesn't produce a
    // perfectly frozen cut — shrinks as content gets more jagged.
    const jitter = (Math.sin(x * .19 + focus.phase + time * .6) * .02 + Math.sin(y * .23 - time * .4) * .02) * (1 - focus.jaggedness * .6);
    alpha = clamp01(alpha + jitter * alpha);
    const edgeDist = Math.min(x, width - 1 - x, y, height - 1 - y);
    const rim = clamp01(edgeDist / rimPx);
    alpha *= rim * rim * (3 - 2 * rim);
    frame.data[i + 3] = Math.round(frame.data[i + 3] * alpha);
  }
  return frame;
}

export type LottieStickerBackground = "black" | "white";

export function drawLottieStickerPreview(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, focus: OrganicFocus, background: LottieStickerBackground, time: number) {
  const { width, height } = ctx.canvas;
  const base = background === "black" ? 5 : 246;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = `rgb(${base} ${base} ${base})`; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 4; i++) {
    const x = (Math.sin(time * (.22 + i * .03) + i * 1.7) * .3 + .5) * width;
    const y = (Math.cos(time * (.18 + i * .04) + i * 2.1) * .3 + .5) * height;
    const delta = background === "black" ? 10 + i * 2 : -(9 + i * 2);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * .55);
    gradient.addColorStop(0, `rgba(${base + delta},${base + delta},${base + delta},.38)`);
    gradient.addColorStop(1, `rgba(${base},${base},${base},0)`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  }
  const masked = renderOrganicStickerFrame(source, focus, width, height, time);
  const work = document.createElement("canvas"); work.width = width; work.height = height;
  work.getContext("2d")?.putImageData(masked, 0, 0);
  ctx.drawImage(work, 0, 0);
}

export async function encodeStickerFramesForLottie(frames: ImageData[]) {
  const encoded: Array<{ width: number; height: number; dataUrl: string }> = [];
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index];
    const canvas = document.createElement("canvas"); canvas.width = frame.width; canvas.height = frame.height;
    canvas.getContext("2d")?.putImageData(frame, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Transparent frame encoding failed")), "image/webp", .86));
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Transparent frame read failed"));
      reader.readAsDataURL(blob);
    });
    encoded.push({ width: frame.width, height: frame.height, dataUrl });
    // Alpha WebP is dramatically lighter than PNG for noisy MOSH frames. Yield
    // every frame so WebGL, input and the
    // progress UI continue advancing on phones during export.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return encoded;
}

export function buildEncodedFrameSequenceLottie(name: string, frames: Array<{ width: number; height: number; dataUrl: string }>, fps: number) {
  if (!frames.length) throw new Error("No Lottie Sticker frames captured");
  const width = frames[0].width, height = frames[0].height;
  const assets = frames.map((frame, index) => ({ id: `frame_${index}`, w: width, h: height, u: "", p: frame.dataUrl, e: 1 }));
  const layers = frames.map((_, index) => ({ ddd: 0, ind: index + 1, ty: 2, nm: `Frame ${index + 1}`, refId: `frame_${index}`, sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [width / 2, height / 2, 0] }, a: { a: 0, k: [width / 2, height / 2, 0] }, s: { a: 0, k: [100, 100, 100] } }, ao: 0, ip: index, op: index + 1, st: index, bm: 0 })).reverse();
  return { v: "5.12.2", fr: fps, ip: 0, op: frames.length, w: width, h: height, nm: name, ddd: 0, assets, layers, markers: [] };
}

export async function encodeTransparentStickerGif(frames: ImageData[], fps: number): Promise<Blob> {
  if (frames.length < 2) throw new Error("GIF needs at least two frames");
  const width = frames[0].width, height = frames[0].height, gif = GIFEncoder();
  for (let index = 0; index < frames.length; index++) {
    const rgba = frames[index].data;
    const palette = quantize(rgba, 256, { format: "rgba4444" });
    palette[0] = [0, 0, 0, 0];
    const indexed = applyPalette(rgba, palette, "rgba4444");
    for (let p = 0; p < indexed.length; p++) if (rgba[p * 4 + 3] < 32) indexed[p] = 0;
    gif.writeFrame(indexed, width, height, { palette, delay: Math.round(1000 / fps), transparent: true, transparentIndex: 0 });
    if (index % 3 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  gif.finish();
  const bytes = gif.bytes(), copy = new Uint8Array(bytes.length); copy.set(bytes);
  return new Blob([copy], { type: "image/gif" });
}
