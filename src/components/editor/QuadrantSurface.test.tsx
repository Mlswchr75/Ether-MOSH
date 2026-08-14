import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuadrantSurface } from "./QuadrantSurface";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { groupLayersByRole } from "@/engine/effectRoles";
import { useStore } from "@/store/useStore";

/**
 * The store tests cover the rotation itself; these cover the wiring, which is
 * the part that compiles cleanly and still does nothing. The interaction
 * contract is that position never decides what a tap does — the same tap in the
 * same spot has to keep advancing the rotation.
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
      recentEffects: [],
      recentLooks: [],
      showBeforeAfter: false,
      isolationMode: "off",
      stickerMode: false,
    });
    useStore.getState().mosh();
  });

  // This project does not enable testing-library's global auto-cleanup, so
  // without this every render stacks up and the queries go ambiguous.
  afterEach(cleanup);

  it("mounts a surface that owns the canvas gestures", () => {
    render(<QuadrantSurface />);
    expect(screen.getByLabelText(/Visual instrument/i)).toBeTruthy();
  });

  it("re-rolls a voice on a tap, wherever the tap lands", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const before = useStore.getState().layers.map(l => l.effectId);
    tap(el, 40, 700); // bottom-left — under the old model this was a fixed voice
    const after = useStore.getState().layers.map(l => l.effectId);

    expect(after.filter((id, i) => id !== before[i])).toHaveLength(1);
  });

  it("advances the rotation even when every tap lands on the same spot", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const hit: string[] = [];
    for (let i = 0; i < 3; i++) {
      tap(el, 200, 400); // dead centre, every time
      hit.push(useStore.getState().lastRoleRoll!.role);
    }
    // This is the whole design: the finger never moves, the voice still changes.
    expect(new Set(hit).size).toBe(3);
  });

  it("rerolls the selected Glow layer from any tap and advances the role target", () => {
    const onRoll = vi.fn();
    render(<QuadrantSurface onRoll={onRoll} />);
    const el = screen.getByLabelText(/Visual instrument/i);
    const before = structuredClone(useStore.getState().layers);

    fireEvent.click(screen.getByRole("button", { name: /Glow.*Finish/i }));
    tap(el, 40, 700);

    const after = useStore.getState().layers;
    const changed = after.filter((layer, index) => layer.effectId !== before[index].effectId);
    expect(changed).toHaveLength(1);
    expect(changed[0].role).toBe("finish");
    expect(after.filter(layer => layer.role !== "finish").map(layer => layer.effectId))
      .toEqual(before.filter(layer => layer.role !== "finish").map(layer => layer.effectId));
    expect(useStore.getState().roleCursor).toBe("grade");
    expect(onRoll).toHaveBeenCalledWith("finish");
    expect(document.querySelector("[data-role-readout]")?.textContent).toContain("GLOW");
  });

  it("tunes the selected Glow chip layer without changing effect identities", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    const glow = groupLayersByRole(useStore.getState().layers).finish[0];
    const before = structuredClone(useStore.getState().layers);

    fireEvent.click(screen.getByRole("button", { name: /Glow.*Finish/i }));
    fireEvent.click(screen.getByRole("button", { name: EFFECTS_BY_ID[glow.effectId].name }));
    press(el, 200, 400);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 340, clientY: 300 });
    lift(el, 340, 300);

    const after = useStore.getState().layers;
    const tuned = after.find(layer => layer.id === glow.id)!;
    const original = before.find(layer => layer.id === glow.id)!;
    expect({ params: tuned.params, opacity: tuned.opacity })
      .not.toEqual({ params: original.params, opacity: original.opacity });
    expect(after.map(layer => layer.effectId)).toEqual(before.map(layer => layer.effectId));
  });

  it("synchronizes a Glow card selection before a canvas drag from a Grade-selected stack", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    const glow = groupLayersByRole(useStore.getState().layers).finish[0];
    const before = structuredClone(useStore.getState().layers);

    expect(useStore.getState().selectedRole).toBe("grade");
    fireEvent.click(screen.getByRole("button", { name: /Glow.*Finish/i }));
    expect(useStore.getState().selectedLayerId).toBe(glow.id);
    press(el, 200, 400);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 340, clientY: 300 });
    lift(el, 340, 300);

    const after = useStore.getState().layers;
    expect(after.find(layer => layer.id === glow.id)).not.toMatchObject(
      before.find(layer => layer.id === glow.id)!,
    );
    expect(after.filter(layer => layer.id !== glow.id).map(layer => ({ id: layer.id, params: layer.params, opacity: layer.opacity })))
      .toEqual(before.filter(layer => layer.id !== glow.id).map(layer => ({ id: layer.id, params: layer.params, opacity: layer.opacity })));
    expect(after.map(layer => layer.effectId)).toEqual(before.map(layer => layer.effectId));
  });

  it("tunes only the selected repeated Glitch chip sibling", () => {
    useStore.getState().mosh("interdimensional");
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    const accents = groupLayersByRole(useStore.getState().layers).accent;
    const target = accents[1];
    const before = structuredClone(useStore.getState().layers);

    fireEvent.click(screen.getByRole("button", { name: /Glitch.*Accent/i }));
    fireEvent.click(screen.getByRole("button", { name: EFFECTS_BY_ID[target.effectId].name }));
    press(el, 200, 400);
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 340, clientY: 300 });
    lift(el, 340, 300);

    const after = useStore.getState().layers;
    expect(after.find(layer => layer.id === target.id)).not.toMatchObject(
      before.find(layer => layer.id === target.id)!,
    );
    expect(after.filter(layer => layer.id !== target.id).map(layer => ({ id: layer.id, params: layer.params, opacity: layer.opacity })))
      .toEqual(before.filter(layer => layer.id !== target.id).map(layer => ({ id: layer.id, params: layer.params, opacity: layer.opacity })));
    expect(after.map(layer => layer.effectId)).toEqual(before.map(layer => layer.effectId));
  });

  it("skips a locked voice so a kept look survives repeated tapping", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);

    const kept = useStore.getState().layers[0];
    useStore.getState().toggleLocked(kept.id);

    for (let i = 0; i < 5; i++) tap(el, 200, 400);

    expect(useStore.getState().layers[0].effectId).toBe(kept.effectId);
  });

  it("reads out plain all roles locked feedback when no role can roll", () => {
    render(<QuadrantSurface />);
    const el = screen.getByLabelText(/Visual instrument/i);
    for (const layer of useStore.getState().layers) useStore.getState().toggleLocked(layer.id);

    tap(el, 200, 400);

    expect(document.querySelector("[data-role-readout]")?.textContent).toContain("all roles locked");
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

  it("fences role rail pointer lifecycles from canvas rerolls", () => {
    const onRoll = vi.fn();
    render(<QuadrantSurface onRoll={onRoll} />);
    const before = structuredClone(useStore.getState().layers);

    const dismiss = screen.getByRole("button", { name: "Dismiss role controls hint" });
    fireEvent.pointerDown(dismiss, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(dismiss, { pointerId: 1, clientX: 20, clientY: 20 });
    fireEvent.click(dismiss);

    const glow = screen.getByRole("button", { name: /Glow.*Finish/i });
    fireEvent.pointerDown(glow, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(glow, { pointerId: 2, clientX: 20, clientY: 20 });
    fireEvent.click(glow);

    const strip = screen.getByLabelText(/Glow Finish controls/i);
    fireEvent.pointerDown(strip, { pointerId: 3, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(strip, { pointerId: 3, clientX: 24, clientY: 24 });
    fireEvent.pointerUp(strip, { pointerId: 3, clientX: 24, clientY: 24 });

    expect(useStore.getState().layers).toEqual(before);
    expect(onRoll).not.toHaveBeenCalled();
  });
});
