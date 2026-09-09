import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLayer, useStore } from "@/store/useStore";
import type { Layer } from "@/store/types";
import { cancelLayerCrossfade, crossfadeLayers, getLayerCrossfadeLayers } from "./layerCrossfade";

const stack = (prefix: string): Layer[] => [
  makeLayer("filmicTone", { id: `${prefix}-grade` }),
  makeLayer("melt", { id: `${prefix}-form` }),
  makeLayer("bloom", { id: `${prefix}-finish` }),
];

describe("layer crossfade interruption", () => {
  beforeEach(() => {
    cancelLayerCrossfade();
    useStore.setState({ layers: stack("start"), past: [], future: [] });
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => ++nextFrame));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cancelLayerCrossfade();
    vi.unstubAllGlobals();
  });

  it("keeps transition layers out of the editable stack across interruptions", () => {
    let settled = useStore.getState().layers;

    for (let roll = 0; roll < 8; roll += 1) {
      const next = stack(`roll-${roll}`);
      let layersSeenByCommit: Layer[] = [];

      crossfadeLayers(() => {
        layersSeenByCommit = useStore.getState().layers;
        useStore.getState().setLayersRaw(next);
      }, 680);

      expect(layersSeenByCommit.map(layer => layer.id)).toEqual(settled.map(layer => layer.id));
      expect(useStore.getState().layers).toEqual(next);
      expect(getLayerCrossfadeLayers()).toHaveLength(settled.length + next.length + 1);
      settled = next;
    }

    cancelLayerCrossfade();
    expect(useStore.getState().layers).toEqual(settled);
    expect(getLayerCrossfadeLayers()).toBeNull();
  });

  it("keeps Auto-Mosh controls synchronized while animation frames are paused", () => {
    for (let roll = 0; roll < 40; roll += 1) {
      const previousIds = useStore.getState().layers.map(layer => layer.id);
      crossfadeLayers(() => useStore.getState().mosh("interdimensional"), 680);

      const editable = useStore.getState().layers;
      const transition = getLayerCrossfadeLayers();
      expect(editable.length).toBeGreaterThanOrEqual(6);
      expect(editable.length).toBeLessThanOrEqual(7);
      expect(editable.every(layer => !layer.id.startsWith("__transition"))).toBe(true);
      expect(editable.some(layer => previousIds.includes(layer.id))).toBe(false);
      expect(transition).not.toBeNull();
      expect(transition).toHaveLength(previousIds.length + editable.length + 1);
    }
  });
});
