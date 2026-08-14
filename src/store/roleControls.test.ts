import { beforeEach, describe, expect, it } from "vitest";
import { groupLayersByRole, ROLE_ORDER } from "@/engine/effectRoles";
import type { Layer } from "./types";
import { useStore } from "./useStore";

const roleStore = () => useStore.getState() as unknown as {
  layers: Layer[];
  past: Layer[][];
  selectedLayerId: string | null;
  selectedRole: "grade" | "form" | "accent" | "finish" | null;
  selectedRoleLayers: Partial<Record<"grade" | "form" | "accent" | "finish", string>>;
  roleCursor: "grade" | "form" | "accent" | "finish";
  future: Layer[][];
  selectRole: (role: "grade" | "form" | "accent" | "finish") => void;
  selectRoleLayer: (role: "grade" | "form" | "accent" | "finish", id: string) => void;
  selectLayer: (id: string | null) => void;
  rerollRole: (role?: "grade" | "form" | "accent" | "finish", id?: string) => { layerId: string } | null;
  addRole: (role: "grade" | "form" | "accent" | "finish") => { layerId: string } | null;
  moshNext: () => { role: "grade" | "form" | "accent" | "finish"; layerId: string } | null;
  mosh: (intensity?: "mild" | "savage" | "nuclear" | "interdimensional") => void;
  toggleLocked: (id: string) => void;
  undo: () => void;
  applyPreset: (payload: { layers: Layer[] }) => boolean;
};

const reset = () => {
  useStore.setState({
    layers: [], selectedLayerId: null, past: [], future: [],
    currentLook: null, currentBrief: null, recentEffects: [], recentLooks: [],
  });
};

describe("role-aware effect controls", () => {
  beforeEach(reset);

  it("selection changes no pixels or layer data", () => {
    const store = roleStore();
    store.mosh("savage");
    const before = structuredClone(roleStore().layers);

    store.selectRole("finish");

    expect(roleStore().layers).toEqual(before);
    expect(roleStore().selectedRole).toBe("finish");
  });

  it("selects a role's remembered layer without mutating pixels and clears empty roles", () => {
    const store = roleStore();
    store.mosh("interdimensional");
    const accents = groupLayersByRole(roleStore().layers).accent;
    const finish = groupLayersByRole(roleStore().layers).finish[0];
    const before = structuredClone(roleStore().layers);

    store.selectRoleLayer("accent", accents[1].id);
    store.selectLayer(finish.id);
    store.selectRole("accent");

    expect(roleStore().selectedLayerId).toBe(accents[1].id);
    expect(roleStore().layers).toEqual(before);

    store.mosh("mild");
    store.selectRole("form");
    expect(roleStore().selectedLayerId).toBeNull();
  });

  it("exposes the composition roles at every intensity depth", () => {
    const store = roleStore();
    const expected = {
      mild: ["grade", "finish"],
      savage: ["grade", "form", "finish"],
      nuclear: ["grade", "form", "accent", "accent", "finish"],
      interdimensional: ["grade", "form", "form", "accent", "accent", "finish", "finish"],
    } as const;

    for (const [intensity, roles] of Object.entries(expected)) {
      store.mosh(intensity as "mild" | "savage" | "nuclear" | "interdimensional");
      expect(roleStore().layers.map(layer => layer.role)).toEqual(roles);
    }
  });

  it("rerolls only the explicitly selected repeated-role layer", () => {
    const store = roleStore();
    store.mosh("nuclear");
    const accents = groupLayersByRole(roleStore().layers).accent;
    const target = accents[1];
    const before = roleStore().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));

    store.selectRoleLayer("accent", target.id);
    const roll = store.rerollRole();

    expect(roll!.layerId).toBe(target.id);
    expect(roleStore().layers
      .map((layer, index) => layer.effectId === before[index].effectId ? null : layer.id)
      .filter(Boolean)).toEqual([target.id]);
  });

  it("preserves a target region, ID, stack position, and lock state on reroll", () => {
    const store = roleStore();
    store.mosh("savage");
    const target = roleStore().layers[1];
    const region = { mode: "radial" as const, scale: 0.4, feather: 0.1, invert: false };
    useStore.setState({ layers: roleStore().layers.map(layer => layer.id === target.id ? { ...layer, region } : layer) });

    store.selectRoleLayer("form", target.id);
    store.rerollRole();

    const rerolled = roleStore().layers[1];
    expect(rerolled.id).toBe(target.id);
    expect(rerolled.region).toEqual(region);
    expect(rerolled.locked).toBe(target.locked);
  });

  it("does not mutate an explicitly selected locked target", () => {
    const store = roleStore();
    store.mosh("savage");
    const target = groupLayersByRole(roleStore().layers).form[0];
    store.selectRoleLayer("form", target.id);
    store.toggleLocked(target.id);
    const before = structuredClone(roleStore().layers);

    expect(store.rerollRole("form", target.id)).toBeNull();
    expect(roleStore().layers).toEqual(before);
  });

  it("does not fall through from a locked remembered repeated-role selection", () => {
    const store = roleStore();
    store.mosh("nuclear");
    const [lockedAccent] = groupLayersByRole(roleStore().layers).accent;
    store.selectRoleLayer("accent", lockedAccent.id);
    store.toggleLocked(lockedAccent.id);
    const before = structuredClone(roleStore().layers);

    expect(store.rerollRole()).toBeNull();
    expect(roleStore().layers).toEqual(before);
  });

  it("skips fully locked roles and returns null when every layer is locked", () => {
    const store = roleStore();
    store.mosh("savage");
    const grade = groupLayersByRole(roleStore().layers).grade[0];
    store.toggleLocked(grade.id);

    expect(store.moshNext()!.role).toBe("form");

    for (const layer of roleStore().layers.filter(layer => !layer.locked)) store.toggleLocked(layer.id);
    const before = structuredClone(roleStore().layers);
    expect(store.moshNext()).toBeNull();
    expect(roleStore().layers).toEqual(before);
  });

  it("adds a missing role in semantic stack order and makes it undoable", () => {
    const store = roleStore();
    store.mosh("mild");
    const before = structuredClone(roleStore().layers);

    const roll = store.addRole("form");

    expect(roleStore().layers.map(layer => layer.role)).toEqual(["grade", "form", "finish"]);
    expect(roleStore().layers[1].id).toBe(roll!.layerId);
    store.undo();
    expect(roleStore().layers).toEqual(before);
  });

  it("makes reroll and lock changes undoable", () => {
    const store = roleStore();
    store.mosh("savage");
    const target = roleStore().layers[1];
    const beforeEffect = target.effectId;

    store.selectRoleLayer("form", target.id);
    store.rerollRole();
    store.undo();
    expect(roleStore().layers.find(layer => layer.id === target.id)!.effectId).toBe(beforeEffect);

    store.toggleLocked(target.id);
    expect(roleStore().layers.find(layer => layer.id === target.id)!.locked).toBe(true);
    store.undo();
    expect(roleStore().layers.find(layer => layer.id === target.id)!.locked).toBe(false);
  });

  it("makes a reroll one history step and clears redo", () => {
    const store = roleStore();
    store.mosh("savage");
    const target = groupLayersByRole(roleStore().layers).form[0];
    store.selectRoleLayer("form", target.id);
    const pastBefore = roleStore().past.length;
    useStore.setState({ future: [structuredClone(roleStore().layers)] });

    store.rerollRole();

    expect(roleStore().past).toHaveLength(pastBefore + 1);
    expect(roleStore().future).toEqual([]);
  });

  it("makes Add one history step and clears redo", () => {
    const store = roleStore();
    store.mosh("mild");
    const pastBefore = roleStore().past.length;
    useStore.setState({ future: [structuredClone(roleStore().layers)] });

    store.addRole("form");

    expect(roleStore().past).toHaveLength(pastBefore + 1);
    expect(roleStore().future).toEqual([]);
  });

  it("makes Lock one history step and clears redo", () => {
    const store = roleStore();
    store.mosh("savage");
    const target = roleStore().layers[0];
    const pastBefore = roleStore().past.length;
    useStore.setState({ future: [structuredClone(roleStore().layers)] });

    store.toggleLocked(target.id);

    expect(roleStore().past).toHaveLength(pastBefore + 1);
    expect(roleStore().future).toEqual([]);
  });

  it("repairs stale selected layer IDs after undo, preset loading, and a full mosh", () => {
    const store = roleStore();
    store.mosh("mild");
    store.addRole("form");
    store.undo();
    expect(roleStore().selectedRole).toBe("grade");
    expect(roleStore().selectedLayerId).toBe(roleStore().layers.find(layer => layer.role === "grade")!.id);

    store.mosh("savage");
    store.selectRoleLayer("form", groupLayersByRole(roleStore().layers).form[0].id);
    const preset = structuredClone(roleStore().layers).map(layer => ({ ...layer, id: `preset-${layer.id}` }));

    expect(store.applyPreset({ layers: preset })).toBe(true);
    expect(roleStore().selectedRoleLayers.form).toBe(roleStore().layers.find(layer => layer.role === "form")!.id);
    store.mosh("mild");
    expect(ROLE_ORDER).toContain(roleStore().selectedRole!);
    expect(roleStore().selectedLayerId).toBe(roleStore().layers.find(layer => layer.role === roleStore().selectedRole)!.id);
  });
});
