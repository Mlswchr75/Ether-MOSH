import { describe, expect, it } from "vitest";
import { addOwnFxLayer, removeOwnFxLayer, moveOwnFxLayer, MAX_OVERLAY_FX } from "./ownFxStack";
import { makeLayer } from "@/store/useStore";

describe("overlay own-fx stack", () => {
  it("caps independent sticker stacks", () => {
    let layers = [makeLayer("rgbShift")];
    for (let i = 0; i < MAX_OVERLAY_FX + 3; i++) layers = addOwnFxLayer(layers, "rgbShift");
    expect(layers).toHaveLength(MAX_OVERLAY_FX);
  });

  it("removes and reorders layers by id", () => {
    const a = makeLayer("rgbShift");
    const b = makeLayer("scanlines");
    const c = makeLayer("noise");
    expect(moveOwnFxLayer([a, b, c], c.id, -1).map(x => x.id)).toEqual([a.id, c.id, b.id]);
    expect(removeOwnFxLayer([a, b, c], b.id).map(x => x.id)).toEqual([a.id, c.id]);
  });
});
