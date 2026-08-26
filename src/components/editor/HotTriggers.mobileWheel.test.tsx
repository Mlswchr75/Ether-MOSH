import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HotTriggers, RADIAL_WHEEL_HOLD_MS } from "./HotTriggers";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      // Force the touch-screen branch (MobileRadialWheel) rather than the
      // desktop one, matching HotTriggers.tsx's own "(pointer: coarse),
      // (max-width: 900px)" query.
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterAll(() => Reflect.deleteProperty(window, "matchMedia"));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Wrapper() {
  const visualizerRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={visualizerRef} data-testid="visualizer" />
      <HotTriggers
        visualizerRef={visualizerRef}
        isRecording={false}
        onToggleRecord={() => {}}
        onScreenshot={() => {}}
        onFreeze={() => {}}
        onGif={() => {}}
      />
    </div>
  );
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  });
  return event;
}

describe("mobile radial hot-trigger wheel", () => {
  it("returns to idle after a hold-flick-release, instead of staying stuck open", () => {
    vi.useFakeTimers();
    render(<Wrapper />);
    const target = screen.getByTestId("visualizer");
    const layer = document.querySelector<HTMLElement>(".mobile-radial-layer")!;
    expect(layer.dataset.phase).toBe("idle");

    act(() => { target.dispatchEvent(pointerEvent("pointerdown", 3, 150, 150)); });
    act(() => { vi.advanceTimersByTime(RADIAL_WHEEL_HOLD_MS + 10); });
    // The hold fired and opened the wheel.
    expect(layer.dataset.phase).toBe("open");

    act(() => { window.dispatchEvent(pointerEvent("pointerup", 3, 150, 150)); });
    // Regression: releasing after a fired hold previously left the wheel
    // open (data-phase="open") with its full-screen backdrop still
    // absorbing pointer events, swallowing the next tap.
    expect(layer.dataset.phase).toBe("idle");
  });
});
