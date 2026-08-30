import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuadrantSurface } from "./QuadrantSurface";
import { useStore } from "@/store/useStore";
import { cancelLayerCrossfade } from "@/engine/layerCrossfade";

/**
 * The store tests cover mosh() itself; these cover the wiring, which is the
 * part that compiles cleanly and still does nothing. The interaction contract
 * is that a plain tap always moshes the whole stack — same as the Mosh
 * button, Shift+M, and desktop double-click — regardless of where on the
 * surface it lands.
 *
 * Layer identity churns on every mosh (compose() mints fresh layer ids), and
 * the crossfade this triggers synchronously overwrites `layers` with a
 * transitional blend the instant `commit()` returns (see
 * layerCrossfade.ts's `tick()`), so a same-tick assertion can't read the
 * settled post-mosh stack out of `layers`. `past.length` (mosh's undo push)
 * and `lastRoleRoll` (which mosh always resets to null, unlike the old
 * per-role reroll) are set directly by `commit()` and never touched by the
 * crossfade's `setLayersRaw`, so they're what these tests read instead.
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
    // A tap now always goes through crossfadeLayers, whose in-flight fade is
    // tracked in a module-level rAF handle — without cancelling it here, a
    // fade left running past the end of one test can tick (and mutate
    // `layers`) during a later, unrelated test.
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
  afterEach(() => {
    cancelLayerCrossfade();
    cleanup();
  });

  it("mounts a surface that owns the canvas gestures", () => {
    render(<QuadrantSurface />);
    expect(screen.getByLabelText(/Visual instrument/i)).toBeTruthy();
  });

  it("moshes the whole stack on a tap, wherever the tap lands", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const pastBefore = useStore.getState().past.length;
    tap(el, 40, 700); // bottom-left — position never decides what a tap does

    expect(useStore.getState().past.length).toBe(pastBefore + 1);
    // mosh() always clears lastRoleRoll — the old per-role reroll left it set.
    expect(useStore.getState().lastRoleRoll).toBeNull();
  });

  it("moshes again on every tap, even when every tap lands on the same spot", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const pastBefore = useStore.getState().past.length;
    for (let i = 0; i < 3; i++) tap(el, 200, 400); // dead centre, every time

    // Each tap is a full, independent mosh — the finger never moves, the
    // stack still rerolls every time instead of only the first.
    expect(useStore.getState().past.length).toBe(pastBefore + 3);
  });

  it("skips a locked voice so a kept look survives repeated tapping", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const kept = useStore.getState().layers[0];
    useStore.getState().toggleLocked(kept.id);

    for (let i = 0; i < 5; i++) tap(el, 200, 400);

    expect(useStore.getState().layers[0].effectId).toBe(kept.effectId);
  });

  it("still moshes in fresh layers on top when every existing layer is locked", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    const lockedIds = useStore.getState().layers.map(l => l.id);
    for (const id of lockedIds) useStore.getState().toggleLocked(id);

    const pastBefore = useStore.getState().past.length;
    tap(el, 200, 400);

    // A full mosh, unlike the old per-role reroll, never refuses to roll —
    // it composes a fresh set of layers on top of whatever is locked.
    expect(useStore.getState().past.length).toBe(pastBefore + 1);
    for (const id of lockedIds) {
      expect(useStore.getState().layers.some(l => l.id === id && l.locked)).toBe(true);
    }
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
