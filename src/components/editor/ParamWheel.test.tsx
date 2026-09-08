import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  return document.querySelector<HTMLElement>(".param-wheel__hub")!;
}
/** The hub is a cluster now: a read-out plus real buttons. */
function hubBack() {
  return document.querySelector<HTMLButtonElement>('.param-wheel__hub-button[data-role="back"]')!;
}
function hubCommit() {
  return document.querySelector<HTMLButtonElement>('.param-wheel__hub-button[data-role="commit"]');
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
  // Every field these tests assert on. Leaving `past` and `previewLayerId`
  // out let one test's undo history and one test's uncommitted audition leak
  // into the next.
  useStore.setState({
    layers: [], past: [], future: [],
    selectedLayerId: null, previewLayerId: null, paramWheelOpen: false,
  });
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
    act(() => { hubBack().click(); });
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

  it("keeps an ordinary ring inside its breadth budget", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    expect(screen.getAllByRole("menuitem").length).toBeLessThanOrEqual(8);
    tapSlot("Tune");
    expect(screen.getAllByRole("menuitem").length).toBeLessThanOrEqual(8);
  });

  it("gives the effect catalogue the outer ring, at roughly twice the density", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    const outer = document.querySelectorAll('.param-wheel__slot[data-ring="0"]');
    // The outermost ring has the circumference to carry twice an ordinary
    // ring: 12 entries plus two chevrons.
    expect(outer.length).toBeGreaterThan(8);
    expect(outer.length).toBeLessThanOrEqual(14);
    // ...and it pages rather than truncating.
    expect(document.querySelector(".param-wheel__page")?.textContent).toMatch(/1 \/ \d+/);
  });

  it("branches into a section and back out again through the hub", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    expect(hub().textContent).toContain("PARAMS");
    tapSlot("Layers");
    expect(hubBack().getAttribute("aria-label")).toMatch(/^Back to/);
    act(() => { hubBack().click(); });
    expect(hub().textContent).toContain("PARAMS");
    // At the root the hub closes instead of going up.
    act(() => { hubBack().click(); });
    expect(useStore.getState().paramWheelOpen).toBe(false);
  });

  it("auditions an effect on tap without keeping it", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");

    // It is on the frame...
    const state = useStore.getState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].effectId).toBe("pixelSort");
    // ...but it is only being tried on.
    expect(state.previewLayerId).toBe(state.layers[0].id);
    expect(state.past).toHaveLength(0);
  });

  it("keeps it when the hub's commit button is tapped", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    // Nothing to keep yet, so the button is there but inert.
    expect(hubCommit()).toBeTruthy();
    expect(hubCommit()!.disabled).toBe(true);

    tapSlot("Pixel Sort");
    expect(hubCommit()!.disabled).toBe(false);
    act(() => { hubCommit()!.click(); });

    const state = useStore.getState();
    expect(state.previewLayerId).toBeNull();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].effectId).toBe("pixelSort");
  });

  it("drops an audition the user walks away from", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");
    expect(useStore.getState().layers).toHaveLength(1);
    act(() => { hubBack().click(); });
    expect(useStore.getState().layers).toHaveLength(0);
    expect(useStore.getState().previewLayerId).toBeNull();
  });

  it("puts the auditioned effect's own controls on a ring further in", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");
    const inner = [...document.querySelectorAll('.param-wheel__slot[data-ring="1"]')]
      .map(node => node.querySelector("[role='menuitem']")?.getAttribute("aria-label")?.split(" — ")[0]);
    // Level, plus every parameter the effect declares — reachable without
    // leaving the catalogue.
    expect(inner).toContain("Level");
    for (const param of EFFECTS_BY_ID.pixelSort.params) expect(inner).toContain(param.label);
  });

  it("reaches the selected layer's real parameters from Tune", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    for (const param of EFFECTS_BY_ID.pixelSort.params) expect(slotNamed(param.label)).toBeTruthy();
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

describe("ParamWheel — keyboard", () => {
  const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ...init })); });

  it("walks around the ring and wraps, because a ring has no ends", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    const first = document.querySelector(".param-wheel__slot[data-highlighted]");
    expect(first).toBeNull();
    key("ArrowRight");
    const highlighted = () =>
      document.querySelector<HTMLElement>(".param-wheel__slot[data-highlighted] .param-wheel__caption")?.textContent;
    const start = highlighted();
    expect(start).toBeTruthy();
    key("ArrowLeft");
    key("ArrowRight");
    expect(highlighted()).toBe(start);
    // All the way round and back to where it began.
    const count = screen.getAllByRole("menuitem").length;
    for (let i = 0; i < count; i++) key("ArrowRight");
    expect(highlighted()).toBe(start);
  });

  it("activates the highlighted slot with Enter", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    key("ArrowRight");
    key("Enter");
    // The first param is now engaged, so the hub reads its value.
    expect(document.querySelector(".param-wheel__value")).not.toBeNull();
  });

  it("nudges an engaged value with the arrows instead of moving the highlight", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    tapSlot("Amount");
    const before = useStore.getState().layers[0].params.amount;
    key("ArrowUp");
    const after = useStore.getState().layers[0].params.amount;
    expect(after).toBeGreaterThan(before);
    key("ArrowDown");
    expect(useStore.getState().layers[0].params.amount).toBeCloseTo(before);
  });

  it("takes a bigger step with Shift, and never leaves the range", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    tapSlot("Amount");
    const before = useStore.getState().layers[0].params.amount;
    key("ArrowUp", { shiftKey: true });
    expect(useStore.getState().layers[0].params.amount - before).toBeGreaterThan(0.05);
    for (let i = 0; i < 40; i++) key("ArrowUp", { shiftKey: true });
    expect(useStore.getState().layers[0].params.amount).toBeLessThanOrEqual(1);
    for (let i = 0; i < 80; i++) key("ArrowDown", { shiftKey: true });
    expect(useStore.getState().layers[0].params.amount).toBeGreaterThanOrEqual(0);
  });

  it("steps back up the tree with Backspace", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    expect(hubBack().getAttribute("aria-label")).toMatch(/^Back to/);
    key("Backspace");
    expect(hub().textContent).toContain("PARAMS");
  });

  it("pages a long ring with PageUp / PageDown", () => {
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    const readPage = () => document.querySelector(".param-wheel__page")!.textContent;
    expect(readPage()).toMatch(/^1 \//);
    key("PageDown");
    expect(readPage()).toMatch(/^2 \//);
    key("PageUp");
    expect(readPage()).toMatch(/^1 \//);
  });

  it("leaves modified shortcuts alone, so browser chords still work", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    key("ArrowRight");
    const before = document.querySelector<HTMLElement>(".param-wheel__slot[data-highlighted]")?.dataset;
    key("ArrowRight", { metaKey: true });
    const after = document.querySelector<HTMLElement>(".param-wheel__slot[data-highlighted]")?.dataset;
    expect(after?.highlighted).toBe(before?.highlighted);
  });
});

describe("ParamWheel — focus is not engagement", () => {
  it("hovering a parameter does not arm the rim", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    const slot = slotNamed("Amount")!;
    act(() => { slot.focus(); });
    // Focused, so the label reads in the hub...
    expect(document.querySelector(".param-wheel__slot[data-highlighted]")).not.toBeNull();
    // ...but nothing is wired to the rim until it is deliberately engaged.
    expect(document.querySelector(".param-wheel__slot[data-engaged]")).toBeNull();
    expect(document.querySelector(".param-wheel__value")).toBeNull();
  });

  it("engaging marks the slot, and branching away unwires the rim", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    tapSlot("Amount");
    expect(document.querySelector(".param-wheel__slot[data-engaged]")).not.toBeNull();
    act(() => { hubBack().click(); });
    expect(document.querySelector(".param-wheel__slot[data-engaged]")).toBeNull();
  });

  it("remembers which parameter the audio branch is about after leaving Tune", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    tapSlot("Amount");
    act(() => { hubBack().click(); });      // back to root
    tapSlot("Audio Map");
    // The branch knows the parameter even though the rim was unwired.
    expect(document.querySelector("[role='menu']")!.getAttribute("aria-label")).toContain("Amount");
    tapSlot("Bass");
    const map = useStore.getState().layers[0].audioMaps?.amount;
    expect(map?.source).toBe("bass");
  });
});

describe("ParamWheel — the amount dot", () => {
  const dot = () => document.querySelector<HTMLElement>(".param-wheel__dot");

  /** Pointer events jsdom doesn't construct with coordinates on its own. */
  function pointer(type: string, x: number, y: number, id = 1) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: id },
      pointerType: { value: "touch" },
    });
    return event;
  }

  it("shows exactly one dot — on the slot under attention, never a ring of them", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    expect(dot()).toBeNull();          // nothing under attention yet
    act(() => { slotNamed("Amount")!.focus(); });
    expect(document.querySelectorAll(".param-wheel__dot")).toHaveLength(1);
  });

  it("carries the value as an accessible slider, so it is not mouse-only", () => {
    useStore.getState().addLayer("pixelSort");
    useStore.setState(state => ({
      layers: state.layers.map(l => ({ ...l, params: { ...l.params, amount: 0.25 } })),
    }));
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    act(() => { slotNamed("Amount")!.focus(); });
    const control = dot()!;
    expect(control.getAttribute("role")).toBe("slider");
    expect(control.getAttribute("aria-valuenow")).toBe("25");
    expect(control.getAttribute("aria-label")).toContain("Amount");
  });

  it("sits at an angle that tracks the value — its position is the read-out", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    act(() => { slotNamed("Amount")!.focus(); });
    const angleAt = (value: number) => {
      act(() => {
        useStore.setState(state => ({
          layers: state.layers.map(l => ({ ...l, params: { ...l.params, amount: value } })),
        }));
      });
      return dot()!.style.getPropertyValue("--dot-angle");
    };
    expect(angleAt(0)).toBe("0deg");
    const low = parseFloat(angleAt(0.25));
    const high = parseFloat(angleAt(0.9));
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it("dims the rest of the wheel while dragging, so a widened arc reads as a read-out", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    act(() => { slotNamed("Amount")!.focus(); });
    const layer = document.querySelector<HTMLElement>(".param-wheel-layer")!;
    expect(layer.dataset.dotDragging).toBeUndefined();
    act(() => { dot()!.dispatchEvent(pointer("pointerdown", 300, 300)); });
    expect(layer.dataset.dotDragging).toBe("true");
    act(() => { dot()!.dispatchEvent(pointer("pointerup", 300, 300)); });
    expect(layer.dataset.dotDragging).toBeUndefined();
  });

  it("engages the slot it belongs to when grabbed", () => {
    useStore.getState().addLayer("pixelSort");
    render(<ParamWheel />);
    summon();
    tapSlot("Tune");
    act(() => { slotNamed("Amount")!.focus(); });
    act(() => { dot()!.dispatchEvent(pointer("pointerdown", 300, 300)); });
    expect(document.querySelector(".param-wheel__slot[data-engaged]")).not.toBeNull();
  });
});

describe("ParamWheel — long-press keeps an effect", () => {
  afterEach(() => vi.useRealTimers());

  it("commits without a trip to the hub", () => {
    vi.useFakeTimers();
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");

    const entry = slotNamed("Pixel Sort")!;
    act(() => { entry.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(600); });

    const state = useStore.getState();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].effectId).toBe("pixelSort");
    expect(state.previewLayerId).toBeNull();   // kept, not still being tried
  });

  it("a short tap still only auditions", () => {
    vi.useFakeTimers();
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");

    const entry = slotNamed("Pixel Sort")!;
    act(() => { entry.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { entry.dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); });
    act(() => { entry.click(); });
    act(() => { vi.advanceTimersByTime(900); });

    expect(useStore.getState().previewLayerId).not.toBeNull();
  });
});

describe("ParamWheel — regressions from the post-merge review", () => {
  it("discards an audition when the wheel unmounts, rather than stranding it", () => {
    const view = render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");
    expect(useStore.getState().layers).toHaveLength(1);
    expect(useStore.getState().previewLayerId).not.toBeNull();

    view.unmount();

    // Without the cleanup this left the layer in the stack with no undo entry
    // to remove it, and previewLayerId pointing at it — so the next audition
    // would silently delete a layer the user thought was theirs.
    expect(useStore.getState().layers).toHaveLength(0);
    expect(useStore.getState().previewLayerId).toBeNull();
  });

  it("keeps parameter tweaks made while auditioning, whichever way you commit", () => {
    // Long-press used to re-preview from the effect's defaults before
    // committing, throwing away exactly the tuning the hub's + button kept.
    render(<ParamWheel />);
    summon();
    tapSlot("Add FX");
    tapSlot("Data Corruption");
    tapSlot("Pixel Sort");

    const id = useStore.getState().previewLayerId!;
    act(() => { useStore.getState().setParam(id, "amount", 0.87); });

    const entry = slotNamed("Pixel Sort")!;
    vi.useFakeTimers();
    act(() => { entry.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(600); });
    vi.useRealTimers();

    const state = useStore.getState();
    expect(state.previewLayerId).toBeNull();
    expect(state.layers).toHaveLength(1);
    expect(state.layers[0].params.amount).toBe(0.87);
  });
});
