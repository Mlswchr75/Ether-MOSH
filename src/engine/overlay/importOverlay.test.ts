import { describe, expect, it } from "vitest";
import { classifyOverlayFile, detectRasterAnimation, OverlayImportError } from "./importOverlay";

function fake(name: string, type = ""): Pick<File, "name" | "type"> {
  return { name, type };
}

function raster(type: string, ascii: string): Pick<File, "type" | "arrayBuffer"> {
  const bytes = new TextEncoder().encode(ascii);
  return { type, arrayBuffer: async () => bytes.buffer };
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
    expect(() => classifyOverlayFile(fake("movie.mp4", "video/mp4"))).toThrowError(OverlayImportError);
    expect(() => classifyOverlayFile(fake("movie.mp4", "video/mp4"))).toThrow(/PNG, WebP, GIF, SVG, Lottie JSON, or \.lottie/);
  });

  it("does not treat an arbitrary ZIP archive as dotLottie", () => {
    expect(() => classifyOverlayFile(fake("archive.zip", "application/zip"))).toThrow(/must use the \.lottie format/i);
  });
});

describe("detectRasterAnimation", () => {
  it("detects the WebP ANIM chunk", async () => {
    await expect(detectRasterAnimation(raster("image/webp", "RIFFxxxxWEBPANIMpayload"))).resolves.toBe(true);
  });

  it("detects the APNG acTL chunk", async () => {
    await expect(detectRasterAnimation(raster("image/png", "PNGheaderacTLpayload"))).resolves.toBe(true);
  });

  it("leaves ordinary raster images static", async () => {
    await expect(detectRasterAnimation(raster("image/webp", "RIFFxxxxWEBPVP8 payload"))).resolves.toBe(false);
  });
});
