import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AboutTrigger } from "@/components/AboutOverlay";

afterEach(cleanup);

describe("AboutTrigger visibility", () => {
  it("does not expose the About control while editor UI is hidden", () => {
    render(<AboutTrigger hidden />);

    expect(screen.queryByRole("button", { name: "About Ether-MOSH" })).toBeNull();
  });

  it("still opens and closes the About dialog when visible", () => {
    render(<AboutTrigger />);

    fireEvent.click(screen.getByRole("button", { name: "About Ether-MOSH" }));
    expect(screen.getByRole("dialog", { name: "About Ether-MOSH" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByRole("dialog", { name: "About Ether-MOSH" })).toBeNull();
  });
});
