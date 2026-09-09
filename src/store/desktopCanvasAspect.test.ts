import { beforeEach, describe, expect, it } from "vitest";
import { nextDesktopCanvasAspect, useStore } from "./useStore";

describe("desktop canvas aspect", () => {
  beforeEach(() => useStore.setState({ desktopCanvasAspect: "landscape" }));

  it("cycles landscape to portrait to square and back", () => {
    const cycle = useStore.getState().cycleDesktopCanvasAspect;

    cycle();
    expect(useStore.getState().desktopCanvasAspect).toBe("portrait");
    cycle();
    expect(useStore.getState().desktopCanvasAspect).toBe("square");
    cycle();
    expect(useStore.getState().desktopCanvasAspect).toBe("landscape");
  });

  it("exposes the same deterministic cycle for UI labels and icons", () => {
    expect(nextDesktopCanvasAspect("landscape")).toBe("portrait");
    expect(nextDesktopCanvasAspect("portrait")).toBe("square");
    expect(nextDesktopCanvasAspect("square")).toBe("landscape");
  });
});
