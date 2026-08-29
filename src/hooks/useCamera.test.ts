import { afterEach, describe, expect, it, vi } from "vitest";
import { facingOfTrack, requestCameraStream, type CameraFacing } from "./useCamera";

/** A MediaStreamTrack stub that reports a given facing. */
function makeTrack(facing: CameraFacing | null, label = ""): MediaStreamTrack {
  return {
    readyState: "live",
    label,
    kind: "video",
    stop: vi.fn(),
    getSettings: () => (facing ? { facingMode: facing } : {}),
  } as unknown as MediaStreamTrack;
}

function makeStream(track: MediaStreamTrack): MediaStream {
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

/**
 * Install a fake getUserMedia.
 *
 * `resolve` receives the constraints and returns the facing the "device"
 * decides to hand back — or throws to simulate an unsatisfiable constraint.
 */
function installCamera(resolve: (c: MediaStreamConstraints) => CameraFacing) {
  const calls: MediaStreamConstraints[] = [];
  const getUserMedia = vi.fn(async (c: MediaStreamConstraints) => {
    calls.push(c);
    return makeStream(makeTrack(resolve(c)));
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: { getUserMedia, enumerateDevices: async () => [] },
      permissions: undefined,
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      isSecureContext: true,
      location: { hostname: "localhost" },
      matchMedia: () => ({ matches: false }),
    },
  });
  return { calls };
}

const facingOf = (c: MediaStreamConstraints): string | undefined => {
  const v = c.video as MediaTrackConstraints | undefined;
  const fm = v?.facingMode as string | { exact?: string; ideal?: string } | undefined;
  if (typeof fm === "string") return fm;
  return fm?.exact ?? fm?.ideal;
};
const isExact = (c: MediaStreamConstraints): boolean => {
  const v = c.video as MediaTrackConstraints | undefined;
  const fm = v?.facingMode as { exact?: string } | undefined;
  return typeof fm === "object" && fm !== null && "exact" in fm;
};

afterEach(() => { vi.restoreAllMocks(); });

describe("facingOfTrack", () => {
  it("reads facingMode from track settings", () => {
    expect(facingOfTrack(makeTrack("user"))).toBe("user");
    expect(facingOfTrack(makeTrack("environment"))).toBe("environment");
  });

  it("falls back to the device label when facingMode is absent", () => {
    expect(facingOfTrack(makeTrack(null, "FaceTime HD Camera (Front)"))).toBe("user");
    expect(facingOfTrack(makeTrack(null, "Back Triple Camera"))).toBe("environment");
  });

  it("returns null when nothing identifies the camera", () => {
    expect(facingOfTrack(makeTrack(null, "USB Video Device"))).toBeNull();
    expect(facingOfTrack(undefined)).toBeNull();
  });
});

describe("requestCameraStream facing", () => {
  it("asks with an exact constraint before falling back to ideal", async () => {
    const { calls } = installCamera(() => "user");
    await requestCameraStream({ facing: "user" });
    // The very first attempt must be exact — an ideal hint is advisory and a
    // device may satisfy it with whatever camera is already open.
    expect(isExact(calls[0])).toBe(true);
    expect(facingOf(calls[0])).toBe("user");
  });

  it("never requests the opposite camera", async () => {
    // Simulate a device that refuses every facing constraint.
    const { calls } = installCamera((c) => {
      if (facingOf(c)) throw Object.assign(new Error("no"), { name: "OverconstrainedError" });
      return "environment";
    });
    await requestCameraStream({ facing: "user" });
    // Asking for the front camera must never turn into a request for the rear.
    expect(calls.map(facingOf).filter(Boolean)).not.toContain("environment");
  });

  it("rejects a stream that came back on the wrong side and keeps trying", async () => {
    // The bug: a device that ignores the hint and returns the camera already
    // open, with getUserMedia still resolving.
    const { calls } = installCamera((c) => (isExact(c) ? "user" : "environment"));
    const stream = await requestCameraStream({ facing: "user" });
    expect(facingOfTrack(stream.getVideoTracks()[0])).toBe("user");
    expect(isExact(calls[0])).toBe(true);
  });

  it("accepts a wrong-facing stream rather than failing when nothing else works", async () => {
    // Single-camera device: better to be live on the only lens than black.
    const { calls } = installCamera((c) => {
      if (isExact(c)) throw Object.assign(new Error("no"), { name: "OverconstrainedError" });
      return "environment";
    });
    const stream = await requestCameraStream({ facing: "user" });
    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("takes a track with unknown facing at face value", async () => {
    // Desktop webcams often report no facingMode; refusing those would break
    // the camera entirely on desktop.
    installCamera(() => null as unknown as CameraFacing);
    const stream = await requestCameraStream({ facing: "user" });
    expect(stream.getVideoTracks()).toHaveLength(1);
  });

  it("never substitutes Quest's avatar selfie camera for a room camera", async () => {
    const track = makeTrack(null, "Meta Avatar Camera");
    const getUserMedia = vi.fn(async () => makeStream(track));
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        userAgent: "Mozilla/5.0 OculusBrowser Quest 3",
        mediaDevices: { getUserMedia, enumerateDevices: async () => [] },
        permissions: undefined,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { isSecureContext: true, location: { hostname: "localhost" }, matchMedia: () => ({ matches: true }) },
    });

    await expect(requestCameraStream({ facing: "environment" })).rejects.toMatchObject({ cameraError: "notfound" });
    expect(track.stop).toHaveBeenCalled();
  });
});
