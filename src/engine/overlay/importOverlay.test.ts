import { describe, expect, it } from "vitest";
import { classifyOverlayFile, OverlayImportError } from "./importOverlay";

function fake(name: string, type = ""): Pick<File, "name" | "type"> {
  return { name, type };
}

describe("classifyOverlayFile", () => {
  it.each([
    ["sticker.png", "image/png", "raster"],
    ["sticker.webp", "image/webp", "raster"],
    ["sticker.gif", "image/gif", "gif"],
    ["sticker.svg", "image/svg+xml", "svg"],
    ["motion.json", "application/json", "lottie-json"],
    ["motion.lottie", "application/zip", "dotlottie"],
  ])("classifies %s", (name, type, expected) => {
    expect(classifyOverlayFile(fake(name, type))).toBe(expected);
  });

  it("uses the extension when browsers omit MIME type", () => {
    expect(classifyOverlayFile(fake("motion.lottie"))).toBe("dotlottie");
    expect(classifyOverlayFile(fake("art.svg"))).toBe("svg");
  });

  it("rejects unsupported files with a readable message", () => {
    expect(() => classifyOverlayFile(fake("movie.mp4", "video/mp4")))
      .toThrowError(OverlayImportError);
    expect(() => classifyOverlayFile(fake("movie.mp4", "video/mp4")))
      .toThrow(/PNG, WebP, GIF, SVG, Lottie JSON, or \.lottie/);
  });
});
