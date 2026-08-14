import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

/**
 * `clearAllFx` has to leave the bare remastered source on screen. Dropping the
 * layers is the obvious half; stopping everything that would re-apply a mosh is
 * the half that actually makes the clear stick.
 */
describe("clearAllFx", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [],
      selectedLayerId: null,
      shuffleSec: null,
      past: [],
      future: [],
      currentLook: null,
      lastRoleRoll: null,
    });
  });

  it("removes every layer", () => {
    useStore.getState().mosh();
    expect(useStore.getState().layers.length).toBeGreaterThan(0);

    useStore.getState().clearAllFx();
    expect(useStore.getState().layers).toEqual([]);
    expect(useStore.getState().selectedLayerId).toBeNull();
  });

  it("stops auto-shuffle, which would otherwise re-mosh and undo the clear", () => {
    useStore.getState().setShuffleSec(5);
    useStore.getState().clearAllFx();
    expect(useStore.getState().shuffleSec).toBeNull();
  });

  it("forgets the art direction so the next mosh starts fresh", () => {
    useStore.getState().mosh();
    expect(useStore.getState().currentLook).not.toBeNull();

    useStore.getState().clearAllFx();
    expect(useStore.getState().currentLook).toBeNull();
    expect(useStore.getState().lastRoleRoll).toBeNull();
  });

  it("is undoable like any other change", () => {
    useStore.getState().mosh();
    const before = useStore.getState().layers.map(l => l.effectId);

    useStore.getState().clearAllFx();
    expect(useStore.getState().layers).toEqual([]);

    useStore.getState().undo();
    expect(useStore.getState().layers.map(l => l.effectId)).toEqual(before);
  });

  it("is safe to call when there is nothing to clear", () => {
    expect(() => useStore.getState().clearAllFx()).not.toThrow();
    expect(useStore.getState().layers).toEqual([]);
  });

  it("leaves the source itself untouched — it clears effects, not the image", () => {
    const before = {
      imageElement: useStore.getState().imageElement,
      videoElement: useStore.getState().videoElement,
      sourceName: useStore.getState().sourceName,
    };
    useStore.getState().mosh();
    useStore.getState().clearAllFx();
    expect(useStore.getState().imageElement).toBe(before.imageElement);
    expect(useStore.getState().videoElement).toBe(before.videoElement);
    expect(useStore.getState().sourceName).toBe(before.sourceName);
  });
});
