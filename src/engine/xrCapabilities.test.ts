import { describe, expect, it } from "vitest";
import { hasHorizontalThumbstickFlick, isMetaQuestUserAgent, isThumbstickCentered, resolveXrTextureSize, runFlatRenderPass } from "./xrCapabilities";

describe("Meta headset capability helpers", () => {
  it("recognises current and legacy Meta browser identifiers", () => {
    expect(isMetaQuestUserAgent("Mozilla/5.0 (Linux; Android 12; Quest 3) OculusBrowser/39.0")).toBe(true);
    expect(isMetaQuestUserAgent("Mozilla/5.0 (Oculus; Linux; Android 10) AppleWebKit/537.36")).toBe(true);
    expect(isMetaQuestUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140")).toBe(false);
  });

  it("accepts both common WebXR gamepad axis layouts", () => {
    expect(hasHorizontalThumbstickFlick([0.91, 0])).toBe(true);
    expect(hasHorizontalThumbstickFlick([0, 0, -0.9, 0.1])).toBe(true);
    expect(hasHorizontalThumbstickFlick([0.6, 0, -0.7, 0])).toBe(false);
  });

  it("requires the stick to return to center before another flick", () => {
    expect(isThumbstickCentered([0.1, -0.2, 0.25, 0])).toBe(true);
    expect(isThumbstickCentered([0, 0, 0.4, 0])).toBe(false);
  });

  it("isolates the flat post-processing pass from WebXR camera substitution", () => {
    const xr = { enabled: true };
    let enabledDuringRender = true;
    runFlatRenderPass(xr, () => { enabledDuringRender = xr.enabled; });
    expect(enabledDuringRender).toBe(false);
    expect(xr.enabled).toBe(true);

    expect(() => runFlatRenderPass(xr, () => { throw new Error("render failed"); })).toThrow("render failed");
    expect(xr.enabled).toBe(true);
  });

  it("uses a lower-cost 2:1 dome texture on older headsets", () => {
    expect(resolveXrTextureSize(4, 4096)).toEqual({ width: 1536, height: 768 });
    expect(resolveXrTextureSize(8, 4096)).toEqual({ width: 2048, height: 1024 });
    expect(resolveXrTextureSize(8, 1600)).toEqual({ width: 1600, height: 800 });
  });
});
