import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { encodePreset } from "@/engine/presetUrl";
import type { Layer } from "./types";
import { useStore } from "./useStore";

function legacyLayer(effectId: string, over: Partial<Layer> = {}): Layer {
  const def = EFFECTS_BY_ID[effectId];
  return {
    id: `legacy-${effectId}`,
    effectId,
    hidden: false,
    locked: false,
    opacity: 0.73,
    blend: "screen",
    region: null,
    params: Object.fromEntries(def.params.map(param => [param.key, param.default])),
    mods: Object.fromEntries(def.params.map(param => [param.key, null])),
    audioMaps: Object.fromEntries(def.params.map(param => [param.key, null])),
    ...over,
  };
}

const legacyLayers = () => [
  legacyLayer("filmicTone", { locked: true, opacity: 0.41 }),
  legacyLayer("bloom", {
    region: { mode: "hbands", scale: 3, phase: 0.2, gate: 0.6, feather: 0.1, invert: true },
  }),
];

const durableShape = (layers: Layer[]) => layers.map(({ id: _id, role: _role, ...layer }) => layer);

describe("legacy role application", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [],
      selectedLayerId: null,
      past: [],
      future: [],
      favorites: [],
      slots: new Array(9).fill(null),
    });
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("normalizes legacy favorites when applying them without altering their settings", () => {
    const layers = legacyLayers();
    useStore.setState({ favorites: [{ id: "fav", name: "Legacy", layers, seed: "legacy" }] });

    expect(useStore.getState().applyFavorite("fav")).toBe(true);
    const applied = useStore.getState().layers;
    expect(applied.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(durableShape(applied)).toEqual(durableShape(layers));
  });

  it("normalizes legacy slots when loading them without altering their settings", () => {
    const layers = legacyLayers();
    useStore.setState({ slots: [layers, ...new Array(8).fill(null)] });

    expect(useStore.getState().loadSlot(0)).toBe(true);
    const applied = useStore.getState().layers;
    expect(applied.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(durableShape(applied)).toEqual(durableShape(layers));
  });

  it("normalizes in-memory preset payloads when applying them", () => {
    const layers = legacyLayers();

    expect(useStore.getState().applyPreset({ layers })).toBe(true);
    const applied = useStore.getState().layers;
    expect(applied.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(durableShape(applied)).toEqual(durableShape(layers));
  });

  it("imports a role-less setlist through the store without altering durable settings", () => {
    const layers = legacyLayers();
    const json = JSON.stringify({
      v: 1,
      name: "Legacy rig",
      cues: [encodePreset({ layers }), ...new Array(8).fill(null)],
    });

    expect(useStore.getState().importSetlistJson(json)).toEqual({ name: "Legacy rig", count: 1 });
    const imported = useStore.getState().slots[0]!;
    expect(imported.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(imported.map(layer => ({
      effectId: layer.effectId,
      hidden: layer.hidden,
      opacity: layer.opacity,
      blend: layer.blend,
      region: layer.region,
    }))).toEqual(layers.map(layer => ({
      effectId: layer.effectId,
      hidden: layer.hidden,
      opacity: layer.opacity,
      blend: layer.blend,
      region: layer.region,
    })));
    for (const [index, layer] of imported.entries()) {
      for (const [key, value] of Object.entries(layers[index].params)) {
        expect(layer.params[key]).toBeCloseTo(value, 2);
      }
    }
  });

  it("hydrates role-less favorites and slots from localStorage without altering durable settings", async () => {
    const favoriteLayers = legacyLayers();
    const slotLayers = legacyLayers();
    localStorage.setItem("cathedral_favorites_v1", JSON.stringify([
      { id: "legacy-favorite", name: "Legacy", layers: favoriteLayers, seed: "legacy" },
    ]));
    localStorage.setItem("cathedral_slot_1", JSON.stringify(slotLayers));

    vi.resetModules();
    const { useStore: hydratedStore } = await import("./useStore");
    const hydrated = hydratedStore.getState();

    expect(hydrated.favorites[0].layers.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(durableShape(hydrated.favorites[0].layers)).toEqual(durableShape(favoriteLayers));
    expect(hydrated.slots[0]!.map(layer => layer.role)).toEqual(["grade", "finish"]);
    expect(durableShape(hydrated.slots[0]!)).toEqual(durableShape(slotLayers));
  });
});
