import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { KaossSurface } from "./KaossSurface";
import { useKaossStore } from "@/store/kaossStore";

/** jsdom has no layout, so give the surface a real box to measure against. */
function stubBox() {
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800, toJSON: () => ({}) } as DOMRect;
  };
}

// jsdom has no PointerEvent constructor — synthesize one on a MouseEvent, the
// same trick HotTriggers' own pointer tests use.
function press(el: Element, x: number, y: number, pointerType: string, id = 1) {
  const ev = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperties(ev, { pointerId: { value: id }, pointerType: { value: pointerType } });
  el.dispatchEvent(ev);
}
function lift(el: Element, x: number, y: number, pointerType: string, id = 1) {
  const ev = new MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(ev, { pointerId: { value: id }, pointerType: { value: pointerType } });
  el.dispatchEvent(ev);
}

describe("KaossSurface — dead zone + click/tap parity", () => {
  beforeEach(() => {
    stubBox();
    (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
    useKaossStore.setState({
      instrumentEnabled: true,
      synthEnabled: true,
      sensorsEnabled: false,
      showHud: true,
      orb: { x: 0.5, y: 0.5, active: false },
      noteLabel: "—",
    });
  });

  afterEach(() => { cleanup(); useKaossStore.getState().setInstrumentEnabled(false); });

  it("a press landing in the center dead zone never lands a hit", () => {
    render(<KaossSurface />);
    const el = document.querySelector(".z-30")!;
    // Center of the 400x800 stubbed box.
    press(el, 200, 400, "mouse");
    lift(el, 200, 400, "mouse");
    expect(useKaossStore.getState().noteLabel).toBe("—");
    expect(useKaossStore.getState().orb.active).toBe(false);
  });

  it("a mouse click and a touch tap at the same rim point resolve identically", () => {
    const { unmount } = render(<KaossSurface />);
    const el = document.querySelector(".z-30")!;

    press(el, 360, 80, "mouse", 1); // near the top-right rim, outside the dead zone
    const mouseNote = useKaossStore.getState().noteLabel;
    const mouseOrb = useKaossStore.getState().orb;
    lift(el, 360, 80, "mouse", 1);
    unmount();

    useKaossStore.setState({ orb: { x: 0.5, y: 0.5, active: false }, noteLabel: "—" });
    render(<KaossSurface />);
    const el2 = document.querySelector(".z-30")!;
    press(el2, 360, 80, "touch", 2);
    const touchNote = useKaossStore.getState().noteLabel;
    const touchOrb = useKaossStore.getState().orb;
    lift(el2, 360, 80, "touch", 2);

    expect(touchNote).toBe(mouseNote);
    expect(touchOrb).toEqual(mouseOrb);
  });
});
