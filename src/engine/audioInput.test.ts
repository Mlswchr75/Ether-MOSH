import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestMicrophoneStream,
  resolveRememberedAudioInput,
  type AudioInputDevice,
} from "@/engine/audioInput";

const INTERFACES: AudioInputDevice[] = [
  { deviceId: "built-in", groupId: "a", label: "MacBook Microphone" },
  { deviceId: "scarlett-new", groupId: "b", label: "Scarlett 2i2 USB" },
];

describe("audio interface compatibility", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("recovers a remembered interface when its browser device id rotates", () => {
    expect(resolveRememberedAudioInput(INTERFACES, "scarlett-old", "Scarlett 2i2 USB"))
      .toEqual({ deviceId: "scarlett-new", recoveredByLabel: true, found: true });
  });

  it("reports an unavailable interface instead of matching an unrelated input", () => {
    expect(resolveRememberedAudioInput(INTERFACES, "missing", "StudioLive 16"))
      .toEqual({ deviceId: null, recoveredByLabel: false, found: false });
  });

  it("retries a selected interface with minimal constraints", async () => {
    const stream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("unsupported constraint"), { name: "OverconstrainedError" }))
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "scarlett", groupId: "b", label: "Scarlett 2i2 USB" },
        ]),
        getUserMedia,
      },
    });

    const result = await requestMicrophoneStream({ deviceId: "scarlett", label: "Scarlett 2i2 USB" });
    expect(result.stream).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      audio: { deviceId: { exact: "scarlett" } },
      video: false,
    });
  });

  it("falls back to the default input when a remembered interface is gone", async () => {
    const stream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;
    const missing = Object.assign(new Error("not found"), { name: "NotFoundError" });
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(missing)
      .mockRejectedValueOnce(missing)
      .mockResolvedValueOnce(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue(INTERFACES.map((device) => ({ ...device, kind: "audioinput" }))),
        getUserMedia,
      },
    });

    const result = await requestMicrophoneStream({ deviceId: "gone", label: "Gone Interface" });
    expect(result.requestedDeviceFound).toBe(false);
    expect(result.stream).toBe(stream);
    expect(getUserMedia.mock.calls[2][0]).toEqual(expect.objectContaining({ video: false }));
  });

  it("does not hide permission or hardware-busy failures behind a fallback", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(denied);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([]),
        getUserMedia,
      },
    });

    await expect(requestMicrophoneStream({ deviceId: null, label: null })).rejects.toBe(denied);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
