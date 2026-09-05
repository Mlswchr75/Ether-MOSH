import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_ORDER, groupLayersByRole, resolveLayerRole } from "@/engine/effectRoles";
import { useStore } from "./useStore";

describe("moshNext", () => {
  beforeEach(() => {
    useStore.setState({
      layers: [], selectedLayerId: null, past: [], future: [],
      currentLook: null, currentBrief: null, recentFormEffects: [], recentOtherEffects: [], recentLooks: [],
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
    // Which roles a stack fills now varies per mosh (depth is jittered), so
    // walk whatever this one actually built rather than a fixed list.
    const represented = [...new Set(useStore.getState().layers.map(resolveLayerRole))]
      .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));

    expect(represented[0]).toBe("grade");
    expect(useStore.getState().roleCursor).toBe("grade");
    for (const role of represented) {
      expect(useStore.getState().moshNext()!.role).toBe(role);
    }
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
    // INTERDIMENSIONAL rather than NUCLEAR: depth is jittered per mosh now,
    // and this is the one tier whose whole band doubles the accent.
    useStore.getState().mosh("interdimensional");
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
