import { describe, expect, it } from "vitest";
import { useStore } from "./useStore";

describe("tile mode never outlives what set it", () => {
  /* Tiling is a whole extra render pass, applied after the effect stack and
     independent of it: mirror tiling folds every frame into a 2x2 grid with
     visible seams down the middle and across, on every source. Nothing in the
     mosh path touches it, so a tileMode left switched on reads as "an effect
     that will not go away no matter how much I mosh". */
  it("clearAllFx turns tiling off", () => {
    useStore.setState({ tileMode: "mirror" });
    useStore.getState().clearAllFx();
    expect(useStore.getState().tileMode).toBe("none");
  });

  it("clearAllFx also empties the stack it was asked to clear", () => {
    useStore.getState().mosh("savage");
    expect(useStore.getState().layers.length).toBeGreaterThan(0);
    useStore.getState().clearAllFx();
    expect(useStore.getState().layers).toEqual([]);
  });

  /* Moshing must not silently undo a tiling mode the user chose themselves in
     the Seamless panel — the fix for the stuck grid is restoring it on the way
     out of Motif Maestro and clearing it on Clear FX, not resetting it out
     from under a deliberate setting. */
  it("moshing leaves a deliberately chosen tiling mode alone", () => {
    useStore.setState({ tileMode: "seamless" });
    useStore.getState().mosh("savage");
    expect(useStore.getState().tileMode).toBe("seamless");
  });
});
