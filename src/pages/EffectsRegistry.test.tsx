import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import EffectsRegistry from "./EffectsRegistry";

afterEach(cleanup);

const renderRegistry = () => render(
  <HelmetProvider>
    <MemoryRouter>
      <EffectsRegistry />
    </MemoryRouter>
  </HelmetProvider>,
);

describe("EffectsRegistry", () => {
  it("opens the visual example while retaining the effect details", () => {
    renderRegistry();
    fireEvent.click(screen.getByRole("button", { name: /Open Pixel Sort visual example and details/i }));

    const dialog = screen.getByRole("dialog", { name: /Pixel Sort/i });
    expect(within(dialog).getByText("Brightness-driven horizontal smear.")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Parameters" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "GLSL source" })).toBeTruthy();
    expect(dialog.querySelector("svg[data-specimen-signature]")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("searches descriptions and keeps registry navigation available", () => {
    renderRegistry();
    fireEvent.change(screen.getByRole("textbox", { name: "Search effects" }), { target: { value: "Brightness-driven" } });
    expect(screen.getByRole("button", { name: /Open Pixel Sort visual example and details/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open Datamosh visual example and details/i })).toBeNull();
    expect(screen.getByRole("link", { name: /^news \+ updates/i }).getAttribute("href")).toBe("/news");
  });
});
