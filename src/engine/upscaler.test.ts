import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { upscaleImage } from "./upscaler";

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  get src() { return this._src; }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

function fakeSourceImage(w: number, h: number): HTMLImageElement {
  return { naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement;
}

describe("upscaleImage", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal("Image", FakeImage);
    createObjectURL = vi.fn(() => "blob:fake-url");
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      drawImage: () => {},
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => {
      cb(new Blob());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("revokes the object URL on the success path, not just on failure", async () => {
    // Regression: createObjectURL's blob URL was only revoked in the catch
    // branch — the common, successful-decode path leaked one blob URL per
    // upscaled image for the tab's lifetime.
    const result = await upscaleImage(fakeSourceImage(600, 400));
    expect(result).not.toBeNull();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("still revokes the object URL when decoding fails", async () => {
    vi.stubGlobal("Image", class extends FakeImage {
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
      get src() { return ""; }
    });
    const result = await upscaleImage(fakeSourceImage(600, 400));
    expect(result).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
