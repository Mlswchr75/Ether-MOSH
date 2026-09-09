import { describe, expect, it } from "vitest";
import { enhanceHotTriggerRail, holdStepDelay, nextLoopIndex, wrapIndex } from "./hotTriggerMobile";

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

describe("enhanceHotTriggerRail", () => {
  const makeRail = () => {
    document.body.innerHTML = `<div class="hot-trigger-rail"></div>`;
    return document.querySelector<HTMLElement>(".hot-trigger-rail")!;
  };

  it("wraps the rail in a shell with an arrow at each end", () => {
    const rail = makeRail();
    enhanceHotTriggerRail(rail);
    const shell = document.querySelector(".hot-trigger-mobile-shell")!;
    expect(shell).not.toBeNull();
    expect(shell.contains(rail)).toBe(true);
    expect(shell.querySelectorAll(".hot-trigger-mobile-arrow")).toHaveLength(2);
    expect(document.querySelector(".hot-trigger-mobile-arrow--up")).not.toBeNull();
    expect(document.querySelector(".hot-trigger-mobile-arrow--down")).not.toBeNull();
  });

  it("is idempotent — a re-render must not stack a second set of arrows", () => {
    const rail = makeRail();
    enhanceHotTriggerRail(rail);
    enhanceHotTriggerRail(rail);
    enhanceHotTriggerRail(rail);
    expect(document.querySelectorAll(".hot-trigger-mobile-arrow")).toHaveLength(2);
    expect(document.querySelectorAll(".hot-trigger-mobile-shell")).toHaveLength(1);
  });

  it("does nothing when there is no rail, which is the default case", () => {
    document.body.innerHTML = "";
    expect(() => enhanceHotTriggerRail(null)).not.toThrow();
    expect(() => enhanceHotTriggerRail(undefined)).not.toThrow();
    expect(document.querySelector(".hot-trigger-mobile-shell")).toBeNull();
  });

  it("labels the arrows for screen readers and opts them out of the long-press gesture", () => {
    enhanceHotTriggerRail(makeRail());
    for (const arrow of document.querySelectorAll<HTMLElement>(".hot-trigger-mobile-arrow")) {
      expect(arrow.getAttribute("aria-label")).toBeTruthy();
      // Without this the radial wheel's hold gesture starts under the arrow.
      expect(arrow.dataset.noLongpress).toBe("");
    }
  });

  it("steps the rail by dispatching a wheel event it already understands", () => {
    const rail = makeRail();
    enhanceHotTriggerRail(rail);
    const deltas: number[] = [];
    rail.addEventListener("wheel", (event) => deltas.push((event as WheelEvent).deltaY));

    const click = (selector: string) => {
      const arrow = document.querySelector<HTMLElement>(selector)!;
      arrow.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      arrow.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    };
    click(".hot-trigger-mobile-arrow--down");
    click(".hot-trigger-mobile-arrow--up");

    expect(deltas).toHaveLength(2);
    expect(deltas[0]).toBeGreaterThan(0);
    expect(deltas[1]).toBeLessThan(0);
  });
});
