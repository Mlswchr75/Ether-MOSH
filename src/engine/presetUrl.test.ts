import { describe, expect, it } from "vitest";
import { decodePreset, encodePreset, presetFromUrl, presetToUrl, type PresetPayload } from "./presetUrl";
import { EFFECTS, EFFECTS_BY_ID } from "./effects";
import type { Layer } from "@/store/types";

/**
 * A shared link is a promise. These guard the two properties that make it one:
 * a link round-trips to the same look, and a malformed or stale link degrades
 * instead of crashing the app it was opened in.
 */

function layerOf(effectId: string, over: Partial<Layer> = {}): Layer {
  const def = EFFECTS_BY_ID[effectId];
  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = p.default;
  return {
    id: "x",
    effectId,
    hidden: false,
    locked: false,
    opacity: 0.8,
    blend: "normal",
    params,
    mods: Object.fromEntries(def.params.map(p => [p.key, null])),
    audioMaps: Object.fromEntries(def.params.map(p => [p.key, null])),
    ...over,
  };
}

function legacyWire(layers: Array<{ e: string; o: number; b: number }>): string {
  return btoa(JSON.stringify({ v: 1, l: layers }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodedWire(encoded: string): Record<string, unknown> {
  const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/") + "==");
  return JSON.parse(json) as Record<string, unknown>;
}

describe("preset url codec", () => {
  it("keeps version one while encoding explicit roles as optional numeric g values", () => {
    const explicit = encodedWire(encodePreset({ layers: [layerOf("bloom", { role: "finish" })] }));
    const legacy = encodedWire(encodePreset({ layers: [layerOf("bloom")] }));

    expect(explicit.v).toBe(1);
    expect((explicit.l as Array<Record<string, unknown>>)[0].g).toBe(3);
    expect((legacy.l as Array<Record<string, unknown>>)[0]).not.toHaveProperty("g");
  });

  it("round-trips explicit semantic roles", () => {
    const encoded = encodePreset({ layers: [layerOf("bloom", { role: "finish" })] });
    expect(decodePreset(encoded)!.layers[0].role).toBe("finish");
  });

  it("infers roles when decoding a version-one link without g", () => {
    const legacy = legacyWire([{ e: "filmicTone", o: 1000, b: 0 }, { e: "bloom", o: 700, b: 1 }]);
    expect(decodePreset(legacy)!.layers.map(layer => layer.role))
      .toEqual(["grade", "finish"]);
  });

  it("round-trips a simple stack", () => {
    const payload: PresetPayload = {
      seed: "abc123",
      intensity: "nuclear",
      lookId: "neonRain",
      layers: [layerOf("rgbShift"), layerOf("bloom", { opacity: 0.42, blend: "screen" })],
    };
    const back = decodePreset(encodePreset(payload))!;
    expect(back).not.toBeNull();
    expect(back.seed).toBe("abc123");
    expect(back.intensity).toBe("nuclear");
    expect(back.lookId).toBe("neonRain");
    expect(back.layers.map(l => l.effectId)).toEqual(["rgbShift", "bloom"]);
    expect(back.layers[1].opacity).toBeCloseTo(0.42, 2);
    expect(back.layers[1].blend).toBe("screen");
  });

  it("preserves every effect in the library through a round trip", () => {
    // Catches an effect whose params cannot survive quantisation — e.g. a
    // stepped param whose step does not divide its range.
    for (const def of EFFECTS) {
      const back = decodePreset(encodePreset({ layers: [layerOf(def.id)] }));
      expect(back, `${def.id} failed to round-trip`).not.toBeNull();
      expect(back!.layers[0].effectId).toBe(def.id);
      for (const p of def.params) {
        const v = back!.layers[0].params[p.key];
        expect(v, `${def.id}.${p.key} out of range`).toBeGreaterThanOrEqual(p.min);
        expect(v, `${def.id}.${p.key} out of range`).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it("keeps param values accurate to within a quantisation step", () => {
    for (const def of EFFECTS.slice(0, 40)) {
      const l = layerOf(def.id);
      // Push params off their defaults so the test is not just checking defaults.
      for (const p of def.params) l.params[p.key] = p.min + (p.max - p.min) * 0.37;
      const back = decodePreset(encodePreset({ layers: [l] }))!;
      for (const p of def.params) {
        if (p.step) continue; // stepped params legitimately snap
        const span = p.max - p.min;
        expect(Math.abs(back.layers[0].params[p.key] - l.params[p.key]))
          .toBeLessThanOrEqual(span / 500);
      }
    }
  });

  it("round-trips regions", () => {
    const l = layerOf("rgbShift", {
      region: { mode: "shards", scale: 12, phase: 0.4, gate: 0.55, feather: 0.08, invert: true },
    });
    const r = decodePreset(encodePreset({ layers: [l] }))!.layers[0].region!;
    expect(r.mode).toBe("shards");
    expect(r.scale).toBeCloseTo(12, 1);
    expect(r.gate).toBeCloseTo(0.55, 2);
    expect(r.invert).toBe(true);
  });

  it("round-trips audio maps and modulators", () => {
    // Audio reactivity is the whole point of a preset for a live or stream use
    // — a link that drops it restores a still image of a moving look.
    const def = EFFECTS_BY_ID["rgbShift"];
    const key = def.params[0].key;
    const l = layerOf("rgbShift", {
      audioMaps: { [key]: { source: "bass", amount: -0.6, smoothing: 0.3 } },
      mods: { [key]: { type: "beat", speed: 2.5, depth: 0.7, offset: -0.25 } },
    });
    const back = decodePreset(encodePreset({ layers: [l] }))!.layers[0];
    expect(back.audioMaps![key]!.source).toBe("bass");
    expect(back.audioMaps![key]!.amount).toBeCloseTo(-0.6, 2);
    expect(back.mods[key]!.type).toBe("beat");
    expect(back.mods[key]!.speed).toBeCloseTo(2.5, 2);
    expect(back.mods[key]!.offset).toBeCloseTo(-0.25, 2);
  });

  it("preserves hidden layers", () => {
    const back = decodePreset(encodePreset({ layers: [layerOf("bloom", { hidden: true })] }))!;
    expect(back.layers[0].hidden).toBe(true);
  });

  it("skips unknown effects instead of failing the whole link", () => {
    // A link shared before an effect was renamed must still open.
    const good = encodePreset({ layers: [layerOf("rgbShift"), layerOf("bloom")] });
    const json = JSON.parse(atob(good.replace(/-/g, "+").replace(/_/g, "/") + "=="));
    json.l[0].e = "someEffectThatWasDeleted";
    const tampered = btoa(JSON.stringify(json)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const back = decodePreset(tampered);
    expect(back).not.toBeNull();
    expect(back!.layers.map(l => l.effectId)).toEqual(["bloom"]);
  });

  it("never throws on malformed input", () => {
    const junk = [
      "", "   ", "!!!!", "not-base64-at-all", "e30", "bnVsbA",
      btoa("{"), btoa("[]"), btoa('{"v":1}'), btoa('{"v":1,"l":"nope"}'),
      "a".repeat(5000),
    ];
    for (const j of junk) {
      expect(() => decodePreset(j)).not.toThrow();
    }
  });

  it("refuses a newer format version rather than half-reading it", () => {
    const future = btoa(JSON.stringify({ v: 99, l: [{ e: "bloom", o: 500, b: 0 }] }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodePreset(future)).toBeNull();
  });

  it("returns null for a preset with no usable layers", () => {
    expect(decodePreset(encodePreset({ layers: [] }))).toBeNull();
  });

  it("stays short enough to be a comfortable URL", () => {
    // Seven layers is the deepest stack the director builds. Well under the
    // ~2000 char limit that browsers and chat clients start truncating at.
    const layers = EFFECTS.slice(0, 7).map(d => layerOf(d.id));
    const encoded = encodePreset({ seed: "seedseed", intensity: "interdimensional", lookId: "riftPlane", layers });
    expect(encoded.length).toBeLessThan(1400);
  });

  it("survives a full URL round trip", () => {
    const payload: PresetPayload = { layers: [layerOf("rgbShift"), layerOf("bloom")], seed: "zz" };
    const url = presetToUrl(payload, "https://ether-mosh.netlify.app/");
    expect(url).toContain("p=");
    const back = presetFromUrl(url)!;
    expect(back.layers.map(l => l.effectId)).toEqual(["rgbShift", "bloom"]);
    expect(back.seed).toBe("zz");
  });

  it("returns null from a URL with no preset on it", () => {
    expect(presetFromUrl("https://ether-mosh.netlify.app/")).toBeNull();
    expect(presetFromUrl("not a url")).toBeNull();
  });

  it("gives decoded layers distinct ids", () => {
    // Reusing an id across layers breaks selection and reordering downstream.
    const back = decodePreset(encodePreset({
      layers: [layerOf("rgbShift"), layerOf("bloom"), layerOf("vignette")],
    }))!;
    expect(new Set(back.layers.map(l => l.id)).size).toBe(3);
  });
});
