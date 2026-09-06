import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { useProximityIdle } from "./useProximityIdle";

/** A stand-in for the panel, parked in the top-right like the real one. */
function panelRef(rect: Partial<DOMRect> = {}) {
  const el = document.createElement("section");
  el.getBoundingClientRect = () => ({
    left: 800, right: 1000, top: 50, bottom: 400,
    width: 200, height: 350, x: 800, y: 50, toJSON: () => ({}),
    ...rect,
  }) as DOMRect;
  document.body.appendChild(el);
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement | null }).current = el;
  return ref;
}

const pointer = (type: "pointermove" | "pointerdown", x: number, y: number) => {
  act(() => {
    window.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y }));
  });
};

describe("useProximityIdle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ""; });

  it("hides after the idle window with no pointer activity", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(2_600); });
    expect(result.current).toBe(true);
  });

  /* The whole point: the app stays drivable from the keyboard without ever
     putting chrome back over a full-screen visual. This is the one behaviour
     that separates this from the general idle-fade hook. */
  it("never reveals for the keyboard, however much you type", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    act(() => { vi.advanceTimersByTime(2_600); });
    expect(result.current).toBe(true);

    act(() => {
      for (const key of ["Space", "KeyM", "Enter", "ArrowUp"]) {
        window.dispatchEvent(new KeyboardEvent("keydown", { code: key }));
      }
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toBe(true);
  });

  it("stays hidden for a pointer nowhere near it", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    act(() => { vi.advanceTimersByTime(2_600); });
    pointer("pointermove", 40, 600);
    expect(result.current).toBe(true);
    pointer("pointerdown", 40, 600);
    expect(result.current).toBe(true);
  });

  it("comes back when the pointer approaches its corner", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    act(() => { vi.advanceTimersByTime(2_600); });
    expect(result.current).toBe(true);
    // Outside the panel but within the reach margin — heading that way.
    pointer("pointermove", 720, 200);
    expect(result.current).toBe(false);
  });

  it("comes back on a click near it", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    act(() => { vi.advanceTimersByTime(2_600); });
    pointer("pointerdown", 900, 300);
    expect(result.current).toBe(false);
  });

  it("holds open indefinitely while the pointer rests on it", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    pointer("pointermove", 900, 200);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(false);
  });

  it("pointer activity elsewhere restarts the countdown rather than hiding at once", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef()));
    act(() => { vi.advanceTimersByTime(2_000); });
    pointer("pointermove", 40, 600);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(true);
  });

  it("stays visible while disabled", () => {
    const { result } = renderHook(() => useProximityIdle(panelRef(), { enabled: false }));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(false);
  });
});
