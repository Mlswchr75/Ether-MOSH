import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuadrantSurface } from "./QuadrantSurface";
import { useStore } from "@/store/useStore";
import { cancelLayerCrossfade } from "@/engine/layerCrossfade";

/**
 * The store tests cover the rotation itself; these cover the wiring, which is
 * the part that compiles cleanly and still does nothing. The interaction
 * contract is that position never decides what a tap does: every clean tap is
 * the same full Art Director shuffle as Space.
 */

/** jsdom has no layout, so give the surface a real box to measure against. */
function stubBox() {
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800, toJSON: () => ({}) } as DOMRect;
  };
}

function press(el: Element, x: number, y: number, id = 1) {
  fireEvent.pointerDown(el, { pointerId: id, clientX: x, clientY: y, button: 0 });
}
function lift(el: Element, x: number, y: number, id = 1) {
  fireEvent.pointerUp(el, { pointerId: id, clientX: x, clientY: y });
}
function tap(el: Element, x: number, y: number) {
  press(el, x, y);
  lift(el, x, y);
}

describe("QuadrantSurface", () => {
  beforeEach(() => {
    cancelLayerCrossfade();
    window.localStorage.clear();
    stubBox();
    // setPointerCapture doesn't exist in jsdom; the component guards it, but
    // stubbing keeps the console quiet.
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    useStore.setState({
      layers: [],
      selectedLayerId: null,
      past: [], future: [],
      currentLook: null,
      currentBrief: null,
      lastRoleRoll: null,
      recentFormEffects: [],
      recentOtherEffects: [],
      recentLooks: [],
      showBeforeAfter: false,
      isolationMode: "off",
      stickerMode: false,
    });
    useStore.getState().mosh();
  });

  // This project does not enable testing-library's global auto-cleanup, so
  // without this every render stacks up and the queries go ambiguous.
  afterEach(() => { cancelLayerCrossfade(); cleanup(); });

  it("mounts a surface that owns the canvas gestures", () => {
    render(<QuadrantSurface />);
    expect(screen.getByLabelText(/Visual instrument/i)).toBeTruthy();
  });

  it("shuffles the full unlocked stack on a tap, wherever the tap lands", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const before = useStore.getState().layers.map(l => l.id);
    const past = useStore.getState().past.length;
    tap(el, 40, 700);
    const after = useStore.getState().layers.map(l => l.id);

    expect(useStore.getState().past.length).toBe(past + 1);
    expect(after.some(id => !before.includes(id) && id !== "__transition_boundary__")).toBe(true);
    expect(useStore.getState().lastRoleRoll).toBeNull();
  });

  it("creates a new undoable composition when repeated at the same spot", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const initialPast = useStore.getState().past.length;
    for (let i = 0; i < 3; i++) {
      tap(el, 200, 400);
    }
    expect(useStore.getState().past.length).toBe(initialPast + 3);
    expect(useStore.getState().lastRoleRoll).toBeNull();
  });

  it("skips a locked voice so a kept look survives repeated tapping", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const kept = useStore.getState().layers[0];
    useStore.getState().toggleLocked(kept.id);

    for (let i = 0; i < 5; i++) tap(el, 200, 400);

    expect(useStore.getState().layers[0].effectId).toBe(kept.effectId);
  });

  it("still executes with every layer locked while preserving those layers", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    for (const layer of useStore.getState().layers) useStore.getState().toggleLocked(layer.id);

    const before = useStore.getState().layers.map(layer => ({ id: layer.id, effectId: layer.effectId }));
    tap(el, 200, 400);

    expect(useStore.getState().layers.filter(layer => layer.locked).map(layer => ({ id: layer.id, effectId: layer.effectId }))).toEqual(before);
    expect(document.querySelector("[data-role-readout]")?.textContent).toContain("new composition");
  });

  it("sweeps parameters on a drag instead of re-rolling", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const before = useStore.getState().layers.map(l => l.effectId);
    press(el, 200, 400);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 340, clientY: 300 });
    lift(el, 340, 300);

    // A drag must not roll anything — it shapes what is already there.
    expect(useStore.getState().layers.map(l => l.effectId)).toEqual(before);
  });

  it("does not roll when the press was long enough to belong to the menu-rack hold", async () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const before = useStore.getState().layers.map(l => l.effectId);
    press(el, 200, 400);
    await new Promise(r => setTimeout(r, 450)); // past TAP_MS
    lift(el, 200, 400);

    expect(useStore.getState().layers.map(l => l.effectId)).toEqual(before);
  });

  it("stands down when another surface owns the canvas", () => {
    useStore.setState({ showBeforeAfter: true });
    render(<QuadrantSurface />);
    expect(screen.queryByLabelText(/Visual instrument/i)).toBeNull();
  });
});
