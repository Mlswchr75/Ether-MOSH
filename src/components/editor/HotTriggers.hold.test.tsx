import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HotTriggers } from "./HotTriggers";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

describe("radial hot-trigger holds", () => {
  it("keeps a trigger hold on the action instead of moving the wheel", () => {
    vi.useFakeTimers();
    const onToggleRecord = vi.fn();
    render(
      <HotTriggers
        isRecording={false}
        onToggleRecord={onToggleRecord}
        onScreenshot={() => {}}
        onFreeze={() => {}}
        onGif={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open radial controls" }));
    const wheel = document.querySelector<HTMLElement>(".desktop-radial-wheel")!;
    const initialPosition = `${wheel.style.left}:${wheel.style.top}`;
    const capture = screen.getByRole("button", { name: "Capture — tap for a still, hold to record" });
    const down = new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 320, clientY: 240 });
    Object.defineProperties(down, {
      pointerId: { value: 7 },
      pointerType: { value: "mouse" },
    });

    act(() => capture.dispatchEvent(down));
    act(() => vi.advanceTimersByTime(421));

    expect(onToggleRecord).toHaveBeenCalledTimes(1);
    expect(`${wheel.style.left}:${wheel.style.top}`).toBe(initialPosition);
    expect(wheel.closest(".desktop-radial-layer")?.getAttribute("data-phase")).toBe("open");
  });

  it("uses dedicated grips for layout changes in edit mode", () => {
    render(
      <HotTriggers
        isRecording={false}
        onToggleRecord={() => {}}
        onScreenshot={() => {}}
        onFreeze={() => {}}
        onGif={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open radial controls" }));
    // The hub's plain click is mosh now (it's the center Mosh button) — edit
    // mode moved to a right-click on the hub specifically, so a mosh press
    // and "let me rearrange the wheel" can't collide on the same gesture.
    fireEvent.contextMenu(document.querySelector<HTMLButtonElement>(".desktop-radial-wheel .mobile-radial-wheel__hub > button")!);

    expect(screen.getByRole("button", { name: "Move Capture — tap for a still, hold to record" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Capture — tap for a still, hold to record" })).toBeTruthy();
  });
});
