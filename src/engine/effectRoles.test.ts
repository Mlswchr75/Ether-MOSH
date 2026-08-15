import { describe, expect, it } from "vitest";
import {
  groupLayersByRole,
  nextAvailableRole,
  normalizeLayerRoles,
  resolveLayerRole,
  roleForEffect,
  ROLE_ORDER,
} from "./effectRoles";
import type { Layer } from "@/store/types";

const layer = (id: string, effectId: string, role?: Layer["role"]): Layer => ({
  id, effectId, role, hidden: false, locked: false, opacity: 1,
  blend: "normal", params: {}, mods: {}, audioMaps: {},
});

describe("effect role contract", () => {
  it("infers a legacy finish by effect identity instead of array position", () => {
    expect(normalizeLayerRoles([layer("a", "filmicTone"), layer("b", "bloom")])
      .map(item => item.role)).toEqual(["grade", "finish"]);
  });

  it("groups repeated roles without changing stack order", () => {
    const grouped = groupLayersByRole([
      layer("g", "filmicTone", "grade"),
      layer("a1", "rgbShift", "accent"),
      layer("a2", "datamosh", "accent"),
    ]);
    expect(grouped.accent.map(item => item.id)).toEqual(["a1", "a2"]);
  });

  it("maps representative effects to plain-language roles", () => {
    expect(["filmicTone", "melt", "datamosh", "bloom"].map(roleForEffect))
      .toEqual(["grade", "form", "accent", "finish"]);
  });

  it("keeps an explicit valid layer role over an effect-derived role", () => {
    expect(resolveLayerRole(layer("b", "bloom", "grade"), 3)).toBe("grade");
  });

  it("derives a missing role from the effect craft", () => {
    expect(resolveLayerRole(layer("b", "bloom"), 0)).toBe("finish");
  });

  it("uses each first-four legacy role for unknown effects", () => {
    expect(ROLE_ORDER.map((role, index) =>
      resolveLayerRole(layer(`legacy-${role}`, "retiredEffect"), index),
    )).toEqual(["grade", "form", "accent", "finish"]);
  });

  it("uses accent for unknown effects deeper than the legacy stack", () => {
    expect(resolveLayerRole(layer("deep", "retiredEffect"), 4)).toBe("accent");
  });

  it("normalizes without cloning a layer that already has a valid role", () => {
    const original = layer("b", "bloom", "grade");
    expect(normalizeLayerRoles([original])[0]).toBe(original);
  });

  it("normalizes a missing role by cloning the affected layer", () => {
    const missing = layer("missing", "bloom");
    const normalized = normalizeLayerRoles([missing]);

    expect(normalized[0]).not.toBe(missing);
    expect(normalized[0].role).toBe("finish");
  });

  it("normalizes an invalid role by cloning the affected layer", () => {
    const invalid = { ...layer("invalid", "retiredEffect"), role: "not-a-role" } as unknown as Layer;
    const normalized = normalizeLayerRoles([invalid]);

    expect(normalized[0]).not.toBe(invalid);
    expect(normalized[0].role).toBe("grade");
  });

  it("moves past the current role by default", () => {
    expect(nextAvailableRole([
      layer("grade", "filmicTone", "grade"),
      layer("form", "melt", "form"),
    ], "grade")).toBe("form");
  });

  it("includes the current unlocked role when requested", () => {
    expect(nextAvailableRole([layer("grade", "filmicTone", "grade")], "grade", {
      includeCurrent: true,
    })).toBe("grade");
  });

  it("skips locked roles while cycling", () => {
    expect(nextAvailableRole([
      { ...layer("form", "melt", "form"), locked: true },
      layer("finish", "bloom", "finish"),
    ], "grade")).toBe("finish");
  });

  it("skips absent roles while cycling", () => {
    expect(nextAvailableRole([layer("finish", "bloom", "finish")], "grade"))
      .toBe("finish");
  });

  it("wraps from finish to a preceding available role", () => {
    expect(nextAvailableRole([layer("grade", "filmicTone", "grade")], "finish"))
      .toBe("grade");
  });

  it("returns null when every present role is locked", () => {
    expect(nextAvailableRole([
      { ...layer("grade", "filmicTone", "grade"), locked: true },
      { ...layer("finish", "bloom", "finish"), locked: true },
    ], "grade", { includeCurrent: true })).toBeNull();
  });
});
