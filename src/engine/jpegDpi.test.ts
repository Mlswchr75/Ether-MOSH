import { describe, expect, it } from "vitest";
import { withJpegDpi } from "./jpegDpi";

describe("withJpegDpi", () => {
  it("inserts a 300 DPI JFIF segment when one is absent", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
    const out = withJpegDpi(jpeg, 300);
    expect(Array.from(out.slice(2, 11))).toEqual([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
    expect((out[14] << 8) | out[15]).toBe(300);
    expect((out[16] << 8) | out[17]).toBe(300);
  });

  it("leaves non-JPEG input untouched", () => {
    const input = new Uint8Array([1, 2, 3]);
    expect(withJpegDpi(input)).toBe(input);
  });
});

