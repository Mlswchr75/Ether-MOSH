import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { ShareButton } from "./ShareSheet";
import { shareUrl } from "@/lib/share";

const url = "https://ether-mosh.online/news/datamosh-in-the-browser";
afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(navigator, "share"); });

/**
 * The app had two share surfaces and shipped the worse one nearly everywhere.
 *
 * `lib/share.ts` asked the browser to share and, when it couldn't, copied the
 * link and said so — every desktop Firefox, every desktop Chrome on Linux and
 * Windows. These assert the panel is what happens instead.
 */
describe("share, app-wide", () => {
  it("offers the places people actually post, not just a clipboard copy", async () => {
    render(<><ShareButton url={url} title="Datamosh in the browser" /><Toaster /></>);
    screen.getByRole("button", { name: "Share Datamosh in the browser" }).click();

    await screen.findByRole("region", { name: "Share Datamosh in the browser" });
    for (const name of ["Facebook", "X", "Reddit", "Telegram", "WhatsApp", "Email"]) {
      expect(screen.getByRole("link", { name }).getAttribute("href")).toContain(encodeURIComponent(url));
    }
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("falls back to the panel when the browser cannot share", async () => {
    // No navigator.share at all — the case that used to end in a toast.
    render(<Toaster />);
    await shareUrl(url, "Ether-MOSH");

    await screen.findByRole("region", { name: "Share Ether-MOSH" });
    expect(screen.getByRole("link", { name: "Reddit" })).toBeTruthy();
  });

  it("prefers the device's own sheet when there is one", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<Toaster />);

    expect(await shareUrl(url, "Ether-MOSH")).toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url }));
    // Native succeeded, so the panel would be a second dialog for one action.
    expect(screen.queryByRole("region", { name: "Share Ether-MOSH" })).toBeNull();
  });

  it("takes a cancelled share as an answer rather than arguing", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("nope"), { name: "AbortError" }));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<Toaster />);

    expect(await shareUrl(url, "Ether-MOSH")).toBe("cancelled");
    await waitFor(() => expect(screen.queryByRole("region", { name: "Share Ether-MOSH" })).toBeNull());
  });

  it("opens the panel when the browser's own sheet fails for a real reason", async () => {
    const share = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<Toaster />);

    await shareUrl(url, "Ether-MOSH");
    await screen.findByRole("region", { name: "Share Ether-MOSH" });
  });
});
