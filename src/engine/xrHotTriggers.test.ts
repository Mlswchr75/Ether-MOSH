import { describe, expect, it, vi } from "vitest";
import { activateXrHotTrigger, getXrHotTriggers } from "./xrHotTriggers";

describe("Quest Hot Trigger bridge", () => {
  it("preserves live order and removes duplicated radial/rail controls", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-trigger-id="mosh"><button class="hot-trigger" aria-label="Mosh"></button></div>
      <div data-trigger-id="capture"><button class="hot-trigger" title="Capture"></button></div>
      <div data-trigger-id="mosh"><button class="hot-trigger" aria-label="Mosh duplicate"></button></div>
      <div data-trigger-id="locked"><button class="hot-trigger" disabled></button></div>`;
    expect(getXrHotTriggers(root)).toEqual([
      { id: "mosh", label: "Mosh" },
      { id: "capture", label: "Capture" },
    ]);
  });

  it("fires the existing enabled control", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-trigger-id="mosh"><button class="hot-trigger"></button></div>`;
    const click = vi.spyOn(root.querySelector("button")!, "click");
    expect(activateXrHotTrigger("mosh", root)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(activateXrHotTrigger("missing", root)).toBe(false);
  });
});
