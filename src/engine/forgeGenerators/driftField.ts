/**
 * Drift Field — the gradient+blob field Forge already had, folded into the
 * generator roster unchanged as one voice among several. drawSeamless is
 * already a pure function of (seed, t), so the gradient itself carries no
 * persistent state of its own.
 *
 * Some instances (rolled once per seed) additionally overlay a warping
 * wireframe mesh — a set of near-diagonal lines whose path bends through a
 * noise field rather than running straight, on top of the hue gradient.
 * That mesh-over-gradient combination is its own distinct look from the
 * plain soft gradient underneath, so it isn't gated behind intensity or
 * audio — it's a coin flip at creation, same as Shatter Field's glow/
 * directional variants, so both flavors show up in normal rotation.
 */
import { drawSeamless } from "../seamlessSource";
import { defineGenerator, type ForgeGeneratorCtx } from "../forgeGenerators";
import { fbm2, hashSeedToInt } from "../forgeNoise";
import { hexToRgb } from "../seamlessSource";
import { rngFromSeed } from "../seed";

export type DriftFieldState = {
  seedNum: number;
  mesh: boolean;
  meshAngle: number;
};

function createState(seed: string): DriftFieldState {
  const rand = rngFromSeed(seed);
  return {
    seedNum: hashSeedToInt(seed),
    mesh: rand() < 0.45,
    meshAngle: (Math.PI / 8) + rand() * (Math.PI / 3), // shallow-to-steep diagonal, never flat/vertical
  };
}

function drawMesh(gctx: ForgeGeneratorCtx, s: DriftFieldState) {
  const { ctx, w, h, t, palette, audio } = gctx;
  const accent = hexToRgb(palette[2]);
  const lineCount = 12 + Math.round(audio.density * 4);
  const warpAmp = h * (0.09 + audio.treble * 0.07);
  const drift = t * (0.08 + audio.energy * 0.1);
  const tanA = Math.tan(s.meshAngle);
  const span = w + h * 2;

  ctx.save();
  // "screen" so the gradient underneath still shows through the lines —
  // this is meant to read as a mesh laid over the field, not a mask on it.
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(${Math.min(255, accent[0] * 1.5)}, ${Math.min(255, accent[1] * 1.5)}, ${Math.min(255, accent[2] * 1.5)}, 0.5)`;
  ctx.lineWidth = Math.max(1, w * 0.0035);
  ctx.lineCap = "round";

  const step = Math.max(4, Math.round(w / 90));
  for (let i = 0; i < lineCount; i++) {
    const offset = (i / lineCount) * span - h;
    ctx.beginPath();
    let started = false;
    for (let x = -h; x <= w + h; x += step) {
      const baseY = x * tanA + offset;
      const n = fbm2(x * 0.012 + drift, i * 0.6, s.seedNum, 3);
      const y = baseY + (n - 0.5) * warpAmp;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export const DRIFT_FIELD = defineGenerator<DriftFieldState>({
  id: "driftField",
  name: "Drift Field",
  category: "field",
  blurb: "Slowly shifting gradient waves, sometimes overlaid with a warping wireframe mesh.",
  costTier: "cheap",
  kind: "canvas2d",
  createState,
  render: (gctx, state) => {
    const s = state as DriftFieldState;
    drawSeamless(gctx.ctx, gctx.w, gctx.h, {
      colors: gctx.palette,
      seed: gctx.seed,
      t: gctx.t,
      complexity: Math.min(6, 2 + Math.round(gctx.intensity * 4 + gctx.audio.treble * 2)),
    });
    if (s.mesh) drawMesh(gctx, s);
  },
});
