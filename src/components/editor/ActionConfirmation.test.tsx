import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionConfirmation } from "./ActionConfirmation";

describe("ActionConfirmation immediate actions", () => {
  it("auto-confirms exactly once without rendering a blocking dialog when delay is zero", async () => {
    const onConfirm = vi.fn();
    render(
      <ActionConfirmation
        title="Capture GIF?"
        autoConfirmMs={0}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByText("Capture GIF?")).toBeNull();
    await act(async () => { await Promise.resolve(); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
