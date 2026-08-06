import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

/**
 * `moshNext` is what a plain tap does. The whole point is that the user never
 * has to aim: taps cycle the voices, locks are stepped over, and a full mosh
 * puts the rotation back at the start.
 */
describe("moshNext", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [],
      selectedLayerId: null,
      past: [],
      future: [],
      currentLook: null,
      currentBrief: null,
      lastQuadrantRoll: null,
      recentEffects: [],
      recentLooks: [],
      quadrantHistory: [[], [], [], []],
      voiceCursor: 0,
    });
    useStore.getState().mosh();
  });

  it("re-rolls one voice at a time rather than the whole stack", () => {
    const before = useStore.getState().layers.map(l => l.effectId);
    const roll = useStore.getState().moshNext();
    expect(roll).not.toBeNull();

    const after = useStore.getState().layers.map(l => l.effectId);
    expect(after).toHaveLength(before.length);
    const changed = after.filter((id, i) => id !== before[i]);
    expect(changed).toHaveLength(1);
  });

  it("cycles through the voices on repeated taps", () => {
    const count = Math.min(4, useStore.getState().layers.length);
    expect(count).toBeGreaterThan(1);

    const hit = new Set<number>();
    for (let i = 0; i < count; i++) {
      const roll = useStore.getState().moshNext();
      expect(roll).not.toBeNull();
      hit.add(roll!.quadrant);
    }
    // One pass around the rotation touches every voice exactly once.
    expect(hit.size).toBe(count);
  });

  it("starts at the grade and advances in order", () => {
    expect(useStore.getState().voiceCursor).toBe(0);
    expect(useStore.getState().moshNext()!.quadrant).toBe(0);
    expect(useStore.getState().moshNext()!.quadrant).toBe(1);
  });

  it("steps over a locked voice instead of stalling on it", () => {
    const first = useStore.getState().layers[0];
    useStore.getState().toggleLocked(first.id);

    const roll = useStore.getState().moshNext();
    expect(roll).not.toBeNull();
    expect(roll!.quadrant).not.toBe(0);
    // The kept voice survives untouched — that is the whole point of locking.
    expect(useStore.getState().layers[0].effectId).toBe(first.effectId);
    expect(useStore.getState().layers[0].locked).toBe(true);
  });

  it("keeps every locked voice through a full pass of taps", () => {
    const kept = useStore.getState().layers[1];
    useStore.getState().toggleLocked(kept.id);

    for (let i = 0; i < 8; i++) useStore.getState().moshNext();

    expect(useStore.getState().layers[1].effectId).toBe(kept.effectId);
  });

  it("returns null when every voice is locked, rather than silently doing nothing", () => {
    for (const l of useStore.getState().layers) useStore.getState().toggleLocked(l.id);
    expect(useStore.getState().moshNext()).toBeNull();
  });

  it("rewinds the rotation to the grade after a full mosh", () => {
    useStore.getState().moshNext();
    useStore.getState().moshNext();
    expect(useStore.getState().voiceCursor).not.toBe(0);

    useStore.getState().mosh();
    expect(useStore.getState().voiceCursor).toBe(0);
  });

  it("is undoable one voice at a time", () => {
    const before = useStore.getState().layers.map(l => l.effectId);
    useStore.getState().moshNext();
    useStore.getState().undo();
    expect(useStore.getState().layers.map(l => l.effectId)).toEqual(before);
  });
});
