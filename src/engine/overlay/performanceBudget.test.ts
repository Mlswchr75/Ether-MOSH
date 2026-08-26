import { describe, expect, it } from "vitest";
import { overlayPerformanceBudget } from "./performanceBudget";

describe("overlayPerformanceBudget", () => {
  it("uses conservative overlay and Forge budgets on coarse low-core devices", () => {
    const budget = overlayPerformanceBudget({ coarse: true, cores: 4 });
    expect(budget.lottieSwarmCap).toBe(6);
    expect(budget.forgeAnalysisDimension).toBe(192);
  });

  it("allows larger desktop overlay and Forge budgets", () => {
    const budget = overlayPerformanceBudget({ coarse: false, cores: 8 });
    expect(budget.lottieSwarmCap).toBe(12);
    expect(budget.forgeAnalysisDimension).toBe(256);
  });
});
