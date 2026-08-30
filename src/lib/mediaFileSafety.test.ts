import { describe, expect, it } from "vitest";
import {
  MAX_DECODED_IMAGE_PIXELS,
  MAX_IMAGE_FILE_BYTES,
  validateDecodedDimensions,
  validateImageUpload,
  validateOverlaySize,
} from "./mediaFileSafety";

describe("local media safety limits", () => {
  it("accepts ordinary images", () => {
    expect(validateImageUpload({ name: "art.png", type: "image/png", size: 2_000_000 })).toBeNull();
    expect(validateDecodedDimensions(4096, 4096)).toBeNull();
  });

  it("rejects oversized files and decoded pixel bombs", () => {
    expect(validateImageUpload({ name: "huge.png", type: "image/png", size: MAX_IMAGE_FILE_BYTES + 1 })).toMatch(/too large/i);
    expect(validateDecodedDimensions(MAX_DECODED_IMAGE_PIXELS, 2)).toMatch(/too large/i);
  });

  it("accepts a known extension when a cloud provider omits the MIME type", () => {
    expect(validateImageUpload({ name: "print-ready.PNG", type: "", size: 20_000_000 })).toBeNull();
    expect(validateImageUpload({ name: "notes.txt", type: "", size: 20 })).toMatch(/isn't an image/i);
  });

  it("keeps safe headroom above an exact 8K square print asset", () => {
    expect(validateDecodedDimensions(8000, 8000)).toBeNull();
    expect(validateDecodedDimensions(9200, 9200)).toMatch(/too large/i);
  });

  it("uses a tighter cap for parsed Lottie JSON", () => {
    expect(validateOverlaySize({ size: 6 * 1024 * 1024 }, "lottie-json")).toMatch(/5 MB maximum/i);
  });
});
