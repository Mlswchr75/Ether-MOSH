import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";

/**
 * Disruption is Storm's accidental behaviour made deliberate: alter the
 * arrangement without replacing it. Three things have to hold or it stops being
 * that and becomes another mosh.
 *
 *   IDENTITY  — effect ids and layer ids survive. The eye holds onto structure;
 *               replacing the structure is what the composition clock is for.
 *   HISTORY   — no undo snapshots. These fire ~12 times a second during a
 *               surge, and pushing a snapshot each time is what silently erased
 *               the user's entire undo stack the moment Storm was switched on.
 *   LOCKS     — a locked layer is the user's explicit statement that it stays.
 */

const reset = () => useStore.setState({
  layers: [], selectedLayerId: null, shuffleSec: null,
  past: [], future: [],
  currentLook: null, lastQuadrantRoll: null, quadrantHistory: [[], [], [], []],
});

describe("disrupt", () => {
  beforeEach(() => { reset(); useStore.getState().mosh(); });

  it("keeps the arrangement's identity", () => {
    const before = useStore.getState().layers.map(l => ({ id: l.id, effectId: l.effectId }));
    useStore.getState().disrupt({ kind: "churn", violence: 0.9 });
    const after = useStore.getState().layers.map(l => ({ id: l.id, effectId: l.effectId }));
    expect(after).toEqual(before);
  });

  it("actually moves the parameters", () => {
    const before = JSON.stringify(useStore.getState().layers.map(l => l.params));
    useStore.getState().disrupt({ kind: "churn", violence: 0.9 });
    expect(JSON.stringify(useStore.getState().layers.map(l => l.params))).not.toBe(before);
  });

  it("never pushes params outside the shader's declared range", () => {
    // Out-of-range values don't throw — the shader just misbehaves silently,
    // which is the worst kind of wrong.
    for (let i = 0; i < 40; i++) {
      useStore.getState().disrupt({ kind: "churn", violence: 1 });
      for (const l of useStore.getState().layers) {
        for (const p of EFFECTS_BY_ID[l.effectId].params) {
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeGreaterThanOrEqual(p.min);
          expect(l.params[p.key], `${l.effectId}.${p.key}`).toBeLessThanOrEqual(p.max);
        }
      }
    }
  });

  it("does not touch undo history, however often it fires", () => {
    const past = useStore.getState().past.length;
    for (let i = 0; i < 200; i++) useStore.getState().disrupt({ kind: "churn", violence: 0.7 });
    expect(useStore.getState().past.length).toBe(past);
  });

  it("leaves locked layers alone", () => {
    const first = useStore.getState().layers[0];
    useStore.setState({
      layers: useStore.getState().layers.map((l, i) => i === 0 ? { ...l, locked: true } : l),
    });
    const before = JSON.stringify({ ...first, locked: true });
    useStore.getState().disrupt({ kind: "churn", violence: 1 });
    expect(JSON.stringify(useStore.getState().layers[0])).toBe(before);
  });

  it("keeps the base layer compositing normally when flipping blends", () => {
    // An exotic blend at the bottom has nothing underneath to blend with.
    const base = useStore.getState().layers[0].blend;
    useStore.getState().disrupt({ kind: "blend" });
    expect(useStore.getState().layers[0].blend).toBe(base);
  });

  it("swaps exactly one layer, not the whole stack", () => {
    const before = useStore.getState().layers.map(l => l.effectId);
    if (before.length < 2) return; // nothing to prove with a single layer
    useStore.getState().disrupt({ kind: "swap", violence: 0.5, effectId: "hueRotate" });
    const after = useStore.getState().layers.map(l => l.effectId);
    const changed = after.filter((id, i) => id !== before[i]);
    expect(changed.length).toBeLessThanOrEqual(1);
  });

  it("ignores a swap naming an effect that does not exist", () => {
    const before = useStore.getState().layers.map(l => l.effectId);
    useStore.getState().disrupt({ kind: "swap", effectId: "notAnEffect" });
    expect(useStore.getState().layers.map(l => l.effectId)).toEqual(before);
  });

  it("does nothing gracefully when there is nothing on screen", () => {
    reset();
    expect(() => useStore.getState().disrupt({ kind: "churn", violence: 1 })).not.toThrow();
    expect(useStore.getState().layers).toEqual([]);
  });

  it("re-masks accents without masking the base layer", () => {
    useStore.getState().disrupt({ kind: "region", violence: 0.6 });
    const layers = useStore.getState().layers;
    expect(layers[0].region ?? null).toBeNull();
    if (layers.length > 1) expect(layers[1].region).toBeTruthy();
  });
});

describe("moshStorm history", () => {
  beforeEach(reset);

  it("snapshots when the arrangement changes", () => {
    useStore.getState().moshStorm(["hueRotate", "rgbShift"]);
    const past = useStore.getState().past.length;
    useStore.getState().moshStorm(["twirl", "melt"]);
    expect(useStore.getState().past.length).toBe(past + 1);
  });

  it("does not snapshot when only the parameters are re-rolled", () => {
    /* Storm calls this ~12.5×/s with the same ids for 5–60s at a stretch. With
       HISTORY_LIMIT at 20, snapshotting each call erased the user's entire undo
       history within about a second and a half of the mode being switched on. */
    useStore.getState().moshStorm(["hueRotate", "rgbShift"]);
    const past = useStore.getState().past.length;
    for (let i = 0; i < 100; i++) useStore.getState().moshStorm(["hueRotate", "rgbShift"]);
    expect(useStore.getState().past.length).toBe(past);
  });

  it("still re-rolls the parameters on every call", () => {
    // The churn is the whole point — suppressing the snapshot must not suppress
    // the effect that made Storm look good.
    useStore.getState().moshStorm(["hueRotate", "rgbShift"]);
    const before = JSON.stringify(useStore.getState().layers.map(l => l.params));
    useStore.getState().moshStorm(["hueRotate", "rgbShift"]);
    expect(JSON.stringify(useStore.getState().layers.map(l => l.params))).not.toBe(before);
  });
});
