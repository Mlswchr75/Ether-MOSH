import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLayer, useStore } from "@/store/useStore";
import type { Layer } from "@/store/types";
import { cancelLayerCrossfade, crossfadeLayers } from "./layerCrossfade";

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

  it("never promotes interrupted transition layers into the real stack", () => {
    let settled = useStore.getState().layers;

    for (let roll = 0; roll < 8; roll += 1) {
      const next = stack(`roll-${roll}`);
      let layersSeenByCommit: Layer[] = [];

      crossfadeLayers(() => {
        layersSeenByCommit = useStore.getState().layers;
        useStore.getState().setLayersRaw(next);
      }, 680);

      expect(layersSeenByCommit.map(layer => layer.id)).toEqual(settled.map(layer => layer.id));
      expect(useStore.getState().layers).toHaveLength(settled.length + next.length + 1);
      settled = next;
    }

    cancelLayerCrossfade();
    expect(useStore.getState().layers).toEqual(settled);
  });
});
