import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MinimizeButton, useMinimized } from "./Minimize";

/**
 * The minimize primitive is shared by every menu in the instrument, so a
 * regression here is a regression everywhere at once. These cover the two
 * things that would actually be noticed: a panel that forgets it was folded,
 * and a popup that opens still folded from last time.
 */

function Panel({ storageKey, persist }: { storageKey: string; persist?: boolean }) {
  const { minimized, toggle } = useMinimized(storageKey, { persist });
  return (
    <div>
      <MinimizeButton minimized={minimized} onToggle={toggle} label="the test panel" />
      {!minimized && <p>body</p>}
    </div>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useMinimized", () => {
  it("folds and unfolds the body", () => {
    render(<Panel storageKey="test.a" />);
    expect(screen.getByText("body")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    expect(screen.queryByText("body")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("remembers a folded panel across a remount", () => {
    // The whole point: a rig set up the way you like it stays that way.
    const first = render(<Panel storageKey="test.b" />);
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    first.unmount();

    render(<Panel storageKey="test.b" />);
    expect(screen.queryByText("body")).toBeNull();
  });

  it("keeps separate panels independent", () => {
    render(<><Panel storageKey="test.c" /><Panel storageKey="test.d" /></>);
    fireEvent.click(screen.getAllByRole("button", { name: /minimize/i })[0]);
    // One folded, one still open.
    expect(screen.getAllByText("body")).toHaveLength(1);
  });

  it("opens a transient popup ready to use, never folded from last time", () => {
    // A menu anchored to a trigger you just tapped must not remember a fold
    // from a previous session — you tapped it to use it.
    const first = render(<Panel storageKey="test.e" persist={false} />);
    fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
    first.unmount();

    render(<Panel storageKey="test.e" persist={false} />);
    expect(screen.getByText("body")).toBeTruthy();
  });

  it("states which way it will move, for a screen reader and a tooltip", () => {
    render(<Panel storageKey="test.f" />);
    const open = screen.getByRole("button", { name: "Minimize the test panel" });
    expect(open.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(open);
    const folded = screen.getByRole("button", { name: "Expand the test panel" });
    expect(folded.getAttribute("aria-expanded")).toBe("false");
    expect(folded.getAttribute("title")).toBe("Expand the test panel");
  });

  it("does not leak the click to the panel underneath", () => {
    // Every one of these buttons sits inside a menu or a click-through pane;
    // a bubbling click would toggle the thing it is drawn on top of.
    let outer = 0;
    function Host() {
      const [minimized, setMinimized] = useState(false);
      return (
        <div onClick={() => { outer++; }}>
          <MinimizeButton minimized={minimized} onToggle={() => setMinimized(v => !v)} label="x" />
        </div>
      );
    }
    render(<Host />);
    act(() => { fireEvent.click(screen.getByRole("button")); });
    expect(outer).toBe(0);
  });

  it("survives storage being unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error("denied"); };
    try {
      render(<Panel storageKey="test.g" />);
      fireEvent.click(screen.getByRole("button", { name: /minimize/i }));
      expect(screen.queryByText("body")).toBeNull();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
