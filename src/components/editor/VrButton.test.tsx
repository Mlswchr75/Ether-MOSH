import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VrButton } from "./VrButton";
import { vrMode } from "@/engine/vrMode";
import type { MoshRenderer } from "@/engine/Renderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VrButton Quest entry", () => {
  it("offers one-tap immersive entry on a WebXR-capable Quest browser", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 12; Quest 3) OculusBrowser/39.0",
    );
    vi.spyOn(vrMode, "isSupported").mockResolvedValue(true);
    const enter = vi.spyOn(vrMode, "enter").mockResolvedValue();
    const renderer = {} as MoshRenderer;
    const frame = () => {};

    render(<VrButton getRenderer={() => renderer} getFrame={() => frame} />);

    const button = await screen.findByRole("button", { name: "Enter immersive Quest visualizer" });
    expect(button.textContent).toContain("Enter immersive visualizer");
    expect(button.textContent).toContain("flick sideways for window mode");
    fireEvent.click(button);
    await waitFor(() => expect(enter).toHaveBeenCalledWith(renderer, frame));
  });
});
