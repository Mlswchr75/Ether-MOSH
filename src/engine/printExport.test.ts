import { describe, expect, it } from "vitest";
import { printReadyFilename } from "./printExport";

describe("printReadyFilename", () => {
  it("records the real dimensions and DPI in a filesystem-safe name", () => {
    expect(printReadyFilename("Neon / Shatter.png", 8000, 5333, 300, "jpg"))
      .toBe("neon-shatter_8000x5333_300dpi_print-ready.jpg");
  });
});
