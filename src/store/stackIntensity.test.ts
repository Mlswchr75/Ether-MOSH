import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./useStore";

describe("stack master", () => {
  beforeEach(() => useStore.setState({ stackIntensity: 1, stackIntensityReactive: 0 }));

  /* The default has to be a true no-op, or shipping the fader silently
     re-grades every stack anyone already saved. */
  it("defaults to a no-op", () => {
    expect(useStore.getState().stackIntensity).toBe(1);
    expect(useStore.getState().stackIntensityReactive).toBe(0);
  });

  it("allows pushing past the director's own mix", () => {
    useStore.getState().setStackIntensity(1.5);
    expect(useStore.getState().stackIntensity).toBe(1.5);
  });

  it("clamps rather than trusting whatever a control hands it", () => {
    useStore.getState().setStackIntensity(9);
    expect(useStore.getState().stackIntensity).toBe(1.5);
    useStore.getState().setStackIntensity(-4);
    expect(useStore.getState().stackIntensity).toBe(0);
    useStore.getState().setStackIntensityReactive(9);
    expect(useStore.getState().stackIntensityReactive).toBe(1);
    useStore.getState().setStackIntensityReactive(-4);
    expect(useStore.getState().stackIntensityReactive).toBe(0);
  });

  /* The master is a view onto the stack, not an edit of it — the layers it
     scales must come back untouched when it moves. */
  it("changes no layer data", () => {
    useStore.getState().mosh("savage");
    const before = structuredClone(useStore.getState().layers);
    useStore.getState().setStackIntensity(0.25);
    useStore.getState().setStackIntensityReactive(0.8);
    expect(useStore.getState().layers).toEqual(before);
  });
});
