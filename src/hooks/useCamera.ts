import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

export type CameraFacing = "user" | "environment";

export type CameraDevice = {
  deviceId: string;
  label: string;
};

/**
 * Live camera source management.
 *
 * - Mobile: front/rear selection via `facingMode`, with the iOS-required
 *   stop-tracks-BEFORE-reopen dance (iOS Safari refuses to open a second
 *   camera while the first is still live).
 * - Desktop: enumerates `videoinput` devices so multi-webcam rigs can pick a
 *   specific unit. Labels only populate after the first permission grant, so
 *   the list is refreshed after each successful start.
 *
 * The acquired stream is handed to the store (`setVideoSource`), which owns
 * the <video> element the renderer consumes.
 */
export function useCamera() {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(
        all
          .filter(d => d.kind === "videoinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      );
    } catch {
      // enumeration unsupported — picker just stays empty
    }
  }, []);

  const start = useCallback(async (opts: { facing?: CameraFacing; deviceId?: string } = {}) => {
    const gen = ++generation.current;
    setStarting(true);
    setError(null);

    // iOS: release the previous camera fully before requesting the next one.
    const prev = useStore.getState().videoStream;
    if (prev) {
      try { prev.getTracks().forEach(t => t.stop()); } catch { /* already dead */ }
    }

    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      ...(opts.deviceId
        ? { deviceId: { exact: opts.deviceId } }
        : { facingMode: opts.facing ?? facing }),
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      if (gen !== generation.current) {
        // a newer start/stop superseded this request
        stream.getTracks().forEach(t => t.stop());
        return false;
      }
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.() ?? {};
      const actualFacing: CameraFacing =
        settings.facingMode === "user" ? "user"
        : settings.facingMode === "environment" ? "environment"
        : (opts.facing ?? facing);

      setFacing(actualFacing);
      setCurrentDeviceId(settings.deviceId ?? opts.deviceId ?? null);
      useStore.getState().setVideoSource(stream, track?.label || "live camera");
      setActive(true);
      void refreshDevices(); // labels become available post-grant
      return true;
    } catch (e) {
      if (gen !== generation.current) return false;
      const err = e as DOMException;
      setActive(false);
      setError(
        err?.name === "NotAllowedError" ? "Camera permission denied — allow access and retry."
        : err?.name === "NotFoundError" ? "No camera found on this device."
        : err?.name === "NotReadableError" ? "Camera is busy in another app."
        : "Couldn't start the camera.",
      );
      return false;
    } finally {
      if (gen === generation.current) setStarting(false);
    }
  }, [facing, refreshDevices]);

  const flip = useCallback(() => {
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    return start({ facing: next });
  }, [facing, start]);

  const selectDevice = useCallback((deviceId: string) => start({ deviceId }), [start]);

  const stop = useCallback(() => {
    generation.current++;
    useStore.getState().clearVideoSource();
    setActive(false);
    setStarting(false);
  }, []);

  // If something else replaces the source (image upload, clearImage), follow it.
  const storeStream = useStore(s => s.videoStream);
  useEffect(() => {
    if (!storeStream) setActive(false);
  }, [storeStream]);

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  return { active, starting, facing, devices, currentDeviceId, error, start, stop, flip, selectDevice };
}

/** Rough mobile check — used only to pick sensible camera defaults. */
export function isTouchDevice() {
  return typeof window !== "undefined" &&
    (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
}
