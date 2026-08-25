import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMoshOnlyActivity, useIdleFade } from "./useIdleFade";

function Fixture() {
  const stage = useIdleFade(1_700, isMoshOnlyActivity);
  return (
    <div>
      <output>{stage}</output>
      <div data-mosh-surface data-testid="surface">
        <button type="button">Regular control</button>
      </div>
      <span data-mosh-input><button type="button">Mosh</button></span>
    </div>
  );
}

describe("useIdleFade mosh activity", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("hides at 1.7s and stays hidden for every Mosh input", () => {
    vi.useFakeTimers();
    render(<Fixture />);
    act(() => vi.advanceTimersByTime(1_700));
    expect(screen.getByText("hidden")).toBeTruthy();

    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.pointerDown(screen.getByTestId("surface"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Mosh" }));
    expect(screen.getByText("hidden")).toBeTruthy();
  });

  it("still wakes for navigation intent and hides again after 1.7s", () => {
    vi.useFakeTimers();
    render(<Fixture />);
    act(() => vi.advanceTimersByTime(1_700));

    fireEvent.pointerMove(window);
    expect(screen.getByText("active")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_699));
    expect(screen.getByText("active")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("hidden")).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Regular control" }));
    expect(screen.getByText("active")).toBeTruthy();
  });
});
