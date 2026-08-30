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
   * The RENDER-READY mask — a FIELD_SIZE × FIELD_SIZE grid in SOURCE-frame
   * space (not yet remapped to the bounding box), so it can be resampled
   * into any output size. This is NOT the raw per-pixel energy reading —
   * it's that energy thresholded, morphologically CLOSED (small interior
   * gaps and rim dropouts filled solid, the way flat-colored interior mass
   * with little of its own edge/chroma signal would otherwise read as
   * "background" and get carved out even though it's plainly still part of
   * the subject), and lightly blurred for a soft, organic edge. A gap wide
   * enough to be genuinely separate content (see the disconnected-regions
   * test) survives the close untouched; a few-cell dropout inside one blob
   * does not.
   */
  field: Float32Array;
  /**
   * The raw temporally-smoothed energy field BEFORE thresholding/closing —
   * kept only so the next analysis has real energy data to blend against
   * for temporal continuity. Never read for rendering; `field` above is.
   */
  rawField?: Float32Array;
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

export type OrganicIsolationMode = "auto" | "layers" | "tap";

const emptyFocus = (): OrganicFocus => ({
  left: .12, right: .88, top: .12, bottom: .88,
  field: new Float32Array(FIELD_SIZE * FIELD_SIZE).fill(.5),
  threshold: .3, jaggedness: 0, flowX: 0, flowY: 0, phase: 0,
});

/**
 * Binary dilate/erode, Chebyshev (square) neighborhood, separable into a
 * horizontal then vertical pass. `erode(dilate(mask, r), r)` is a CLOSE: it
 * bridges any gap up to ~2r cells wide without changing the silhouette's
 * overall size or position. Used only to patch small connectivity dropouts
 * in an otherwise-real boundary (a soft gradient rim, or FX dithering that
 * happens to thin out at a few points around it) BEFORE the enclosed-hole
 * fill below runs — an unbridged pinhole gap would let that fill's flood
 * fill leak straight through and treat a real interior as reachable
 * background.
 */
function dilateBinary(src: Uint8Array, size: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (let dx = -r; dx <= r && !hit; dx++) if (src[y * size + clamp(x + dx, 0, size - 1)]) hit = 1;
    tmp[y * size + x] = hit;
  }
  const out = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    let hit = 0;
    for (let dy = -r; dy <= r && !hit; dy++) if (tmp[clamp(y + dy, 0, size - 1) * size + x]) hit = 1;
    out[y * size + x] = hit;
  }
  return out;
}
function erodeBinary(src: Uint8Array, size: number, r: number): Uint8Array {
  if (r <= 0) return src;
  const tmp = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let all = 1;
    for (let dx = -r; dx <= r && all; dx++) if (!src[y * size + clamp(x + dx, 0, size - 1)]) all = 0;
    tmp[y * size + x] = all;
  }
  const out = new Uint8Array(size * size);
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    let all = 1;
    for (let dy = -r; dy <= r && all; dy++) if (!tmp[clamp(y + dy, 0, size - 1) * size + x]) all = 0;
    out[y * size + x] = all;
  }
  return out;
}

/**
 * Fill any ENCLOSED background — a flood fill from every border cell across
 * non-hot cells marks true, outside-reachable background; whatever is left
 * over (non-hot, but never reached) is topologically inside the hot region
 * and gets filled solid, no matter how large. This is the fix for a flat,
 * low-texture interior (a sphere's body, a solid silhouette) reading as
 * "background" purely because it has little edge/chroma energy of its own:
 * a fixed-radius morphological close can only ever bridge a few cells, but
 * an enclosed region can be any size — this handles all of them the same
 * way. Two genuinely separate blobs are untouched, because the background
 * between them also touches the border and so is never "enclosed".
 */
function fillEnclosedHoles(hot: Uint8Array, size: number): Uint8Array {
  const reached = new Uint8Array(size * size); // 1 = background, reachable from the border
  const stack: number[] = [];
  const visit = (x: number, y: number) => {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = y * size + x;
    if (hot[idx] || reached[idx]) return;
    reached[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < size; x++) { visit(x, 0); visit(x, size - 1); }
  for (let y = 0; y < size; y++) { visit(0, y); visit(size - 1, y); }
  while (stack.length) {
    const idx = stack.pop() as number;
    const x = idx % size, y = (idx / size) | 0;
    visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1);
  }
  const filled = new Uint8Array(size * size);
  for (let i = 0; i < filled.length; i++) filled[i] = hot[i] || !reached[i] ? 1 : 0;
  return filled;
}
/** Separable box blur over a 0/1 (or any float) field — softens the filled
 *  mask's blocky boundary into an organic, antialiased edge. */
function boxBlurFloat(src: Float32Array, size: number, r: number): Float32Array {
  if (r <= 0) return src;
  const tmp = new Float32Array(size * size);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0;
    for (let dx = -r; dx <= r; dx++) s += src[y * size + clamp(x + dx, 0, size - 1)];
    tmp[y * size + x] = s * norm;
  }
  const out = new Float32Array(size * size);
  for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) {
    let s = 0;
    for (let dy = -r; dy <= r; dy++) s += tmp[clamp(y + dy, 0, size - 1) * size + x];
    out[y * size + x] = s * norm;
  }
  return out;
}

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

  // Robust background-color estimate — the average color of the field's own
  // outermost couple of cells. Background touching the frame border is a
  // fair assumption for focal-subject content generally, and this is the
  // signal that catches what edge/chroma-range energy below cannot: a
  // smoothly, gradually SHADED region (the unlit far side of a sphere, a
  // soft falloff) has almost no local edge of its own between neighboring
  // pixels, yet it's still a plainly different color than the background
  // throughout. Genuine per-pixel color distance from that estimate finds
  // it regardless of how little local texture it has.
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  const borderWidth = 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (x >= borderWidth && x < size - borderWidth && y >= borderWidth && y < size - borderWidth) continue;
    const i = (y * size + x) * 4;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2]; bgCount++;
  }
  bgR /= bgCount; bgG /= bgCount; bgB /= bgCount;

  // Raw per-pixel content signal: edge strength, local chroma range, and
  // color distance from the estimated background. No single term alone
  // covers every case — a flat-colored silhouette against a flat
  // background has real edges but low chroma range at its center; a
  // colorful soft gradient is the opposite; a smoothly-shaded region with
  // neither strong edges nor much internal color variation still reads as
  // content through the third term alone.
  const raw = new Float32Array(size * size);
  let sum = 0, sumSq = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const edge = Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1));
    const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
    const bgDist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.673; // normalized by max possible RGB distance
    const v = clamp(edge / 255 * .5 + (max - min) / 255 * .22 + bgDist * .72, 0, 2);
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

  // Temporal field blend. `previous` being undefined is the deliberate
  // "just changed" signal — the caller clears its ref the instant the mosh
  // stack itself changes (a fresh seed from mosh()/reroll/preset-load, not
  // an audio-reactive param wiggle within the same stack), so a genuine
  // stack change snaps here immediately with weight 0, no lag. Whenever a
  // previous read DOES exist, the stack is the same one as last frame —
  // audio-reactive motion still moves the shape, but gently: a high, mostly
  // jaggedness-INsensitive weight, unlike the old formula that let jagged
  // content (which a spiral or swirl very much is) collapse toward trusting
  // almost pure fresh noise every read, reading as constant jitter. Each
  // cell also leans on its own blurred neighborhood rather than the raw
  // single-texel value, so isolated sensor noise can't drive the cut alone.
  //
  // This is the RAW energy field — still per-pixel edge/chroma signal, not
  // yet thresholded or closed. Kept only for temporal continuity and for
  // driving the threshold below; renderOrganicStickerFrame never sees it.
  const temporalWeight = previous ? clamp01(.93 - jaggedness * .12) : 0;
  const energyField = new Float32Array(n);
  for (let idx = 0; idx < n; idx++) {
    const fresh = raw[idx] * .3 + blurred[idx] * .7;
    energyField[idx] = previous?.rawField ? previous.rawField[idx] * temporalWeight + fresh * (1 - temporalWeight) : fresh;
  }

  // Adaptive threshold — data-driven every single analysis, never a fixed
  // constant, so a low-contrast frame and a blown-out one both get a real
  // cut instead of one guessing wrong for the other. Originally .55; pulled
  // in once to .35 once the enclosed-hole fill and background-distance term
  // started doing real work, but .35 turned out too permissive on its
  // own — enough of the frame (including near-edge, low-contrast texture)
  // crossed it that the box routinely swelled toward the full source frame,
  // reading as a flat rectangle with barely any organic edge left to cut.
  // .45 splits the difference: still far more forgiving than the original
  // for genuinely-real-but-modest content (center leniency below and the
  // fill/bridge machinery cover the rest), without inviting the frame's own
  // low-level edge texture to count as "content" on its own.
  const threshold = Math.max(.06, mean + stddev * .45);

  // Center leniency — the source is drawn "cover"-fit (see sourceFillMaterial
  // in Renderer.ts), so whatever the content's own focal mass is, it's
  // almost always somewhere near the middle of the frame. Rather than add
  // energy outright (which could bulldoze straight through a genuine
  // background gap sitting near the middle — two separate pieces of content
  // either side of the true center, say), this LOWERS THE BAR a weak-but-real
  // reading has to clear the closer it is to center: content with only
  // modest signal there (a spiral's faint core, a soft convergence point)
  // clears it easily, while true background — raw energy already at or near
  // zero — still clears no positive bar no matter how far the bar drops.
  // The leniency fades out well before the frame edge, so the outer cut
  // stays governed entirely by the content's own real structure: an edge
  // that's curved there stays curved, one that's straight stays straight.
  const fieldCx = (size - 1) / 2, fieldCy = (size - 1) / 2;
  const centerRadius = size * .42;
  const hot = new Uint8Array(n);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const idx = y * size + x;
    const cdx = x - fieldCx, cdy = y - fieldCy;
    const centerDist = Math.sqrt(cdx * cdx + cdy * cdy) / centerRadius;
    const leniency = Math.pow(Math.max(0, 1 - centerDist), 1.6) * .55;
    hot[idx] = energyField[idx] >= threshold * (1 - leniency) ? 1 : 0;
  }
  // A soft gradient rim (or FX dithering that happens to thin out at a few
  // points) can leave pinhole gaps in an otherwise-real boundary — a small
  // bridge before the enclosed-hole flood fill keeps those gaps from
  // leaking the fill straight through into a genuine interior.
  const bridged = erodeBinary(dilateBinary(hot, size, 2), size, 2);
  const closed = fillEnclosedHoles(bridged, size);
  const closedF = new Float32Array(n);
  for (let idx = 0; idx < n; idx++) closedF[idx] = closed[idx];
  // A small blur turns the fill's blocky boundary into an organic,
  // antialiased edge — this (not the raw energy value) is what
  // renderOrganicStickerFrame's soft-threshold band actually reads.
  const filled = boxBlurFloat(closedF, size, 2);

  // Bounding box — independently on all four sides, exactly as asymmetric
  // as the content actually is. This is the "sprawls left, barely right"
  // requirement: nothing here assumes or restores symmetry. Reads the
  // CLOSED/filled mask, not the raw threshold crossing, so the box reaches
  // as far as the subject's real, filled-in extent — not wherever its
  // edge/chroma signal happened to be strong enough on its own.
  let left = size, right = -1, top = size, bottom = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (filled[y * size + x] >= .5) {
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

  // Temporally blend the box itself the same way the field does above:
  // `previous` undefined (the caller's deliberate signal that the mosh
  // stack itself just changed) snaps the frame to the new content
  // immediately; otherwise the box stays high-weighted and mostly
  // jaggedness-insensitive, so a busy, edge-rich stack (spirals, swirls)
  // resizes/repositions gradually while the audio moves it, rather than
  // jittering frame to frame the way a steep jaggedness-driven weight did.
  const boxWeight = previous ? clamp01(.9 - jaggedness * .12) : 0;
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
    // field is the closed+blurred render-ready mask, already normalized to
    // a 0..1 fill fraction — .5 is its natural cut, not the adaptive
    // energy threshold above (that one only ever drove the close's input).
    field: filled, threshold: .5, rawField: energyField,
    jaggedness, flowX, flowY,
    phase: (previous?.phase ?? 0) + .31,
  };
}

type OrganicComponent = {
  indices: number[];
  area: number;
  energy: number;
  cx: number;
  cy: number;
  score: number;
};

/** Split a render-ready organic field into independently meaningful visual
 * elements. This is the model-free half of Sticker Studio's layer awareness:
 * disconnected foreground regions remain independently selectable instead of
 * being flattened into one rectangular crop. */
function organicComponents(focus: OrganicFocus): OrganicComponent[] {
  const size = FIELD_SIZE;
  const visited = new Uint8Array(size * size);
  const components: OrganicComponent[] = [];
  const minArea = Math.max(8, Math.round(size * size * .003));

  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || focus.field[start] < .42) continue;
    const stack = [start];
    visited[start] = 1;
    const indices: number[] = [];
    let sx = 0, sy = 0, energy = 0;
    while (stack.length) {
      const index = stack.pop() as number;
      indices.push(index);
      const x = index % size, y = (index / size) | 0;
      sx += x; sy += y; energy += focus.field[index];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
        const next = yy * size + xx;
        if (!visited[next] && focus.field[next] >= .42) { visited[next] = 1; stack.push(next); }
      }
    }
    if (indices.length < minArea) continue;
    const cx = sx / indices.length / size, cy = sy / indices.length / size;
    const center = 1 - Math.min(1, Math.hypot(cx - .5, cy - .5) / .71);
    const area = indices.length / (size * size);
    const meanEnergy = energy / indices.length;
    const usefulArea = Math.min(1, area / .18) * (1 - Math.max(0, area - .72) / .28);
    components.push({
      indices,
      area,
      energy: meanEnergy,
      cx,
      cy,
      score: meanEnergy * .48 + usefulArea * .34 + center * .18,
    });
  }
  return components.sort((a, b) => b.score - a.score);
}

function focusFromOrganicComponents(base: OrganicFocus, chosen: OrganicComponent[]): OrganicFocus {
  if (!chosen.length) return base;
  const selected = new Float32Array(FIELD_SIZE * FIELD_SIZE);
  for (const component of chosen) {
    for (const index of component.indices) selected[index] = Math.max(selected[index], base.field[index]);
  }
  const softened = boxBlurFloat(selected, FIELD_SIZE, 1);
  let left = FIELD_SIZE, right = -1, top = FIELD_SIZE, bottom = -1;
  for (let y = 0; y < FIELD_SIZE; y++) for (let x = 0; x < FIELD_SIZE; x++) {
    if (softened[y * FIELD_SIZE + x] < .2) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left || bottom < top) return base;
  const pad = 2;
  return {
    ...base,
    left: clamp01((left - pad) / FIELD_SIZE),
    right: clamp01((right + pad + 1) / FIELD_SIZE),
    top: clamp01((top - pad) / FIELD_SIZE),
    bottom: clamp01((bottom + pad + 1) / FIELD_SIZE),
    field: softened,
    threshold: .42,
  };
}

/** Choose one focal element, a small ensemble of related elements, or the
 * element nearest the user's tap. When the source reads as one continuous
 * subject the original focus is returned unchanged. */
export function isolateOrganicFocus(
  base: OrganicFocus,
  mode: OrganicIsolationMode,
  point?: { x: number; y: number } | null,
): OrganicFocus {
  const components = organicComponents(base);
  if (components.length <= 1) return base;
  if (mode === "layers") return focusFromOrganicComponents(base, components.slice(0, 3));
  if (mode === "tap" && point) {
    const nearest = [...components].sort((a, b) =>
      Math.hypot(a.cx - point.x, a.cy - point.y) - Math.hypot(b.cx - point.x, b.cy - point.y)
    )[0];
    return focusFromOrganicComponents(base, nearest ? [nearest] : components.slice(0, 1));
  }
  return focusFromOrganicComponents(base, components.slice(0, 1));
}

/** The common shape both the synthesized organic focus and a genuine-alpha
 *  bounding box share — everything downstream that only needs the box
 *  (frame sizing, cropping) can work against either. */
export type ContentBox = { left: number; right: number; top: number; bottom: number };

/**
 * Output canvas dimensions for a capture — the content's own bounding box
 * aspect ratio, scaled to fit within maxDimension on its longer side.
 * Never forced back to the source's own aspect: a tall, thin shape gets a
 * tall, thin frame; a shape that's nearly square gets a square one. This is
 * the "doesn't always have to be landscape" behavior — the frame itself is
 * content-shaped, not just the alpha drawn inside a fixed landscape canvas.
 */
export function contentFrameSize(focus: ContentBox, maxDimension: number): { width: number; height: number } {
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

/**
 * Real, per-pixel bounding box of wherever the source's own alpha channel is
 * already non-transparent — the OPPOSITE job of analyzeOrganicFocus above.
 * That function INVENTS a cutout from otherwise-opaque content (edge
 * strength + chroma range standing in for "this is the subject"); this one
 * trusts a source that already carries genuine transparency (an uploaded
 * transparent PNG, now flowing through the full MOSH FX pipeline, which
 * every effects.ts shader reshapes and carries end-to-end) and only trims
 * away the dead fully-transparent padding around it. Nothing here reads
 * color, edges or chroma — alpha is the only signal, because alpha is the
 * only thing that's real here.
 */
export function analyzeRealAlphaBounds(source: HTMLCanvasElement, previous?: ContentBox): ContentBox {
  const size = FIELD_SIZE;
  const fallback: ContentBox = { left: 0, right: 1, top: 0, bottom: 1 };
  if (source.width < 1 || source.height < 1) return previous ?? fallback;
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return previous ?? fallback;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;

  // A few counts of alpha above zero is rounding/dither noise, not real
  // content — 10/255 (~4%) is a real signal without being so high it clips
  // a genuinely soft, low-opacity edge (a glow, a fade-out trail).
  const alphaFloor = 10;
  let left = size, right = -1, top = size, bottom = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (data[(y * size + x) * 4 + 3] > alphaFloor) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const hasContent = right >= left && bottom >= top;
  const pad = 1.5;
  let boxLeft = hasContent ? clamp01((left - pad) / size) : fallback.left;
  let boxRight = hasContent ? clamp01((right + pad) / size) : fallback.right;
  let boxTop = hasContent ? clamp01((top - pad) / size) : fallback.top;
  let boxBottom = hasContent ? clamp01((bottom + pad) / size) : fallback.bottom;
  if (boxRight - boxLeft < .08) { const c = (boxLeft + boxRight) / 2; boxLeft = clamp01(c - .04); boxRight = clamp01(c + .04); }
  if (boxBottom - boxTop < .08) { const c = (boxTop + boxBottom) / 2; boxTop = clamp01(c - .04); boxBottom = clamp01(c + .04); }

  // Light temporal smoothing only — FX like displacement/warp shift real
  // content within the frame continuously, so the crop window shouldn't
  // chase every single-frame read, but it also shouldn't lag so far behind
  // that a genuinely growing/shrinking shape gets clipped.
  const boxWeight = previous ? .5 : 0;
  return {
    left: previous ? lerp(boxLeft, previous.left, boxWeight) : boxLeft,
    right: previous ? lerp(boxRight, previous.right, boxWeight) : boxRight,
    top: previous ? lerp(boxTop, previous.top, boxWeight) : boxTop,
    bottom: previous ? lerp(boxBottom, previous.bottom, boxWeight) : boxBottom,
  };
}

/**
 * Crop `source` to `box` and hand back its pixels completely untouched — no
 * synthetic mask, no feather, no rim, no idle jitter. The source's own real
 * alpha channel (genuinely carried and reshaped end-to-end by every FX
 * shader — see the effects.ts alpha audit) is the entire story; this
 * function's only job is trimming dead transparent padding, never inventing
 * or subtracting shape.
 */
export function renderRealAlphaFrame(source: HTMLCanvasElement, box: ContentBox, width: number, height: number): ImageData {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Transparent source canvas unavailable");
  ctx.clearRect(0, 0, width, height);
  const boxW = Math.max(.001, box.right - box.left);
  const boxH = Math.max(.001, box.bottom - box.top);
  if (source.width > 0 && source.height > 0) {
    const sx = box.left * source.width, sy = box.top * source.height;
    const sw = Math.max(1, boxW * source.width), sh = Math.max(1, boxH * source.height);
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  }
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Does `source` already carry genuine per-pixel transparency? Sampled at a
 * cheap fixed size purely to decide whether to nudge the user that a
 * "transparent PNG" they just dropped in is actually fully opaque — FX will
 * still apply either way, but there's nothing for the real-alpha export
 * path to preserve.
 */
export function sourceHasTransparency(source: CanvasImageSource, width = 64, height = 64): boolean {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return true;
  return false;
}

export type LottieStickerBackground = "black" | "white";

/**
 * Paint the shared "living background" (a slow drifting gradient, purely a
 * preview aid so transparency reads clearly against contrast — never part
 * of an export) and composite `frame` over it. Takes an already-rendered
 * frame rather than a source+focus pair so either capture path — the
 * synthesized organic mask or the genuine-alpha crop — can share one
 * preview renderer.
 */
export function drawLottieStickerPreview(ctx: CanvasRenderingContext2D, frame: ImageData, background: LottieStickerBackground, time: number) {
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
  const work = document.createElement("canvas"); work.width = width; work.height = height;
  work.getContext("2d")?.putImageData(frame, 0, 0);
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
