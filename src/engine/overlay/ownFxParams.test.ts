import { describe, expect, it } from "vitest";
import { patchOwnFxParam } from "./ownFxParams";

const layer = { id: "l1", effectId: "pixelSort", params: { amount: 0.5, threshold: 0.4 }, hidden: false, opacity: 1, blend: "normal", mods: {}, audioMaps: {} } as any;

describe("patchOwnFxParam", () => {
  it("updates only the requested layer parameter", () => {
    const next = patchOwnFxParam([layer], "l1", "amount", 0.8);
    expect(next[0].params).toEqual({ amount: 0.8, threshold: 0.4 });
    expect(next[0]).not.toBe(layer);
  });

  it("leaves unrelated layers untouched", () => {
    const other = { ...layer, id: "l2" };
    const next = patchOwnFxParam([layer, other], "l1", "amount", 0.2);
    expect(next[1]).toBe(other);
  });
});
