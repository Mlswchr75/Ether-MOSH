import { beforeEach, describe, expect, it } from "vitest";
import { groupLayersByRole } from "@/engine/effectRoles";
import { useStore } from "./useStore";

describe("moshNext", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [], selectedLayerId: null, past: [], future: [],
      currentLook: null, currentBrief: null, recentLooks: [],
      selectedRole: null,
      selectedRoleLayers: {}, roleCursor: "grade",
    });
    useStore.getState().mosh("savage");
  });

  it("rerolls one semantic role layer rather than the whole stack", () => {
    const before = useStore.getState().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));
    const roll = useStore.getState().moshNext();

    expect(roll).not.toBeNull();
    expect(useStore.getState().layers
      .map((layer, index) => layer.effectId === before[index].effectId ? null : layer.id)
      .filter(Boolean)).toEqual([roll!.layerId]);
  });

  it("starts at color and advances over represented roles", () => {
    expect(useStore.getState().roleCursor).toBe("grade");
    expect(useStore.getState().moshNext()!.role).toBe("grade");
    expect(useStore.getState().moshNext()!.role).toBe("form");
    expect(useStore.getState().moshNext()!.role).toBe("finish");
  });

  it("steps over a fully locked role without changing it", () => {
    const grade = groupLayersByRole(useStore.getState().layers).grade[0];
    useStore.getState().toggleLocked(grade.id);

    const roll = useStore.getState().moshNext();

    expect(roll!.role).toBe("form");
    expect(useStore.getState().layers.find(layer => layer.id === grade.id)).toMatchObject({
      effectId: grade.effectId,
      locked: true,
    });
  });

  it("rerolls an unlocked repeated accent when its remembered sibling is locked", () => {
    useStore.getState().mosh("nuclear");
    const accents = groupLayersByRole(useStore.getState().layers).accent;
    const [lockedAccent, targetAccent] = accents;
    useStore.setState({
      selectedRole: "accent",
      selectedRoleLayers: { accent: lockedAccent.id },
      roleCursor: "accent",
    });
    useStore.getState().toggleLocked(lockedAccent.id);
    const before = useStore.getState().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));

    const roll = useStore.getState().moshNext();

    expect(roll).toMatchObject({ role: "accent", layerId: targetAccent.id });
    expect(useStore.getState().layers
      .map((layer, index) => layer.effectId === before[index].effectId ? null : layer.id)
      .filter(Boolean)).toEqual([targetAccent.id]);
  });

  it("returns null when every represented role is locked", () => {
    for (const layer of useStore.getState().layers) useStore.getState().toggleLocked(layer.id);
    expect(useStore.getState().moshNext()).toBeNull();
  });

  it("resets role targeting to the first represented unlocked role after a full mosh", () => {
    useStore.getState().moshNext();
    expect(useStore.getState().roleCursor).toBe("form");

    useStore.getState().mosh();
    expect(useStore.getState().roleCursor).toBe("grade");
    expect(useStore.getState().selectedRole).toBe("grade");
  });

  it("is undoable one role layer at a time", () => {
    const before = useStore.getState().layers.map(layer => layer.effectId);
    useStore.getState().moshNext();
    useStore.getState().undo();
    expect(useStore.getState().layers.map(layer => layer.effectId)).toEqual(before);
  });
});
