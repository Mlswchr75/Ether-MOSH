import { useRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HotTriggers, RADIAL_WHEEL_HOLD_MS, RADIO_TRIGGERS } from "./HotTriggers";
import { useStore } from "@/store/useStore";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })),
  });
});
afterAll(() => Reflect.deleteProperty(window, "matchMedia"));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function Wheel({ only, showMicNudge }: { only?: readonly string[]; showMicNudge?: boolean }) {
  const visualizerRef = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={visualizerRef} data-testid="visualizer" />
      <HotTriggers
        visualizerRef={visualizerRef}
        only={only}
        showMicNudge={showMicNudge}
        isRecording={false}
        onToggleRecord={() => {}}
        onScreenshot={() => {}}
        onFreeze={() => {}}
        onGif={() => {}}
      />
    </div>
  );
}

const pointerEvent = (type: string, id: number, x: number, y: number) => {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: "touch" } });
  return event;
};

/** Hold on the visualizer until the wheel arms, the way a thumb does. */
function openWheel() {
  const target = screen.getByTestId("visualizer");
  const x = window.innerWidth / 2, y = window.innerHeight / 2;
  act(() => { target.dispatchEvent(pointerEvent("pointerdown", 3, x, y)); });
  act(() => { vi.advanceTimersByTime(RADIAL_WHEEL_HOLD_MS + 10); });
  act(() => { window.dispatchEvent(pointerEvent("pointerup", 3, x, y)); });
}

const slotIds = () =>
  [...document.querySelectorAll<HTMLElement>(".mobile-radial-layer [data-radial-id]")].map(n => n.dataset.radialId!);

describe("the wheel on a station", () => {
  it("drops what a station cannot act on", () => {
    // Radio always runs on Forge — that is what lets it draw indefinitely — so
    // a source switcher on this wheel is a control with nothing behind it.
    for (const id of ["source-camera", "source-upload", "source-forge", "source-motif", "switch-camera", "motif-maestro", "sticker-mode"]) {
      expect(RADIO_TRIGGERS).not.toContain(id);
    }
  });

  it("keeps the audio route, the takeaways and the look", () => {
    for (const id of ["audio", "theme-track", "capture", "gif", "share", "favorites", "dark-mode", "desktop-portrait", "fullscreen", "account", "home"]) {
      expect(RADIO_TRIGGERS).toContain(id);
    }
  });

  it("still moshes — the hub is a trigger id like any other", () => {
    expect(RADIO_TRIGGERS).toContain("mosh");
  });

  it("renders only the narrowed set, and the full set without it", () => {
    vi.useFakeTimers();
    render(<Wheel only={RADIO_TRIGGERS} />);
    openWheel();
    const narrowed = slotIds();

    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed).not.toContain("source-camera");
    expect(narrowed).toContain("audio");
    // The hub is not a ring slot on either wheel.
    expect(narrowed).not.toContain("mosh");

    cleanup();
    render(<Wheel />);
    openWheel();
    expect(slotIds()).toContain("source-camera");
  });
});

describe("the listen trigger", () => {
  beforeEach(() => {
    useStore.setState({ micEnabled: false, systemAudioEnabled: false });
  });

  it("turns the mic on with one tap, asking nothing further", () => {
    // It used to open a source picker, so reaching the mic meant steering the
    // wheel to the control that means "listen" and then finding a second
    // control inside a popover to say so again.
    vi.useFakeTimers();
    const setMicEnabled = vi.fn();
    useStore.setState({ setMicEnabled });
    render(<Wheel only={RADIO_TRIGGERS} />);
    openWheel();

    act(() => { screen.getByRole("button", { name: /^Listen mode/ }).click(); });

    expect(setMicEnabled).toHaveBeenCalledWith(true);
    expect(document.querySelector("[data-audio-source-picker].fixed")).toBeNull();
  });

  it("turns it back off on the next tap", () => {
    vi.useFakeTimers();
    const setMicEnabled = vi.fn();
    useStore.setState({ micEnabled: true, setMicEnabled });
    render(<Wheel only={RADIO_TRIGGERS} />);
    openWheel();

    act(() => { screen.getByRole("button", { name: "Mic on" }).click(); });

    expect(setMicEnabled).toHaveBeenCalledWith(false);
  });

  it("wears the nudge itself instead of raising a card to ask", () => {
    vi.useFakeTimers();
    render(<Wheel only={RADIO_TRIGGERS} showMicNudge />);
    openWheel();

    expect(document.querySelector("[data-mic-nudge]")).toBeTruthy();
    expect(document.querySelector(".hot-trigger-nudge")).toBeTruthy();
    // Nothing to answer: no tick, no cross, nothing that has to be dismissed.
    expect(screen.queryByRole("button", { name: /don't turn on the mic/i })).toBeNull();
  });

  it("stops nudging once something is already feeding the visuals", () => {
    vi.useFakeTimers();
    useStore.setState({ micEnabled: true });
    render(<Wheel only={RADIO_TRIGGERS} showMicNudge />);
    openWheel();

    expect(document.querySelector(".hot-trigger-nudge")).toBeNull();
  });
});
