import { describe, expect, it } from "vitest";
import { SEAM_PASS, seamPasses, seamScore, tileSafeEffects, tileVerdict } from "./tileSafety";
import { composeForgeStack, explainPool } from "./forgeCompose";
import { EFFECTS, EFFECTS_BY_ID } from "./effects";

function seeded(s0: number) {
  let s = s0 >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Build an RGBA buffer from a function of (x,y). */
function make(w: number, h: number, f: (x: number, y: number) => [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = f(x, y);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
}

describe("seam measurement", () => {
  it("scores a genuinely periodic field as seamless", () => {
    const w = 64, h = 64;
    const d = make(w, h, (x, y) => {
      const v = 128 + 127 * Math.sin((x / w) * Math.PI * 2) * Math.cos((y / h) * Math.PI * 2);
      return [v, v, v];
    });
    const s = seamScore(d, w, h);
    expect(s.worst).toBeGreaterThan(SEAM_PASS);
    expect(seamPasses(s)).toBe(true);
  });

  it("catches a linear gradient, which can never tile", () => {
    // This is exactly what Forge used to draw: bright at one edge, dark at the
    // other, so the seam is the full dynamic range of the image.
    const w = 64, h = 64;
    const d = make(w, h, (x) => { const v = (x / w) * 255; return [v, v, v]; });
    const s = seamScore(d, w, h);
    expect(s.horizontal).toBeLessThan(0.2);
    expect(seamPasses(s)).toBe(false);
  });

  it("distinguishes a horizontal seam from a vertical one", () => {
    const w = 64, h = 64;
    const d = make(w, h, (_x, y) => { const v = (y / h) * 255; return [v, v, v]; });
    const s = seamScore(d, w, h);
    expect(s.horizontal).toBeGreaterThan(SEAM_PASS); // left/right match
    expect(s.vertical).toBeLessThan(0.2);            // top/bottom do not
  });

  it("tolerates the small noise real encoding introduces", () => {
    const w = 64, h = 64;
    const d = make(w, h, () => [128, 128, 128]);
    d[0] = 132; d[1] = 125; // a couple of stray pixels
    expect(seamPasses(seamScore(d, w, h))).toBe(true);
  });

  it("refuses to score a degenerate buffer rather than guessing", () => {
    expect(seamScore(new Uint8ClampedArray(4), 1, 1).worst).toBe(0);
  });
});

describe("tile safety classification", () => {
  it("rejects effects that read camera-derived data", () => {
    // Depth, flow and history describe a live camera; against a generated
    // source they carry no meaning and no periodicity.
    for (const id of ["depthShear", "flowSmear", "timeShatter", "trailDecay"]) {
      const v = tileVerdict(id);
      expect(v.safe, id).toBe(false);
      expect(["camera", "clamped", "radial"]).toContain(v.reason);
    }
  });

  it("rejects centre-relative effects, which give every tile a middle", () => {
    for (const id of ["vignette", "parallaxExplode", "mandalaBloom"]) {
      expect(tileVerdict(id).safe, id).toBe(false);
    }
  });

  it("reports an unknown effect rather than defaulting to safe", () => {
    // The bug this whole module was written next to: a bad id silently doing
    // nothing. Defaulting an unknown id to "safe" would repeat it.
    expect(tileVerdict("plasmafield")).toEqual({ safe: false, reason: "unknown-effect" });
    expect(tileVerdict("").safe).toBe(false);
  });

  it("still leaves a usefully large pool", () => {
    // If the rules were too strict the generator would have nothing to shuffle.
    const safe = tileSafeEffects();
    expect(safe.length).toBeGreaterThan(15);
    expect(safe.length).toBeLessThan(EFFECTS.length);
  });

  it("only ever returns real effect ids", () => {
    for (const id of tileSafeEffects()) expect(EFFECTS_BY_ID[id], id).toBeDefined();
  });

  it("explains every rejection", () => {
    const { safe, rejected } = explainPool();
    expect(safe.length + rejected.length).toBe(EFFECTS.length);
    for (const r of rejected) expect(r.reason).toBeTruthy();
  });
});

describe("forge composition", () => {
  it("only emits effects that actually exist", () => {
    // The original bug, guarded directly.
    for (let i = 1; i <= 200; i++) {
      for (const l of composeForgeStack({ rand: seeded(i), seamless: true })) {
        expect(EFFECTS_BY_ID[l.effectId], l.effectId).toBeDefined();
      }
    }
  });

  it("only emits tile-safe effects in seamless mode", () => {
    for (let i = 1; i <= 200; i++) {
      for (const l of composeForgeStack({ rand: seeded(i), seamless: true })) {
        expect(tileVerdict(l.effectId).safe, l.effectId).toBe(true);
      }
    }
  });

  it("keeps every param inside its declared range", () => {
    for (let i = 1; i <= 200; i++) {
      for (const l of composeForgeStack({ rand: seeded(i), seamless: false, intensity: 1 })) {
        const def = EFFECTS_BY_ID[l.effectId];
        for (const p of def.params) {
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeGreaterThanOrEqual(p.min);
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeLessThanOrEqual(p.max);
        }
      }
    }
  });

  it("supplies a value for every param the shader declares", () => {
    // A missing param falls back to a uniform default that may not match the
    // rest of the stack, which is invisible until the output looks wrong.
    for (let i = 1; i <= 100; i++) {
      for (const l of composeForgeStack({ rand: seeded(i), seamless: false })) {
        const def = EFFECTS_BY_ID[l.effectId];
        for (const p of def.params) expect(l.params).toHaveProperty(p.key);
      }
    }
  });

  it("never repeats an effect within one stack", () => {
    for (let i = 1; i <= 200; i++) {
      const ids = composeForgeStack({ rand: seeded(i), seamless: true, intensity: 1 }).map(l => l.effectId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("composites the base layer normally", () => {
    for (let i = 1; i <= 100; i++) {
      const stack = composeForgeStack({ rand: seeded(i), seamless: true });
      if (!stack.length) continue;
      expect(stack[0].blend).toBe("normal");
      expect(stack[0].opacity).toBe(1);
    }
  });

  it("reaches a wide slice of the pool across many shuffles", () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 300; i++) {
      for (const l of composeForgeStack({ rand: seeded(i), seamless: true })) seen.add(l.effectId);
    }
    // The old pool was 8 ids, 6 of them broken. Anything near that is a
    // regression to the thing this replaced.
    expect(seen.size).toBeGreaterThan(15);
  });

  it("scales layer count with intensity", () => {
    const avg = (inten: number) => {
      let n = 0;
      for (let i = 1; i <= 200; i++) n += composeForgeStack({ rand: seeded(i), seamless: true, intensity: inten }).length;
      return n / 200;
    };
    expect(avg(1)).toBeGreaterThan(avg(0));
  });
});
