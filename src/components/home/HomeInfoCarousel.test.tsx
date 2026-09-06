import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeInfoCarousel } from "./HomeInfoCarousel";

vi.mock("@/components/journey/PortalShapeGallery", () => ({
  JourneyPortalInterlude: () => <section aria-label="Live Forge Journey portal shapes" />,
}));

const renderCarousel = () => render(
  <MemoryRouter>
    <HomeInfoCarousel onReturnToInstrument={vi.fn()} />
  </MemoryRouter>,
);

afterEach(cleanup);

describe("HomeInfoCarousel", () => {
  it("loops forward from News back to Signal", async () => {
    renderCarousel();
    const next = screen.getByRole("button", { name: "Next chapter" });

    for (let step = 0; step < 6; step += 1) fireEvent.click(next);
    expect(screen.getByText(/07 \/ 08 · Portals/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore Journey Portals/i }).getAttribute("href")).toBe("/journey-portals");
    expect(await screen.findByRole("region", { name: "Live Forge Journey portal shapes" })).toBeTruthy();

    fireEvent.click(next);
    expect(screen.getByText(/08 \/ 08 · News/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Read News \+ Updates/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Browse the Effect Registry/i }).getAttribute("href")).toBe("/effects");

    fireEvent.click(next);
    expect(screen.getByText(/01 \/ 08 · Signal/i)).toBeTruthy();
  });

  it("loops backward from Signal to News", () => {
    renderCarousel();
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(screen.getByText(/08 \/ 08 · News/i)).toBeTruthy();
  });

  it("supports keyboard navigation", () => {
    renderCarousel();
    fireEvent.keyDown(screen.getByRole("region", { name: "Ether-MOSH live visuals" }), { key: "ArrowRight" });
    expect(screen.getByText(/02 \/ 08 · About/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Explore all \d+ effects/i }).getAttribute("href")).toBe("/effects");
  });
});
