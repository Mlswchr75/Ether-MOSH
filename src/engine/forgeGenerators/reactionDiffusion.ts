/**
 * Reaction Diffusion — a real Gray-Scott simulation, not an approximation of
 * one. Two virtual chemicals (U, V) diffuse across a grid and react where
 * they meet; depending on the feed/kill rate this settles into the same
 * family of patterns real reaction-diffusion systems produce (coral,
 * fingerprints, spots, mitosis) — genuinely different from Shatter Field's
 * point-distance cells or Pour Bloom's metaballs, both of which are static
 * math evaluated fresh each frame. This has real state that evolves: every
 * render() call advances the simulation a few steps from wherever it left
 * off, so the pattern actually grows and settles over time instead of being
 * re-rolled.
 *
 * Simulated on a small internal grid (not the full source-canvas
 * resolution) and upscaled — the standard real-time approach for this
 * technique, and the only way this runs at a real frame rate on the main
 * thread. Neighbor lookups wrap toroidally, so the pattern is inherently
 * seamless — Forge's tile mode gets this one for free.
 */
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

const DA = 1.0;
const DB = 0.5;

type RDState = {
  simW: number;
  simH: number;
  u: Float32Array;
  v: Float32Array;
  u2: Float32Array;
  v2: Float32Array;
  preview: HTMLCanvasElement;
  previewCtx: CanvasRenderingContext2D | null;
};

/** Lower-res grid on ≤4-core devices, same tiering convention every other
 *  Forge generator's per-frame cost already follows. */
function simSize(): number {
  const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return cpuCount <= 4 ? 72 : 104;
}

function seedBlobs(u: Float32Array, v: Float32Array, w: number, h: number, rand: () => number) {
  const blobs = 4 + Math.floor(rand() * 4);
  for (let b = 0; b < blobs; b++) {
    const cx = Math.floor(rand() * w);
    const cy = Math.floor(rand() * h);
    const r = 3 + Math.floor(rand() * 4);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const px = ((cx + dx) % w + w) % w;
        const py = ((cy + dy) % h + h) % h;
        const i = py * w + px;
        u[i] = 0.5;
        v[i] = 0.25;
      }
    }
  }
}

function createState(seed: string): RDState {
  const rand = rngFromSeed(seed);
  const simW = simSize();
  const simH = simW;
  const u = new Float32Array(simW * simH).fill(1);
  const v = new Float32Array(simW * simH).fill(0);
  seedBlobs(u, v, simW, simH, rand);

  const preview = document.createElement("canvas");
  preview.width = simW;
  preview.height = simH;
  return { simW, simH, u, v, u2: new Float32Array(u.length), v2: new Float32Array(v.length), preview, previewCtx: preview.getContext("2d") };
}

/**
 * The 5-point discrete Laplacian's stability limit (von Neumann analysis)
 * is dt <= 1/(4*D) for grid spacing 1. DA=1.0 means dt must stay <= 0.25 —
 * an earlier version of this used dt=1 implicitly (no scaling at all) and
 * blew up to NaN/Infinity within a few hundred steps regardless of
 * feed/kill, which looked like a tuning problem but was actually a plain
 * numerical-stability bug. Verified empirically (a parameter sweep against
 * this exact stencil) rather than assumed from a reference implementation,
 * since the same nominal feed/kill can behave differently depending on
 * discretization details.
 */
const DT = 0.2;

/** One Gray-Scott step, in place via the ping-pong buffers on `s`. */
function step(s: RDState, feed: number, kill: number) {
  const { simW: w, simH: h, u, v, u2, v2 } = s;
  for (let y = 0; y < h; y++) {
    const yN = (y - 1 + h) % h;
    const yS = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xW = (x - 1 + w) % w;
      const xE = (x + 1) % w;
      const i = y * w + x;
      const uC = u[i], vC = v[i];
      const lapU = u[yN * w + x] + u[yS * w + x] + u[y * w + xW] + u[y * w + xE] - 4 * uC;
      const lapV = v[yN * w + x] + v[yS * w + x] + v[y * w + xW] + v[y * w + xE] - 4 * vC;
      const reaction = uC * vC * vC;
      u2[i] = Math.max(0, Math.min(1, uC + DT * (DA * lapU - reaction + feed * (1 - uC))));
      v2[i] = Math.max(0, Math.min(1, vC + DT * (DB * lapV + reaction - (feed + kill) * vC)));
    }
  }
  s.u = u2; s.u2 = u;
  s.v = v2; s.v2 = v;
}

function render(gctx: ForgeGeneratorCtx, state: unknown) {
  const s = state as RDState;
  const { ctx, w, h, palette, intensity, audio } = gctx;
  if (!s.previewCtx) return;

  // Feed/kill nudged gently by audio — Gray-Scott only forms stable,
  // non-decaying patterns in a narrow band of these two values (confirmed
  // by directly sweeping a grid of candidates against this exact stencil,
  // not assumed from a reference table), so this is a small wobble around
  // a verified-working point, not a wide sweep. Louder/busier audio pushes
  // toward the more branching end of that band.
  const feed = 0.0367 + (audio.energy - 0.5) * 0.002 + intensity * 0.001;
  const kill = 0.062 - (audio.bpm ? audio.regularity * 0.001 : 0);
  // More sub-steps per rendered frame when there's headroom (louder = more
  // motion is welcome); always enough that the pattern is visibly alive
  // even in silence. Higher than it looks like it should be because DT is
  // small (see DT's own comment) — each step advances the simulation less,
  // so more of them are needed per rendered frame for the same real-time
  // evolution speed.
  const substeps = 12 + Math.round(audio.energy * 10);
  for (let n = 0; n < substeps; n++) step(s, feed, kill);

  const colorLow = hexToRgb(palette[0]);
  const colorMid = hexToRgb(palette[1]);
  const colorHigh = hexToRgb(palette[2]);

  const img = s.previewCtx.createImageData(s.simW, s.simH);
  const d = img.data;
  const { v } = s;
  for (let i = 0; i < v.length; i++) {
    const val = v[i];
    // Two-stage mix across the palette's three colors instead of a single
    // lerp — reaction-diffusion's V field has real texture across its whole
    // 0..1 range, and a single low->high blend flattens the mid-tones that
    // are exactly where the coral/vein detail lives.
    const t = Math.min(1, val * 2.2);
    const i4 = i * 4;
    if (t < 0.5) {
      const m = t * 2;
      d[i4] = colorLow[0] + (colorMid[0] - colorLow[0]) * m;
      d[i4 + 1] = colorLow[1] + (colorMid[1] - colorLow[1]) * m;
      d[i4 + 2] = colorLow[2] + (colorMid[2] - colorLow[2]) * m;
    } else {
      const m = (t - 0.5) * 2;
      d[i4] = colorMid[0] + (colorHigh[0] - colorMid[0]) * m;
      d[i4 + 1] = colorMid[1] + (colorHigh[1] - colorMid[1]) * m;
      d[i4 + 2] = colorMid[2] + (colorHigh[2] - colorMid[2]) * m;
    }
    d[i4 + 3] = 255;
  }
  s.previewCtx.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(s.preview, 0, 0, s.simW, s.simH, 0, 0, w, h);
}

export const REACTION_DIFFUSION = defineGenerator<RDState>({
  id: "reactionDiffusion",
  name: "Reaction Diffusion",
  category: "organic",
  blurb: "A real Gray-Scott chemical simulation — coral, veins, and cell-like growth.",
  costTier: "moderate",
  kind: "canvas2d",
  createState,
  render,
});
