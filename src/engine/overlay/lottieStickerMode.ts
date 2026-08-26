import { GIFEncoder, applyPalette, quantize } from "gifenc";

export type OrganicFocus = { x: number; y: number; rx: number; ry: number; phase: number };
export type LottieStickerBackground = "black" | "white";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Fast content-agnostic focal analysis. It combines edge energy, saturation,
 * luminance contrast and center bias on a tiny canvas, so upload/camera/Forge/
 * Motif all use the same path without adding work to the WebGL render loop. */
export function analyzeOrganicFocus(source: HTMLCanvasElement, previous?: OrganicFocus): OrganicFocus {
  const size = 72;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return previous ?? { x: .5, y: .5, rx: .43, ry: .42, phase: 0 };
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let total = 0, sx = 0, sy = 0, variance = 0;
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
  }
  const targetX = clamp((sx / Math.max(total, .001)) / size, .44, .56);
  const targetY = clamp((sy / Math.max(total, .001)) / size, .43, .57);
  const coherence = clamp(variance / (size * size * 85), 0, 1);
  const next = { x: targetX, y: targetY, rx: .43 + coherence * .015, ry: .41 + (1 - coherence) * .02, phase: (previous?.phase ?? 0) + .37 };
  if (!previous) return next;
  return { ...next, x: previous.x * .72 + next.x * .28, y: previous.y * .72 + next.y * .28 };
}

export function organicMaskAlpha(nx: number, ny: number, focus: OrganicFocus, time: number) {
  const dx = nx - focus.x, dy = ny - focus.y;
  const angle = Math.atan2(dy / focus.ry, dx / focus.rx);
  const living = 1 + Math.sin(angle * 3 + focus.phase + time * .7) * .055 + Math.sin(angle * 7 - time * .43) * .025;
  const radius = Math.pow(Math.pow(Math.abs(dx) / (focus.rx * living), 2.25) + Math.pow(Math.abs(dy) / (focus.ry * living), 2.25), 1 / 2.25);
  const t = clamp((1 - radius) / .13, 0, 1);
  return t * t * (3 - 2 * t);
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
