import { describe, expect, it } from "vitest";
import { isInfoRevealSwipe, isUpwardInfoWheel } from "./homeDirectionalNav";

describe("home directional navigation", () => {
  it("recognizes upward wheel and trackpad intent", () => {
    expect(isUpwardInfoWheel(2, -18)).toBe(true);
    expect(isUpwardInfoWheel(20, -8)).toBe(false);
    expect(isUpwardInfoWheel(0, 18)).toBe(false);
  });

  it("maps a downward finger swipe to the page above", () => {
    expect(isInfoRevealSwipe(5, 80)).toBe(true);
    expect(isInfoRevealSwipe(80, 5)).toBe(false);
    expect(isInfoRevealSwipe(5, -80)).toBe(false);
  });
});
