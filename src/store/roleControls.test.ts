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
  duplicateLayer: (id: string) => void;
  removeTopLayer: () => void;
  undo: () => void;
  applyPreset: (payload: { layers: Layer[] }) => boolean;
};

const reset = () => {
  useStore.setState({
    layers: [], selectedLayerId: null, past: [], future: [],
    currentLook: null, currentBrief: null, recentFormEffects: [], recentOtherEffects: [], recentLooks: [],
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
    // Mild and savage are pinned to an exact, deterministic depth (see
    // useStore's ROLE_COUNT_JITTER — savage is the default intensity and
    // several tests, this one included, treat it as a known shape). Nuclear
    // and interdimensional deliberately roll a range now (real variety
    // between taps was the point), so they're checked structurally instead
    // of against one fixed sequence: role order still follows the grammar,
    // starts at grade, and length falls within the ±1 jitter band around
    // each tier's base depth.
    const exact = {
      mild: ["grade", "finish"],
      savage: ["grade", "form", "finish"],
    } as const;
    for (const [intensity, roles] of Object.entries(exact)) {
      store.mosh(intensity as "mild" | "savage");
      expect(roleStore().layers.map(layer => layer.role)).toEqual(roles);
    }

    const ranged = { nuclear: [4, 6], interdimensional: [6, 7] } as const;
    for (const [intensity, [min, max]] of Object.entries(ranged)) {
      store.mosh(intensity as "nuclear" | "interdimensional");
      const roles = roleStore().layers.map(layer => layer.role);
      expect(roles.length).toBeGreaterThanOrEqual(min);
      expect(roles.length).toBeLessThanOrEqual(max);
      expect(roles[0]).toBe("grade");
      const order = roles.map(r => ROLE_ORDER.indexOf(r!));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("rerolls only the explicitly selected repeated-role layer", () => {
    const store = roleStore();
    // Interdimensional, not nuclear: nuclear's depth now jitters 4-6, and at
    // 4 there's only a single accent layer. Interdimensional's jittered
    // range (6-7) guarantees a repeated accent either way (see the
    // structural test above), so `accents[1]` is always defined here.
    store.mosh("interdimensional");
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

  it("makes a duplicated layer the coherent selection for its semantic role", () => {
    const store = roleStore();
    // interdimensional, not nuclear — see the note in the reroll test above.
    store.mosh("interdimensional");
    const target = groupLayersByRole(roleStore().layers).accent[1];

    store.selectRoleLayer("accent", target.id);
    store.duplicateLayer(target.id);

    const duplicate = roleStore().layers[roleStore().layers.findIndex(layer => layer.id === target.id) + 1];
    expect(duplicate.id).not.toBe(target.id);
    expect(duplicate.effectId).toBe(target.effectId);
    expect(roleStore().selectedLayerId).toBe(duplicate.id);
    expect(roleStore().selectedRole).toBe("accent");
    expect(roleStore().selectedRoleLayers.accent).toBe(duplicate.id);
  });

  it("repairs selection after removing the selected top layer without retaining stale IDs", () => {
    const store = roleStore();
    store.mosh("mild");
    const removed = roleStore().layers.at(-1)!;
    store.selectRoleLayer("finish", removed.id);

    store.removeTopLayer();

    const state = roleStore();
    expect(state.layers.some(layer => layer.id === removed.id)).toBe(false);
    expect(state.selectedRole).toBe("grade");
    expect(state.selectedLayerId).toBe(state.layers[0].id);
    expect(state.selectedRoleLayers.grade).toBe(state.layers[0].id);
    expect(Object.values(state.selectedRoleLayers)).not.toContain(removed.id);
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
