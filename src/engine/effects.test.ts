import { describe, expect, it } from "vitest";
import { EFFECTS, EFFECTS_BY_ID } from "./effects";
import { axisTargets } from "./quadrants";

/** The effects written for the quadrant instrument. */
const EXPANSION_SET = [
  "halftone", "crossHatch", "kuwahara", "anaglyph", "photocopy", "contourMap",
  "emboss", "spinBlur", "moire", "slitScan", "rollingShutter", "echoTrails",
  "caustics", "anamorphic",
];

const SIGNATURE_SET = [
  "drosteTunnel",
  "shockwave",
  "liquidChrome",
  "voronoiShatter",
  "prismDispersion",
  "neonContour",
  "inkFlow",
  "filmicTone",
  ...EXPANSION_SET,
];

describe("effect registry", () => {
  it("holds 80 effects", () => {
    expect(EFFECTS.length).toBe(80);
  });

  it("has no duplicate ids", () => {
    const ids = EFFECTS.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares every param uniform its shader body references", () => {
    for (const def of EFFECTS) {
      for (const p of def.params) {
        const uniform = `u${p.key[0].toUpperCase()}${p.key.slice(1)}`;
        expect(def.frag, `${def.id} missing ${uniform}`).toContain(`uniform float ${uniform};`);
      }
    }
  });

  it("keeps every default inside its declared range", () => {
    for (const def of EFFECTS) {
      for (const p of def.params) {
        expect(p.default, `${def.id}.${p.key}`).toBeGreaterThanOrEqual(p.min);
        expect(p.default, `${def.id}.${p.key}`).toBeLessThanOrEqual(p.max);
      }
    }
  });
});

describe("quadrant XY-pad contract (signature set)", () => {
  it.each(SIGNATURE_SET)("%s is registered", (id) => {
    expect(EFFECTS_BY_ID[id]).toBeDefined();
  });

  it.each(SIGNATURE_SET)("%s exposes exactly two params", (id) => {
    // X binds params[0] and Y binds params[1]. A third param is unreachable
    // by gesture; a single one pushes Y onto layer opacity instead.
    expect(EFFECTS_BY_ID[id].params).toHaveLength(2);
  });

  it.each(SIGNATURE_SET)("%s has no stepped param", (id) => {
    // Stepped params visibly snap while a finger is dragging.
    for (const p of EFFECTS_BY_ID[id].params) {
      expect(p.step, `${id}.${p.key} is stepped`).toBeUndefined();
    }
  });

  it.each(SIGNATURE_SET)("%s maps both axes to real params", (id) => {
    const t = axisTargets(id);
    expect(t).not.toBeNull();
    expect(t!.x.key).not.toBeNull();
    expect(t!.y.key).not.toBeNull();
  });

  it.each(SIGNATURE_SET)("%s gives each axis a non-degenerate range", (id) => {
    for (const p of EFFECTS_BY_ID[id].params) {
      expect(p.max, `${id}.${p.key}`).toBeGreaterThan(p.min);
    }
  });

  it("never sweeps a full 2*PI rotation on an axis", () => {
    // A 0..2PI angle is a dead axis: both ends are the same direction, so a
    // full drag lands exactly where it started. Prism Dispersion shipped this
    // bug once; this guards the whole signature set against it.
    for (const id of SIGNATURE_SET) {
      for (const p of EFFECTS_BY_ID[id].params) {
        const span = p.max - p.min;
        expect(Math.abs(span - Math.PI * 2), `${id}.${p.key} spans a full turn`)
          .toBeGreaterThan(0.01);
      }
    }
  });
});

describe("pulse reactivity", () => {
  const usesPulse = (id: string) => {
    const frag = EFFECTS_BY_ID[id].frag;
    // The shared header *declares* uPulse for every effect, so only usage
    // inside main() counts.
    return /\buPulse\b/.test(frag.slice(frag.indexOf("void main(){")));
  };

  it("wires several signature effects to the gesture/audio pulse", () => {
    const reactive = SIGNATURE_SET.filter(usesPulse);
    expect(reactive.length).toBeGreaterThanOrEqual(3);
  });

  it.each(["shockwave", "liquidChrome", "neonContour"])("%s reacts to uPulse", (id) => {
    expect(usesPulse(id)).toBe(true);
  });
});

describe("effect strength", () => {
  /**
   * Params whose maximum switches the effect OFF.
   *
   * bloom, pixelSort and vignette all shipped with a threshold or size whose
   * top value gated the effect out entirely — dragging the pad's Y axis up made
   * them vanish. These ranges are the fix; widening them again reintroduces it.
   */
  it("keeps gating params below the value that disables the effect", () => {
    const caps: Record<string, { key: string; max: number }> = {
      bloom:     { key: "threshold", max: 0.8 },
      pixelSort: { key: "threshold", max: 0.85 },
      vignette:  { key: "size", max: 0.95 },
    };
    for (const [id, cap] of Object.entries(caps)) {
      const p = EFFECTS_BY_ID[id].params.find(x => x.key === cap.key);
      expect(p, `${id}.${cap.key}`).toBeDefined();
      expect(p!.max, `${id}.${cap.key} max`).toBeLessThanOrEqual(cap.max);
    }
  });

  it("never sweeps a full 2*PI rotation on any effect's axis", () => {
    // rgbShift and frameSmear both carried this: 0 and 2*PI are the same
    // direction, so a full drag landed exactly where it started.
    for (const def of EFFECTS) {
      for (const p of def.params) {
        expect(Math.abs((p.max - p.min) - Math.PI * 2), `${def.id}.${p.key}`)
          .toBeGreaterThan(0.01);
      }
    }
  });
});
