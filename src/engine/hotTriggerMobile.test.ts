import { describe, expect, it } from "vitest";
import { holdStepDelay, nextLoopIndex, wrapIndex } from "./hotTriggerMobile";

describe("hot trigger mobile reel", () => {
  it("wraps endlessly in either direction", () => {
    expect(nextLoopIndex(11, 1, 12)).toBe(0);
    expect(nextLoopIndex(0, -1, 12)).toBe(11);
    expect(wrapIndex(-13, 12)).toBe(11);
  });

  it("accelerates a held arrow without becoming uncontrollable", () => {
    expect(holdStepDelay(200)).toBe(145);
    expect(holdStepDelay(900)).toBe(105);
    expect(holdStepDelay(1600)).toBe(72);
  });
});
