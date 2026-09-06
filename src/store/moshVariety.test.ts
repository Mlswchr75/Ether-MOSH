import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

describe("mosh combination memory", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [], past: [], future: [], captureLocked: false,
      currentLook: null, currentBrief: null, plannedMosh: null,
      recentLooks: [], recentStacks: [], recentFormEffects: [], recentOtherEffects: [],
      imageElement: null, videoElement: null, glCanvas: null,
    });
  });

  it("remembers displayed stacks and consumes the preplanned next roll", () => {
    useStore.getState().mosh("savage");
    const first = useStore.getState();
    const ids = first.layers.map(layer => layer.effectId);
    const planned = first.plannedMosh!;
    expect(first.recentStacks).toEqual([ids]);
    useStore.getState().mosh("savage");
    const second = useStore.getState();
    expect(second.seed).toBe(planned.seed);
    expect(second.layers.map(layer => layer.effectId)).toEqual(planned.composition.layers.map(layer => layer.effectId));
    expect(second.recentStacks).toEqual([second.layers.map(layer => layer.effectId), ids]);
  });

  it("rejects a preplanned stack that now duplicates a pinned effect", () => {
    useStore.getState().mosh("savage");
    const pinnedId = useStore.getState().plannedMosh!.composition.layers[0].effectId;
    useStore.getState().addLayer(pinnedId);
    const pinned = useStore.getState().layers.at(-1)!;
    useStore.getState().toggleLocked(pinned.id);
    const locked = useStore.getState().layers.at(-1)!;
    useStore.getState().mosh("savage");
    expect(useStore.getState().layers.filter(layer => layer.effectId === pinnedId)).toEqual([locked]);
  });

  it("records Forge rolls in the same bounded memory and freezes it during capture", () => {
    useStore.setState(state => ({ forge: { ...state.forge, seamless: false } }));
    for (let i = 0; i < 15; i++) useStore.getState().forgeMosh("savage");
    const before = useStore.getState();
    expect(before.recentStacks).toHaveLength(12);
    expect(before.recentStacks[0]).toEqual(before.layers.map(layer => layer.effectId));
    useStore.setState({ captureLocked: true });
    useStore.getState().forgeMosh("nuclear");
    useStore.getState().mosh("nuclear");
    expect(useStore.getState().recentStacks).toBe(before.recentStacks);
    expect(useStore.getState().layers).toBe(before.layers);
  });
});
