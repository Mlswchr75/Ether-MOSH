import { describe, expect, it } from "vitest";
import { overlayPerformanceBudget } from "./performanceBudget";

describe("overlayPerformanceBudget", () => {
  it("uses a conservative Lottie swarm cap on coarse low-core devices", () => {
    expect(overlayPerformanceBudget({ coarse: true, cores: 4 }).lottieSwarmCap).toBe(6);
  });

  it("allows a larger desktop Lottie swarm budget", () => {
    expect(overlayPerformanceBudget({ coarse: false, cores: 8 }).lottieSwarmCap).toBe(12);
  });
});
