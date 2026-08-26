import { GIFEncoder, applyPalette, quantize } from "gifenc";

export type OrganicFocus = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  phase: number;
  /** Per-angle radius deltas derived from the current frame's structures. */
  contour?: Float32Array;
  /** Signed angular travel detected between consecutive analyzed frames. */
  flow?: number;
};
export type LottieStickerBackground = "black" | "white";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const CONTOUR_BINS = 96;
const TAU = Math.PI * 2;

function contourAt(contour: Float32Array | undefined, angle: number) {
  if (!contour?.length) return 0;
  const position = ((angle / TAU) % 1 + 1) % 1 * contour.length;
  const left = Math.floor(position) % contour.length;
  const right = (left + 1) % contour.length;
  const mix = position - Math.floor(position);
  return contour[left] * (1 - mix) + contour[right] * mix;
}

function detectedAngularFlow(current: Float32Array, previous?: Float32Array) {
  if (!previous || previous.length !== current.length) return 0;
  let bestShift = 0, bestError = Infinity;
  for (let shift = -6; shift <= 6; shift++) {
    let error = 0;
    for (let index = 0; index < current.length; index++) {
      const prior = previous[(index - shift + current.length) % current.length];
      const delta = current[index] - prior;
      error += delta * delta;
    }
    if (error < bestError) { bestError = error; bestShift = shift; }
  }
  return bestShift * TAU / current.length;
}

function safeRadiusScale(focus: OrganicFocus, angle: number) {
  const margin = .035;
  const power = 2.25;
  const norm = Math.pow(Math.abs(Math.cos(angle)) ** power + Math.abs(Math.sin(angle)) ** power, 1 / power);
  const vx = Math.cos(angle) / norm * focus.rx;
  const vy = Math.sin(angle) / norm * focus.ry;
  let limit = 2;
  if (vx > 0) limit = Math.min(limit, (1 - margin - focus.x) / vx);
  else if (vx < 0) limit = Math.min(limit, (margin - focus.x) / vx);
  if (vy > 0) limit = Math.min(limit, (1 - margin - focus.y) / vy);
  else if (vy < 0) limit = Math.min(limit, (margin - focus.y) / vy);
  return clamp(limit, .72, 1.28);
}

/** Fast content-aware focal and contour analysis. Besides choosing the visual
 * center, it samples structural energy along radial lanes. Lines, folds and
 * repeating bands that continue through the base silhouette pull narrow parts
 * of the mask outward; quiet lanes contract. Frame-to-frame angular
 * correlation supplies flow for spirals and rotating structures. */
export function analyzeOrganicFocus(source: HTMLCanvasElement, previous?: OrganicFocus): OrganicFocus {
  const size = 72;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return previous ?? { x: .5, y: .5, rx: .43, ry: .42, phase: 0 };
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let total = 0, sx = 0, sy = 0, variance = 0, totalEnergy = 0;
  const energy = new Float32Array(size * size);
  const lum = (x: number, y: number) => {
    const i = (clamp(y, 0, size - 1) * size + clamp(x, 0, size - 1)) * 4;
    return data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
  };
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = (y * size + x) * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const edge = Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1));
    const center = Math.exp(-(((x / size - .5) ** 2 + (y / size - .5) ** 2) / .24));
    const weight = .01 + edge / 255 * .58 + (max - min) / 255 * .25 + center * .16;
    total += weight; sx += x * weight; sy += y * weight; variance += edge;
    const structure = clamp(edge / 255 * .72 + (max - min) / 255 * .28, 0, 1.5);
    energy[y * size + x] = structure;
    totalEnergy += structure;
  }
  const targetX = clamp((sx / Math.max(total, .001)) / size, .41, .59);
  const targetY = clamp((sy / Math.max(total, .001)) / size, .40, .60);
  const coherence = clamp(variance / (size * size * 85), 0, 1);
  const x = previous ? previous.x * .7 + targetX * .3 : targetX;
  const y = previous ? previous.y * .7 + targetY * .3 : targetY;
  const rx = .415 + coherence * .02, ry = .405 + (1 - coherence) * .02;
  const meanEnergy = totalEnergy / ((size - 2) * (size - 2));
  const raw = new Float32Array(CONTOUR_BINS);
  for (let bin = 0; bin < CONTOUR_BINS; bin++) {
    const angle = bin / CONTOUR_BINS * TAU;
    let strongest = 0, strongestRadius = .78, outerRun = 0, bestRunRadius = .82;
    for (let step = 0; step < 21; step++) {
      const radius = .62 + step * .032;
      const px = clamp(Math.round((x + Math.cos(angle) * rx * radius) * size), 1, size - 2);
      const py = clamp(Math.round((y + Math.sin(angle) * ry * radius) * size), 1, size - 2);
      const signal = energy[py * size + px];
      if (signal > strongest) { strongest = signal; strongestRadius = radius; }
      if (signal > meanEnergy * 1.12 + .025) {
        outerRun++;
        if (outerRun >= 2) bestRunRadius = radius;
      } else outerRun = Math.max(0, outerRun - 1);
    }
    const reached = Math.max(strongestRadius, bestRunRadius);
    const pull = (reached - .88) * .52 + (strongest - meanEnergy) * .13;
    raw[bin] = clamp(pull, -.085, .235);
  }
  const contour = new Float32Array(CONTOUR_BINS);
  for (let bin = 0; bin < CONTOUR_BINS; bin++) {
    const angle = bin / CONTOUR_BINS * TAU;
    const broad = (raw[(bin - 2 + CONTOUR_BINS) % CONTOUR_BINS] + raw[(bin - 1 + CONTOUR_BINS) % CONTOUR_BINS] * 2 + raw[bin] * 3 + raw[(bin + 1) % CONTOUR_BINS] * 2 + raw[(bin + 2) % CONTOUR_BINS]) / 9;
    const structural = raw[bin] * .48 + broad * .52;
    const temporal = previous?.contour?.length === CONTOUR_BINS ? previous.contour[bin] * .58 + structural * .42 : structural;
    contour[bin] = clamp(temporal, -.08, safeRadiusScale({ x, y, rx, ry, phase: 0 }, angle) - 1);
  }
  const measuredFlow = detectedAngularFlow(contour, previous?.contour);
  const flow = clamp((previous?.flow ?? 0) * .6 + measuredFlow * .4, -.22, .22);
  return { x, y, rx, ry, phase: (previous?.phase ?? 0) + .31 + flow * 1.8, contour, flow };
}

export function organicMaskAlpha(nx: number, ny: number, focus: OrganicFocus, time: number) {
  const dx = nx - focus.x, dy = ny - focus.y;
  const angle = Math.atan2(dy / focus.ry, dx / focus.rx);
  const baseRadius = Math.pow(Math.pow(Math.abs(dx) / focus.rx, 2.25) + Math.pow(Math.abs(dy) / focus.ry, 2.25), 1 / 2.25);
  // Angular travel bends outer protrusions behind rotating content, creating a
  // trailing spiral instead of rotating the entire sticker as one rigid blob.
  const trailingAngle = angle - (focus.flow ?? 0) * clamp((baseRadius - .45) * 2.2, 0, 1);
  const contentPull = contourAt(focus.contour, trailingAngle);
  const living = Math.sin(angle * 3 + focus.phase + time * .52) * .032 + Math.sin(angle * 7 - time * .31) * .014;
  const radiusScale = clamp(1 + contentPull + living, .78, 1.26);
  const t = clamp((1 - baseRadius / radiusScale) / .115, 0, 1);
  const organic = t * t * (3 - 2 * t);
  // A hard transparent rim plus a short feather guarantees breathing room
  // even while a fast-moving tendril briefly outruns the analyzed contour.
  // Keeping this branch arithmetic-only matters because it runs per pixel.
  const edgeDistance = Math.min(nx, 1 - nx, ny, 1 - ny);
  const rim = clamp((edgeDistance - .03) / .025, 0, 1);
  return organic * rim * rim * (3 - 2 * rim);
}

export function renderOrganicStickerFrame(source: HTMLCanvasElement, width: number, height: number, focus: OrganicFocus, time: number): ImageData {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Lottie Sticker canvas unavailable");
  ctx.drawImage(source, 0, 0, width, height);
  const frame = ctx.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const alpha = organicMaskAlpha((x + .5) / width, (y + .5) / height, focus, time);
    frame.data[i + 3] = Math.round(frame.data[i + 3] * alpha);
  }
  return frame;
}

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
  const masked = renderOrganicStickerFrame(source, width, height, focus, time);
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
