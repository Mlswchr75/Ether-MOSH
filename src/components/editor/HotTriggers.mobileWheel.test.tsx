import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { HotTriggers, RADIAL_PAGE_SIZE, RADIAL_WHEEL_HOLD_MS } from "./HotTriggers";

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
        onHome={() => {}}
        onShare={() => {}}
        onAccount={() => {}}
        onClearFx={() => {}}
        onSaveFavorite={() => {}}
        onToggleJourney={() => {}}
        onToggleFullscreen={() => {}}
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
  it("stays open after a stationary hold-release, then dismisses after a selection", () => {
    vi.useFakeTimers();
    render(<Wrapper />);
    const target = screen.getByTestId("visualizer");
    const layer = document.querySelector<HTMLElement>(".mobile-radial-layer")!;
    expect(layer.dataset.phase).toBe("idle");

    const x = window.innerWidth / 2, y = window.innerHeight / 2;
    act(() => { target.dispatchEvent(pointerEvent("pointerdown", 3, x, y)); });
    act(() => { vi.advanceTimersByTime(RADIAL_WHEEL_HOLD_MS + 10); });
    // The hold fired and opened the wheel.
    expect(layer.dataset.phase).toBe("open");

    act(() => { window.dispatchEvent(pointerEvent("pointerup", 3, x, y)); });
    // A stationary release deliberately keeps the wheel open so the user can
    // lift, inspect, then tap a choice.
    expect(layer.dataset.phase).toBe("open");

    // Sticker Studio lives on the second page now that the wheel pages
    // rather than crowding all twenty-six triggers onto two rings, so
    // reaching it is a chevron and then a tap.
    const sticker = { name: "Sticker Studio — isolate, cut, animate, import and open the Vault" };
    if (!screen.queryByRole("button", sticker)) {
      act(() => { screen.getByRole("button", { name: "Next triggers" }).click(); });
    }
    act(() => { screen.getByRole("button", sticker).click(); });
    // Once a choice is made, the wheel must get out of the opened panel's way.
    expect(layer.dataset.phase).toBe("idle");
  });
});

describe("the wheel pages rather than crowding one ring", () => {
  const openWheel = () => {
    const target = screen.getByTestId("visualizer");
    const x = window.innerWidth / 2, y = window.innerHeight / 2;
    act(() => { target.dispatchEvent(pointerEvent("pointerdown", 9, x, y)); });
    act(() => { vi.advanceTimersByTime(RADIAL_WHEEL_HOLD_MS + 10); });
    act(() => { window.dispatchEvent(pointerEvent("pointerup", 9, x, y)); });
  };
  const slotIds = () =>
    [...document.querySelectorAll<HTMLElement>(".mobile-radial-wheel__slot")]
      .map(node => node.dataset.radialId!);

  it("never draws more than a page at once, and offers a pager when there is more", () => {
    vi.useFakeTimers();
    render(<Wrapper />);
    openWheel();

    const firstPage = slotIds();
    expect(firstPage.length).toBeLessThanOrEqual(RADIAL_PAGE_SIZE);
    const pager = document.querySelector(".mobile-radial-wheel__pager");
    expect(pager).not.toBeNull();
    // mosh is the hub, so it never takes a ring slot.
    expect(firstPage).not.toContain("mosh");

    // The pager must NOT live inside the wheel. The wheel carries
    // `contain: layout style paint`, and the pager is positioned below its
    // border box, so nesting it there means paint containment clips it: the
    // chevrons never render and never hit-test, stranding every trigger past
    // the first page. jsdom applies no containment, so nothing else in this
    // suite can see that — this asserts the structure instead.
    const wheel = document.querySelector(".mobile-radial-wheel");
    expect(wheel).not.toBeNull();
    expect(wheel!.contains(pager!)).toBe(false);
  });

  it("reaches the rest of the triggers through the pager, with no repeats", () => {
    vi.useFakeTimers();
    render(<Wrapper />);
    openWheel();

    const firstPage = slotIds();
    act(() => { screen.getByRole("button", { name: "Next triggers" }).click(); });
    const secondPage = slotIds();

    expect(secondPage.length).toBeGreaterThan(0);
    for (const id of secondPage) expect(firstPage).not.toContain(id);

    // ...and back again lands exactly where it started.
    act(() => { screen.getByRole("button", { name: "Previous triggers" }).click(); });
    expect(slotIds()).toEqual(firstPage);
  });

  it("reopens on page one, so the same flick always reaches the same trigger", () => {
    vi.useFakeTimers();
    render(<Wrapper />);
    openWheel();
    const firstPage = slotIds();

    act(() => { screen.getByRole("button", { name: "Next triggers" }).click(); });
    expect(slotIds()).not.toEqual(firstPage);

    // Dismiss, then summon again.
    act(() => { window.dispatchEvent(new Event("mosh:close-hot-triggers")); });
    openWheel();
    expect(slotIds()).toEqual(firstPage);
  });
});
