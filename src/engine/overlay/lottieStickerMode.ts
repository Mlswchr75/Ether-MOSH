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
  /** 0 (soft gradient, a face, smoke) .. 1 (hard directional edges — a
   *  building, a logo, a fence). Derived from how sharply the contour's
   *  reach swings bin-to-bin; drives how little the shape gets smoothed,
   *  how rectangular the base silhouette leans, how thin the mask's edge
   *  transition is, and how much a frame trusts its own fresh read over
   *  its history. This is what keeps the mask from defaulting to a blob. */
  jaggedness?: number;
  /** Superellipse exponent for the base silhouette — ~2 (rounded) for
   *  organic content, up toward ~3.8 (squared-off) for geometric content.
   *  Derived from jaggedness so even the shape underneath the contour
   *  extension already leans toward what the content actually looks like. */
  power?: number;
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

/**
 * The true geometric ceiling on how far the mask can extend at a given
 * angle before it would draw past the sticker's own output frame (minus a
 * small margin) — naturally larger along the axes than toward the corners,
 * which is exactly the "reach out as far as it can before the actual tile
 * borders" behavior content-driven extension should be free to use. Used to
 * be clamped to a flat 1.28 regardless of what the geometry actually
 * allowed, which was the main reason nothing could ever reach past a small
 * bump on the base ellipse — raised well past that so a sustained structural
 * read (a beam, a limb, a shard) can genuinely ride out toward the edge.
 */
function safeRadiusScale(focus: OrganicFocus, angle: number, power = 2.25) {
  const margin = .035;
  const norm = Math.pow(Math.abs(Math.cos(angle)) ** power + Math.abs(Math.sin(angle)) ** power, 1 / power);
  const vx = Math.cos(angle) / norm * focus.rx;
  const vy = Math.sin(angle) / norm * focus.ry;
  let limit = 2.7;
  if (vx > 0) limit = Math.min(limit, (1 - margin - focus.x) / vx);
  else if (vx < 0) limit = Math.min(limit, (margin - focus.x) / vx);
  if (vy > 0) limit = Math.min(limit, (1 - margin - focus.y) / vy);
  else if (vy < 0) limit = Math.min(limit, (margin - focus.y) / vy);
  return clamp(limit, .72, 2.7);
}

/** Fast content-aware focal and contour analysis. Besides choosing the visual
 * center, it samples structural energy along radial lanes. Lines, folds and
 * repeating bands that continue through the base silhouette pull narrow parts
 * of the mask outward; quiet lanes contract. Frame-to-frame angular
 * correlation supplies flow for spirals and rotating structures. */
export function analyzeOrganicFocus(source: HTMLCanvasElement, previous?: OrganicFocus): OrganicFocus {
  const size = 72;
  // The live GL canvas can be transiently 0×0 mid-capture — a resize, a
  // source-mode switch, WebGL context recreation — not just before capture
  // starts. drawImage throws on a 0×0 source, so this used to surface as an
  // export crash if the hiccup landed on any frame but the first; holding
  // onto the previous read for one tick (or a sane default with none yet)
  // is a better failure than losing the whole capture.
  if (source.width < 1 || source.height < 1) return previous ?? { x: .5, y: .5, rx: .43, ry: .42, phase: 0 };
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

  // Raw radial reach per angle: how far outward the source's own structure —
  // an edge, a limb, a girder, a shard — actually continues before the
  // signal dies out. Searched well past the nominal frame (up to ~1.72×) so
  // content that genuinely extends that far has something to find; how much
  // of this un-smoothed read survives into the final contour depends on how
  // jagged it turns out to be, below.
  const raw = new Float32Array(CONTOUR_BINS);
  for (let bin = 0; bin < CONTOUR_BINS; bin++) {
    const angle = bin / CONTOUR_BINS * TAU;
    let strongest = 0, strongestRadius = .78, outerRun = 0, bestRunRadius = .82;
    for (let step = 0; step < 26; step++) {
      const radius = .58 + step * .044;
      const px = clamp(Math.round((x + Math.cos(angle) * rx * radius) * size), 1, size - 2);
      const py = clamp(Math.round((y + Math.sin(angle) * ry * radius) * size), 1, size - 2);
      const signal = energy[py * size + px];
      if (signal > strongest) { strongest = signal; strongestRadius = radius; }
      if (signal > meanEnergy * 1.1 + .02) {
        outerRun++;
        if (outerRun >= 2) bestRunRadius = radius;
      } else outerRun = Math.max(0, outerRun - 1);
    }
    const reached = Math.max(strongestRadius, bestRunRadius);
    const pull = (reached - .82) * .95 + (strongest - meanEnergy) * .22;
    raw[bin] = clamp(pull, -.14, 1.7);
  }

  // Jaggedness: how sharply the reach swings from one angle to the next.
  // A hard-edged silhouette (a building, a logo, a chain-link fence) jumps
  // bin to bin; a soft gradient or a face changes gradually. This single
  // number is what separates "reads as this specific shape" from "always a
  // blob" — it sets how little the contour below gets smoothed, how
  // rectangular the base silhouette leans, how thin the mask's edge
  // transition is, and how much a frame trusts its own fresh read over its
  // history, all in one place rather than each picking its own heuristic.
  let curvature = 0;
  for (let bin = 0; bin < CONTOUR_BINS; bin++) {
    const d2 = raw[(bin + 1) % CONTOUR_BINS] - 2 * raw[bin] + raw[(bin - 1 + CONTOUR_BINS) % CONTOUR_BINS];
    curvature += d2 * d2;
  }
  const jaggedness = clamp(Math.sqrt(curvature / CONTOUR_BINS) * 7.5, 0, 1);
  const power = 1.9 + jaggedness * 1.9;

  const contour = new Float32Array(CONTOUR_BINS);
  // How much of the un-smoothed read survives (vs. the 5-tap blur below) —
  // mostly-raw for jagged content, mostly-blurred for organic content.
  const rawWeight = .22 + jaggedness * .66;
  // How much this frame trusts its own history vs. its fresh read — jagged
  // content is allowed to snap onto a new true edge rather than dragging
  // the previous frame's shape toward it over several frames.
  const temporalWeight = .62 - jaggedness * .42;
  for (let bin = 0; bin < CONTOUR_BINS; bin++) {
    const angle = bin / CONTOUR_BINS * TAU;
    const broad = (raw[(bin - 2 + CONTOUR_BINS) % CONTOUR_BINS] + raw[(bin - 1 + CONTOUR_BINS) % CONTOUR_BINS] * 2 + raw[bin] * 3 + raw[(bin + 1) % CONTOUR_BINS] * 2 + raw[(bin + 2) % CONTOUR_BINS]) / 9;
    const structural = raw[bin] * rawWeight + broad * (1 - rawWeight);
    const temporal = previous?.contour?.length === CONTOUR_BINS ? previous.contour[bin] * temporalWeight + structural * (1 - temporalWeight) : structural;
    contour[bin] = clamp(temporal, -.1, safeRadiusScale({ x, y, rx, ry, phase: 0 }, angle, power) - 1);
  }
  const measuredFlow = detectedAngularFlow(contour, previous?.contour);
  const flow = clamp((previous?.flow ?? 0) * .6 + measuredFlow * .4, -.22, .22);
  return { x, y, rx, ry, phase: (previous?.phase ?? 0) + .31 + flow * 1.8, contour, flow, jaggedness, power };
}

export function organicMaskAlpha(nx: number, ny: number, focus: OrganicFocus, time: number) {
  const jaggedness = focus.jaggedness ?? 0;
  const power = focus.power ?? 2.25;
  const dx = nx - focus.x, dy = ny - focus.y;
  const angle = Math.atan2(dy / focus.ry, dx / focus.rx);
  // The base silhouette's own exponent leans rectangular for geometric
  // content and rounded for organic content — the shape reads as content-
  // shaped even before the contour extension below has any say.
  const baseRadius = Math.pow(Math.pow(Math.abs(dx) / focus.rx, power) + Math.pow(Math.abs(dy) / focus.ry, power), 1 / power);
  // Angular travel bends outer protrusions behind rotating content, creating a
  // trailing spiral instead of rotating the entire sticker as one rigid blob.
  const trailingAngle = angle - (focus.flow ?? 0) * clamp((baseRadius - .45) * 2.2, 0, 1);
  const contentPull = contourAt(focus.contour, trailingAngle);
  // A sharp edge shouldn't wobble into softness, so the idle "alive" jitter
  // shrinks as content gets more jagged; organic content keeps the fuller
  // flowing motion.
  const living = (Math.sin(angle * 3 + focus.phase + time * .52) * .032 + Math.sin(angle * 7 - time * .31) * .014) * (1 - jaggedness * .6);
  const radiusScale = clamp(1 + contentPull + living, .74, 2.75);
  // The mask edge itself narrows for jagged content — a crisp cut that
  // actually reads as the object's own boundary — and stays a soft flowing
  // feather for organic content. Interpolated rather than switched, so a
  // frame that's part hard-edged object against part soft glow lands
  // in between instead of snapping between two looks.
  const band = .15 - jaggedness * .105;
  const t = clamp((1 - baseRadius / radiusScale) / band, 0, 1);
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
  // Same transient-0×0 hiccup analyzeOrganicFocus guards against — drawImage
  // throws on a 0×0 source. Skipping the draw for this one tick (leaving the
  // frame blank/transparent) is a far better failure than losing an entire
  // multi-second capture to a mid-loop resize.
  if (source.width > 0 && source.height > 0) ctx.drawImage(source, 0, 0, width, height);
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
