import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParamWheel } from "./ParamWheel";
import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";

/** Open the wheel the way the two-finger hold does. */
function summon(x = 200, y = 500) {
  act(() => {
    window.dispatchEvent(new CustomEvent("mosh:open-param-wheel", { detail: { x, y } }));
  });
}

function hub() {
  return document.querySelector<HTMLButtonElement>(".param-wheel__hub")!;
}
function slotLabels() {
  return [...document.querySelectorAll<HTMLElement>(".param-wheel__caption")].map(n => n.textContent);
}
/** A slot's aria-label is "<label> — <detail>", so match the label exactly:
 *  "Layer" and "Layers" are two different root slots. */
function slotNamed(label: string) {
  return screen.getAllByRole("menuitem")
    .find(node => (node.getAttribute("aria-label") ?? "").split(" — ")[0] === label);
}
function tapSlot(label: string) {
  const button = slotNamed(label);
  if (!button) throw new Error(`no slot labelled ${label}; have: ${slotLabels().join(", ")}`);
  act(() => { button.click(); });
}

beforeEach(() => {
  useStore.setState({ layers: [], selectedLayerId: null, paramWheelOpen: false });
});
afterEach(() => {
  cleanup();
  act(() => { window.dispatchEvent(new Event("mosh:close-param-wheel")); });
});

describe("ParamWheel", () => {
  it("stays out of the way until it is summoned", () => {
    render(<ParamWheel />);
    expect(document.querySelector(".param-wheel-layer")).toBeNull();
    summon();
    expect(document.querySelector<HTMLElement>(".param-wheel-layer")!.dataset.phase).toBe("open");
  });

  it("publishes its open state, so canvas gestures know to stand down", () => {
    render(<ParamWheel />);
    summon();
    expect(useStore.getState().paramWheelOpen).toBe(true);
    act(() => { hub().click(); });
    expect(useStore.getState().paramWheelOpen).toBe(false);
  });

  it("opens under the fingers that summoned it, not at a fixed centre", () => {
    render(<ParamWheel />);
    summon(120, 700);
    const wheel = document.querySelector<HTMLElement>(".param-wheel")!;
    // Clamped to keep the ring on screen, but still following the gesture
    // rather than snapping to the middle of the viewport.
    expect(parseFloat(wheel.style.top)).toBeGreaterThan(window.innerHeight / 2);
  });

  it("toggles, and the toggle survives being fired from the other wheel", () => {
    render(<ParamWheel />);
    act(() => { window.dispatchEvent(new Event("mosh:toggle-param-wheel")); });
    expect(useStore.getState().paramWheelOpen).toBe(true);
    act(() => { window.dispatchEvent(new Event("mosh:toggle-param-wheel")); });
    expect(useStore.getState().paramWheelOpen).toBe(false);
  });

  it("closes the hot-trigger wheel when it opens — never two wheels at once", () => {
    render(<ParamWheel />);
    let closed = false;
    const listener = () => { closed = true; };
    window.addEventListener("mosh:close-hot-triggers", listener);
    summon();
    window.removeEventListener("mosh:close-hot-triggers", listener);
    expect(closed).toBe(true);
  });

  it("never draws more slots than one ring's breadth budget allows", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    // The effect catalogue is the worst case: ~30 effects in one category.
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    const slots = screen.getAllByRole("menuitem");
    expect(slots.length).toBeLessThanOrEqual(8);
    // ...and it pages rather than truncating.
    expect(document.querySelector(".param-wheel__page")?.textContent).toMatch(/1 \/ \d+/);
  });

  it("branches into a section and back out again through the hub", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    expect(hub().textContent).toContain("PARAMS");
    tapSlot("Layers");
    expect(hub().getAttribute("aria-label")).toMatch(/^Back to/);
    act(() => { hub().click(); });
    expect(hub().textContent).toContain("PARAMS");
    // At the root the hub closes instead of going up.
    act(() => { hub().click(); });
    expect(useStore.getState().paramWheelOpen).toBe(false);
  });

  it("reaches the selected layer's real parameters, and adding a layer works", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");
    const layers = useStore.getState().layers;
    expect(layers).toHaveLength(1);
    expect(layers[0].effectId).toBe("pixelSort");

    act(() => { hub().click(); });   // back to categories
    act(() => { hub().click(); });   // back to root
    tapSlot("Tune");
    const params = EFFECTS_BY_ID.pixelSort.params.map(p => p.label);
    for (const label of params) expect(slotNamed(label)).toBeTruthy();
  });

  it("engages a parameter on tap and shows its live value in the hub", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    tapSlot("Amount");
    const value = document.querySelector(".param-wheel__value");
    expect(value).not.toBeNull();
    expect(value!.textContent).toBe(
      (useStore.getState().layers[0].params.amount ?? 0.5).toFixed(2),
    );
    // Tapping it again lets go, so the rim goes back to paging.
    tapSlot("Amount");
    expect(document.querySelector(".param-wheel__value")).toBeNull();
  });

  it("drives real store writes — layer ops act on the selected layer", () => {
    useStore.getState().addLayer("pixelSort");
    const id = useStore.getState().layers[0].id;
    render(<ParamWheel />);
    summon();
    tapSlot("Stack");
    tapSlot("Hide");
    expect(useStore.getState().layers.find(l => l.id === id)?.hidden).toBe(true);
    tapSlot("Show");
    expect(useStore.getState().layers.find(l => l.id === id)?.hidden).toBe(false);
    tapSlot("Delete layer");
    expect(useStore.getState().layers).toHaveLength(0);
  });

  it("says what to do instead of dead-ending when there is nothing to tune", () => {
    render(<ParamWheel />);
    summon();
    const tune = slotNamed("Tune")!;
    expect(tune.getAttribute("aria-disabled")).toBe("true");
    expect(hub().textContent).toContain("add an effect to begin");
  });

  it("labels every slot for screen readers, value included", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    for (const slot of screen.getAllByRole("menuitem")) {
      expect(slot.getAttribute("aria-label")).toBeTruthy();
    }
    const menu = document.querySelector<HTMLElement>("[role='menu']")!;
    expect(within(menu).getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(menu.getAttribute("aria-label")).toContain("Tune");
  });

  it("closes on Escape from the root", () => {
    render(<ParamWheel />);
    summon();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(useStore.getState().paramWheelOpen).toBe(false);
  });
});
