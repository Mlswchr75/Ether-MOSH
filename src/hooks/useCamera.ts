import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

export type CameraFacing = "user" | "environment";
export type CameraError = "permission" | "busy" | "notfound" | "aborted" | "unsupported" | "unknown";

/** Default facing: front camera on desktop (webcam), rear camera on touch devices. */
export function defaultFacing(): CameraFacing {
  if (typeof window === "undefined") return "environment";
  return window.matchMedia?.("(pointer: coarse)").matches ? "environment" : "user";
}

/** True when the browser has previously granted camera permission. */
export async function isCameraPreGranted(): Promise<boolean> {
  try {
    const anyPerms = navigator.permissions as (Permissions & { query: (d: { name: string }) => Promise<PermissionStatus> }) | undefined;
    if (!anyPerms?.query) return false;
    const r = await anyPerms.query({ name: "camera" });
    return r.state === "granted";
  } catch { return false; }
}

/** Map a getUserMedia rejection to our tagged error. */
function classifyError(err: unknown): CameraError {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "notfound";
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") return "notfound";
  if (name === "AbortError") return "aborted";
  if (name === "TypeError") return "unsupported";
  return "unknown";
}

/** Legacy getUserMedia shim for older browsers that lack `mediaDevices`. */
function legacyGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  const nav = navigator as unknown as {
    getUserMedia?: (c: MediaStreamConstraints, s: (m: MediaStream) => void, e: (err: unknown) => void) => void;
    webkitGetUserMedia?: typeof nav.getUserMedia;
    mozGetUserMedia?: typeof nav.getUserMedia;
    msGetUserMedia?: typeof nav.getUserMedia;
  };
  const legacy = nav.getUserMedia ?? nav.webkitGetUserMedia ?? nav.mozGetUserMedia ?? nav.msGetUserMedia;
  if (!legacy) return Promise.reject(Object.assign(new Error("unsupported"), { name: "TypeError" }));
  return new Promise((resolve, reject) => legacy.call(navigator, constraints, resolve, reject));
}

/** Unified getUserMedia call that also covers older browsers. */
async function safeGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  return legacyGetUserMedia(constraints);
}

/**
 * Build a progressive fallback chain of constraints. We start with the caller's
 * preferred facing/device and gradually relax constraints so that quirky mobile
 * browsers (in-app webviews, older Android Chrome, iOS Safari in odd contexts)
 * still surface *some* working camera rather than throwing.
 */
function constraintChain(facing: CameraFacing, deviceId?: string): MediaStreamConstraints[] {
  const chain: MediaStreamConstraints[] = [];
  if (deviceId) {
    chain.push({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    chain.push({ video: { deviceId: { exact: deviceId } }, audio: false });
  }
  chain.push({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  chain.push({ video: { facingMode: facing }, audio: false });
  const other: CameraFacing = facing === "user" ? "environment" : "user";
  chain.push({ video: { facingMode: { ideal: other } }, audio: false });
  chain.push({ video: true, audio: false });
  return chain;
}

/**
 * Call inside a user gesture. Tries a progressive chain of constraints so the
 * camera starts on as many devices/browsers as possible. Returns the stream or
 * throws with a tagged `.cameraError` property describing the first hard failure.
 */
export async function requestCameraStream(opts?: { facing?: CameraFacing; deviceId?: string }): Promise<MediaStream> {
  // Feature-detect: mediaDevices OR any legacy shim.
  const nav = navigator as unknown as { getUserMedia?: unknown; webkitGetUserMedia?: unknown; mozGetUserMedia?: unknown };
  const hasAny =
    !!navigator.mediaDevices?.getUserMedia || !!nav.getUserMedia || !!nav.webkitGetUserMedia || !!nav.mozGetUserMedia;
  if (!hasAny) {
    const e = new Error("Camera not supported");
    (e as unknown as { cameraError: CameraError }).cameraError = "unsupported";
    throw e;
  }
  // Insecure origin → getUserMedia will always reject; give a clear message.
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    const e = new Error("Camera requires HTTPS");
    (e as unknown as { cameraError: CameraError }).cameraError = "permission";
    throw e;
  }

  const facing = opts?.facing ?? defaultFacing();
  const chain = constraintChain(facing, opts?.deviceId);

  let lastErr: unknown = null;
  for (const c of chain) {
    try {
      const stream = await safeGetUserMedia(c);
      if (stream && stream.getVideoTracks().length > 0) return stream;
      // Empty stream — treat as notfound and try next.
      lastErr = Object.assign(new Error("no video tracks"), { name: "NotFoundError" });
    } catch (err) {
      lastErr = err;
      const tag = classifyError(err);
      // Permission errors are terminal — retrying won't help and can annoy the user.
      if (tag === "permission") break;
      // Otherwise keep trying the next relaxed constraint.
    }
  }
  const tagged = (lastErr instanceof Error ? lastErr : new Error("Camera failed")) as Error & { cameraError?: CameraError };
  tagged.cameraError = classifyError(lastErr);
  throw tagged;
}

export function useCamera() {
  const setVideoSource = useStore(s => s.setVideoSource);
  const clearVideoSource = useStore(s => s.clearVideoSource);

  const [isLive, setIsLive] = useState(false);
  const [facing, setFacing] = useState<CameraFacing>(defaultFacing());
  const [error, setError] = useState<CameraError | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter(d => d.kind === "videoinput"));
    } catch { /* noop */ }
  }, []);

  const stopCurrent = useCallback(() => {
    const s = activeStreamRef.current;
    if (s) { s.getTracks().forEach(t => t.stop()); activeStreamRef.current = null; }
    clearVideoSource();
    setIsLive(false);
  }, [clearVideoSource]);

  const start = useCallback(async (opts?: { facing?: CameraFacing; deviceId?: string }) => {
    setError(null);
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
      // iOS needs a real event-loop turn (≥100 ms) to release hardware before getUserMedia
      await new Promise<void>(r => setTimeout(r, 150));
    }
    const f = opts?.facing ?? facing;
    const did = opts?.deviceId ?? deviceId;
    try {
      const stream = await requestCameraStream({ facing: f, deviceId: did });
      activeStreamRef.current = stream;
      setVideoSource(stream, f === "user" ? "front camera" : "rear camera");
      setIsLive(true);
      if (opts?.facing) setFacing(opts.facing);
      if (opts?.deviceId !== undefined) setDeviceId(opts.deviceId);
      refreshDevices();
    } catch (err) {
      setError((err as { cameraError?: CameraError }).cameraError ?? "unknown");
      setIsLive(false);
    }
  }, [facing, deviceId, setVideoSource, refreshDevices]);

  const flip = useCallback(() => {
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    start({ facing: next, deviceId: undefined });
  }, [facing, start]);

  // Enumerate immediately on mount (labels may be empty until permission)
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    refreshDevices();
    const onChange = () => refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, [refreshDevices]);

  useEffect(() => {
    const onVis = () => { if (document.hidden && isLive) stopCurrent(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isLive, stopCurrent]);

  useEffect(() => () => { stopCurrent(); }, [stopCurrent]);

  return {
    isLive, facing, error, devices, start, stop: stopCurrent, flip,
    setDeviceId: (id: string) => start({ deviceId: id }),
  };
}
