import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

describe("dramatic mosh", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [],
      selectedLayerId: null,
      selectedRole: null,
      selectedRoleLayers: {},
      roleCursor: "grade",
      past: [],
      future: [],
      currentLook: null,
      currentBrief: null,
      recentFormEffects: [],
      recentOtherEffects: [],
      recentLooks: [],
      plannedMosh: null,
      captureLocked: false,
    });
    useStore.getState().mosh("savage");
  });

  it("forgets old director memory and jumps to a different maximum-range stack", () => {
    const before = useStore.getState();
    const currentEffects = new Set(before.layers.filter(layer => !layer.locked).map(layer => layer.effectId));
    useStore.setState({
      recentFormEffects: ["stale-form-memory"],
      recentOtherEffects: ["stale-other-memory"],
      recentLooks: ["stale-look-memory"],
    });

    useStore.getState().mosh(undefined, { resetMemory: true, dramatic: true });

    const after = useStore.getState();
    const newEffects = after.layers.filter(layer => !layer.locked).map(layer => layer.effectId);
    expect(newEffects.length).toBeGreaterThan(0);
    expect(newEffects.some(effectId => currentEffects.has(effectId))).toBe(false);
    expect(after.recentFormEffects).not.toContain("stale-form-memory");
    expect(after.recentOtherEffects).not.toContain("stale-other-memory");
    expect(after.recentLooks).not.toContain("stale-look-memory");
    expect(after.plannedMosh?.intensity).toBe("interdimensional");
    expect(after.past).toHaveLength(before.past.length + 1);
  });
});
