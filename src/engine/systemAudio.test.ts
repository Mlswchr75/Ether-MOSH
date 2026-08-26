import { describe, expect, it } from "vitest";
import { isMobileAudioCaptureDevice } from "./systemAudio";

describe("system audio mobile fallback", () => {
  it("detects phones and tablets", () => {
    expect(isMobileAudioCaptureDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileAudioCaptureDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel)", maxTouchPoints: 5 })).toBe(true);
    expect(isMobileAudioCaptureDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 })).toBe(true);
  });

  it("keeps ordinary desktop browsers on the desktop error path", () => {
    expect(isMobileAudioCaptureDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", maxTouchPoints: 0 })).toBe(false);
  });
});
