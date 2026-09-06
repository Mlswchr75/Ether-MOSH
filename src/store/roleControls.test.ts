import { beforeEach, describe, expect, it } from "vitest";
import { groupLayersByRole, resolveLayerRole, ROLE_ORDER } from "@/engine/effectRoles";
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

    // Depth is jittered per mosh now, so no intensity is guaranteed to leave a
    // role empty — strip the role instead of picking a setting that used to.
    store.mosh("mild");
    useStore.setState({ layers: roleStore().layers.filter(layer => layer.role !== "form") });
    store.selectRole("form");
    expect(roleStore().selectedLayerId).toBeNull();
  });

  /* An intensity names a centre depth, not a fixed one — rollRoleCount jitters
     a layer either side of it per mosh. So this asserts what the tiers still
     promise: a stack always reads bottom-to-top in semantic order, always
     opens on the grade, lands within its tier's own band, and a higher tier is
     never shallower than a lower one. */
  it("exposes the composition roles in semantic order, at each intensity's depth band", () => {
    const store = roleStore();
    const bands = {
      mild: [2, 3],
      savage: [3, 5],
      nuclear: [4, 6],
      interdimensional: [6, 7],
    } as const;

    for (const [intensity, [min, max]] of Object.entries(bands)) {
      const depths: number[] = [];
      for (let i = 0; i < 25; i++) {
        store.mosh(intensity as keyof typeof bands);
        const roles = roleStore().layers.map(resolveLayerRole);
        expect(roles.length, intensity).toBeGreaterThanOrEqual(min);
        expect(roles.length, intensity).toBeLessThanOrEqual(max);
        expect(roles[0], intensity).toBe("grade");
        const ranks = roles.map(role => ROLE_ORDER.indexOf(role));
        expect(ranks, intensity).toEqual([...ranks].sort((a, b) => a - b));
        depths.push(roles.length);
      }
      // The jitter must not swamp the setting: every roll stays in its band,
      // so a tier is still meaningfully deeper than the one below it.
      expect(Math.min(...depths), intensity).toBeGreaterThanOrEqual(min);
    }
  });

  it("rerolls only the explicitly selected repeated-role layer", () => {
    const store = roleStore();
    // INTERDIMENSIONAL rather than NUCLEAR: depth is jittered now, and only
    // this tier's whole band (6-7) doubles the accent every time.
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
    // INTERDIMENSIONAL rather than NUCLEAR: jittered depth means NUCLEAR can
    // land on a single accent, which leaves nothing repeated to test.
    store.mosh("interdimensional");
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
    // addRole only fills a role that is actually empty, and jittered depth
    // means MILD no longer reliably leaves one out.
    useStore.setState({ layers: roleStore().layers.filter(layer => layer.role !== "form") });
    const before = structuredClone(roleStore().layers);

    const roll = store.addRole("form");

    expect(roleStore().layers.map(resolveLayerRole))
      .toEqual([...before.map(resolveLayerRole), "form" as const]
        .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b)));
    expect(roleStore().layers.find(layer => layer.role === "form")!.id).toBe(roll!.layerId);
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
    // addRole is a no-op on an already-filled role, and jittered depth means
    // MILD no longer reliably leaves the form out.
    useStore.setState({ layers: roleStore().layers.filter(layer => layer.role !== "form") });
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
    // INTERDIMENSIONAL rather than NUCLEAR: depth is jittered per mosh now,
    // and this is the one tier whose whole band doubles the accent.
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
    // addRole is a no-op when the role is already filled, and jittered depth
    // means MILD no longer reliably leaves the form out — without this the
    // undo below would roll back the mosh instead of the added role.
    useStore.setState({ layers: roleStore().layers.filter(layer => layer.role !== "form") });
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
