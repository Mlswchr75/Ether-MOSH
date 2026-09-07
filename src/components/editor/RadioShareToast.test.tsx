import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { RadioShareTag } from "./RadioShareToast";

const url = "https://ether-mosh.online/radio?track=blackbox-psalm";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("radio sharing", () => {
  it("immediately opens social options and copies the exact song reference", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    render(<><RadioShareTag url={url} title="Blackbox Psalm"/><Toaster/></>);
    fireEvent.click(screen.getByRole("button", { name: "Share Blackbox Psalm" }));
    await screen.findByRole("region", { name: "Share Blackbox Psalm" });
    expect(screen.getByRole("link", { name: "Facebook" }).getAttribute("href")).toContain(encodeURIComponent(url));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(url));
    expect(await screen.findByText("Link copied")).toBeTruthy();
  });
  it("offers native sharing only when supported and never auto-posts", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<><RadioShareTag url={url} title="Another song"/><Toaster/></>);
    fireEvent.click(screen.getByRole("button", { name: "Share Another song" }));
    const native = await screen.findByRole("button", { name: "Share to apps…" });
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(native);
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url })));
  });
});
