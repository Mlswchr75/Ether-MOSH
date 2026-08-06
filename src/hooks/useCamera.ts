import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

// Facing helpers live in a dependency-free module so the store can use them
// without importing this file (which imports the store).
export { facingOfTrack } from "@/lib/cameraFacing";
export type { CameraFacing } from "@/lib/cameraFacing";
import { facingOfTrack } from "@/lib/cameraFacing";
import type { CameraFacing } from "@/lib/cameraFacing";
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

/** Warm up the camera stream in a hidden HTML5 video element to ensure active pixels on macOS/iOS */
async function warmUpCameraVideo(stream: MediaStream): Promise<void> {
  if (typeof window === "undefined") return;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;

  return new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        video.pause();
        video.srcObject = null;
        video.remove();
        resolve();
      }
    };

    const timeout = setTimeout(finish, 1000); // 1-second max safety fallback

    video.onloadedmetadata = () => {
      video.play().then(() => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          clearTimeout(timeout);
          finish();
        }
      }).catch(finish);
    };

    // If metadata doesn't fire immediately, check timeupdate
    video.ontimeupdate = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        clearTimeout(timeout);
        finish();
      }
    };
  });
}

/**
 * Constraints to try, most specific first.
 *
 * `facingMode: { ideal: … }` is only advisory: a device free to ignore it will
 * return the camera that is already open and getUserMedia still RESOLVES. That
 * is why flipping could appear to do nothing — the request "succeeded" with the
 * wrong camera. `exact` fails loudly instead, so we can fall through to a
 * broader attempt rather than silently keeping the same lens.
 *
 * Note there is deliberately no fallback to the OPPOSITE facing here. Asking
 * for the front camera, failing, and then explicitly requesting the rear one is
 * the exact opposite of what a flip wants; the bare `{ video: true }` at the end
 * still guarantees a stream on single-camera devices.
 */
function constraintChain(facing: CameraFacing, deviceId?: string): MediaStreamConstraints[] {
  const chain: MediaStreamConstraints[] = [];
  if (deviceId) {
    chain.push({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    chain.push({ video: { deviceId: { exact: deviceId } }, audio: false });
  }
  chain.push({ video: { facingMode: { exact: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  chain.push({ video: { facingMode: { exact: facing } }, audio: false });
  chain.push({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  chain.push({ video: { facingMode: facing }, audio: false });
  chain.push({ video: true, audio: false });
  return chain;
}

/**
 * Last resort when no facingMode constraint lands on the requested camera:
 * enumerate the actual devices and open them one at a time until a track
 * reports the side we want. Needed on desktop and on Android browsers that
 * report no facingMode at all.
 */
async function streamByDeviceLabel(facing: CameraFacing): Promise<MediaStream | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    if (cams.length < 2) return null;   // nothing to choose between
    const wanted = facing === "user" ? /front|user|face/i : /back|rear|environment/i;
    for (const cam of cams) {
      if (cam.label && !wanted.test(cam.label)) continue;
      try {
        const s = await safeGetUserMedia({ video: { deviceId: { exact: cam.deviceId } }, audio: false });
        const got = facingOfTrack(s.getVideoTracks()[0]);
        if (got === null || got === facing) return s;
        s.getTracks().forEach(t => t.stop());
      } catch { /* try the next camera */ }
    }
  } catch { /* enumeration unavailable — caller falls back */ }
  return null;
}

export async function requestCameraStream(opts?: { facing?: CameraFacing; deviceId?: string }): Promise<MediaStream> {
  const nav = navigator as unknown as { getUserMedia?: unknown; webkitGetUserMedia?: unknown; mozGetUserMedia?: unknown };
  const hasAny =
    !!navigator.mediaDevices?.getUserMedia || !!nav.getUserMedia || !!nav.webkitGetUserMedia || !!nav.mozGetUserMedia;
  if (!hasAny) {
    const e = new Error("Camera not supported");
    (e as unknown as { cameraError: CameraError }).cameraError = "unsupported";
    throw e;
  }
  
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    const e = new Error("Camera requires HTTPS");
    (e as unknown as { cameraError: CameraError }).cameraError = "permission";
    throw e;
  }

  const facing = opts?.facing ?? defaultFacing();
  const chain = constraintChain(facing, opts?.deviceId);

  let lastErr: unknown = null;
  // Keep the first working-but-wrong-facing stream as a safety net, so a device
  // that simply has no camera on the requested side still ends up live rather
  // than black.
  let fallback: MediaStream | null = null;

  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const isLastResort = i === chain.length - 1;   // bare { video: true }
    try {
      const stream = await safeGetUserMedia(c);
      const track = stream?.getVideoTracks()[0];
      if (stream && track && track.readyState === "live") {
        // Trust the track, not the request. A soft constraint can resolve with
        // the camera that was already open, which is how a flip silently
        // becomes a no-op.
        const got = facingOfTrack(track);
        if (isLastResort || got === null || got === facing) {
          // 🔥 Warm up video playback so hardware feeds valid frames before WebGL canvas reads it
          await warmUpCameraVideo(stream);
          return stream;
        }
        if (!fallback) fallback = stream;
        else stream.getTracks().forEach(t => t.stop());
        continue;
      }
      lastErr = Object.assign(new Error("no video tracks"), { name: "NotFoundError" });
    } catch (err) {
      lastErr = err;
      const tag = classifyError(err);
      if (tag === "permission") break;
    }
  }

  // No constraint landed on the requested side — pick the device by label.
  const byDevice = await streamByDeviceLabel(facing);
  if (byDevice) {
    if (fallback) fallback.getTracks().forEach(t => t.stop());
    await warmUpCameraVideo(byDevice);
    return byDevice;
  }
  if (fallback) {
    await warmUpCameraVideo(fallback);
    return fallback;
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
      return true;
    } catch (err) {
      setError((err as { cameraError?: CameraError }).cameraError ?? "unknown");
      setIsLive(false);
      return false;
    }
  }, [facing, deviceId, setVideoSource, refreshDevices]);

  const flip = useCallback(() => {
    const next: CameraFacing = facing === "user" ? "environment" : "user";
    start({ facing: next, deviceId: undefined });
  }, [facing, start]);

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
