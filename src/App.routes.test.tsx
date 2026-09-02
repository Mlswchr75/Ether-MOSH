import { cleanup, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/components/editor/GlCanvas", () => ({
  GlCanvas: () => <canvas data-mosh-canvas />,
}));

vi.mock("@/components/journey/PortalShapeGallery", () => ({
  PortalShapeGallery: () => <div data-portal-gallery />,
  JourneyPortalInterlude: () => <div data-journey-interlude />,
}));

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

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

function renderAt(path: string) {
  window.history.replaceState({}, "", path);
  render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );
}

describe("public feature routes", () => {
  it("renders the dedicated auth callback instead of the 404 page", async () => {
    renderAt("/auth/callback");

    expect(await screen.findByText(/finishing sign-in/i)).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("sends signed-out checkout visitors through the working sign-in page", async () => {
    renderAt("/checkout?price=mosh_supporter_once");

    expect(await screen.findByText(/sign in to/i)).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("renders the guides index instead of the 404 page", async () => {
    renderAt("/guides");

    expect(await screen.findByRole("heading", { name: "Guides" })).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("renders saved favorites instead of the 404 page", async () => {
    renderAt("/favorites");

    expect(await screen.findByRole("heading", { name: /favorites/i })).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("renders contact instead of the 404 page", async () => {
    renderAt("/contact");

    expect(await screen.findByRole("heading", { name: "Contact" })).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("keeps the linked refunds URL working", async () => {
    renderAt("/refunds");

    expect(await screen.findByRole("heading", { name: "refund policy", level: 1 })).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("renders News + Updates instead of the 404 page", async () => {
    renderAt("/news");
    expect(await screen.findByRole("heading", { name: /bad signal/i }, { timeout: 5000 })).not.toBeNull();
    expect(screen.queryByText("404")).toBeNull();
  });

  it("renders an effect article with its direct answer and tutorial", async () => {
    renderAt("/news/sort-your-pixels-before-they-sort-you");
    expect(await screen.findByRole("heading", { name: /sort your pixels/i }, { timeout: 5000 })).not.toBeNull();
    expect(screen.getByText("Quick answer")).not.toBeNull();
    expect(screen.getByText(/Make it in Ether-MOSH/i)).not.toBeNull();
  });
});
