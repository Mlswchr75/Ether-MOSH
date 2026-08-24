import { describe, expect, it } from "vitest";
import { clampCaptureRect, compositeOperationForBlend, shouldCaptureOverlayElement } from "./overlayCapture";

describe("overlay GIF capture helpers", () => {
  it("captures image/canvas media but not editor controls", () => {
    const canvas = document.createElement("canvas");
    const image = document.createElement("img");
    const button = document.createElement("button");
    expect(shouldCaptureOverlayElement(canvas)).toBe(true);
    expect(shouldCaptureOverlayElement(image)).toBe(true);
    expect(shouldCaptureOverlayElement(button)).toBe(false);
  });

  it("clips media bounds to the capture surface", () => {
    expect(clampCaptureRect({ x: -20, y: 10, width: 60, height: 50 }, 100, 100)).toEqual({ x: 0, y: 10, width: 40, height: 50 });
    expect(clampCaptureRect({ x: 120, y: 0, width: 20, height: 20 }, 100, 100)).toBeNull();
  });

  it("maps CSS blend modes to canvas operations safely", () => {
    expect(compositeOperationForBlend("screen")).toBe("screen");
    expect(compositeOperationForBlend("normal")).toBe("source-over");
    expect(compositeOperationForBlend("plus-lighter")).toBe("lighter");
    expect(compositeOperationForBlend("nonsense")).toBe("source-over");
  });
});
