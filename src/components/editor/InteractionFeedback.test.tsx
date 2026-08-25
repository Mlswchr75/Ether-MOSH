import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { InteractionFeedback } from "./InteractionFeedback";

vi.mock("@/engine/cursorFx", () => ({
  cursorFx: {
    hover: vi.fn(),
    release: vi.fn(),
    burst: vi.fn(),
  },
}));

afterEach(cleanup);

describe("InteractionFeedback cursor", () => {
  it("portals to the viewport and brightens over the lower controls", () => {
    const { container } = render(
      <div data-cursor-zone="controls"><button type="button">Amount</button></div>,
    );
    render(<InteractionFeedback />);

    const cursor = document.body.querySelector<HTMLElement>(".mosh-hover-cursor");
    expect(cursor).not.toBeNull();
    expect(container.querySelector(".interaction-feedback")).toBeNull();

    const move = new MouseEvent("pointermove", { bubbles: true, clientX: 120, clientY: 340 });
    Object.defineProperties(move, {
      pointerId: { value: 1 },
      pointerType: { value: "mouse" },
    });
    container.querySelector("button")!.dispatchEvent(move);

    expect(cursor?.dataset.visible).toBe("true");
    expect(cursor?.dataset.zone).toBe("controls");
    expect(cursor?.style.transform).toContain("120px, 340px");
  });
});
