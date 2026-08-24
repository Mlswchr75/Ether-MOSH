import { describe, expect, it } from "vitest";
import { isVisualRoute, shouldMaintainSession } from "./mobileRuntime";

describe("mobile runtime policy", () => {
  it("recognizes visual routes", () => {
    expect(isVisualRoute("/edit")).toBe(true);
    expect(isVisualRoute("/forge")).toBe(true);
    expect(isVisualRoute("/pricing")).toBe(false);
  });

  it("maintains a visible active visual session", () => {
    expect(shouldMaintainSession({ pathname: "/edit", visible: true, fullscreen: false })).toBe(true);
    expect(shouldMaintainSession({ pathname: "/", visible: true, fullscreen: true })).toBe(true);
    expect(shouldMaintainSession({ pathname: "/edit", visible: false, fullscreen: false })).toBe(false);
  });
});
