import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HotTriggers } from "@/components/editor/HotTriggers";

const GIF_LENGTHS = [3, 5, 7] as const;

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterAll(() => {
  Reflect.deleteProperty(window, "matchMedia");
});

afterEach(cleanup);

function tapTimingOption(seconds: number) {
  const option = screen.getByRole("menuitem", { name: `${seconds}s` });
  fireEvent.pointerDown(option, { pointerId: 1, button: 0 });
  fireEvent.pointerUp(option, { pointerId: 1, button: 0 });
  fireEvent.click(option);
}

function renderEditorTriggers(onGif: (seconds?: number) => void) {
  render(
    <HotTriggers
      isRecording={false}
      onToggleRecord={() => {}}
      onScreenshot={() => {}}
      onFreeze={() => {}}
      onGif={onGif}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open radial controls" }));
}

describe("editor GIF timing menu (live camera and uploaded images)", () => {
  it.each(GIF_LENGTHS)("starts a %ss capture when its timing option is tapped", (seconds) => {
    const onGif = vi.fn();
    renderEditorTriggers(onGif);

    fireEvent.click(screen.getByRole("button", { name: "Capture seamless GIF loop" }));
    tapTimingOption(seconds);

    expect(onGif).toHaveBeenCalledExactlyOnceWith(seconds);
  });
});
