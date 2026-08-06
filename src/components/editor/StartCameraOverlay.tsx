import { Video } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { defaultFacing, requestCameraStream, type CameraError } from "@/hooks/useCamera";
import { RoamingPhrases } from "./RoamingPhrases";

const ERR: Record<CameraError, string> = {
  permission: "Camera blocked — tap the lock icon in your address bar and allow camera, then try again",
  busy: "Camera is in use by another app — close it (Zoom, FaceTime, etc.) and try again",
  notfound: "No camera found on this device — try a different device or drop an image instead",
  aborted: "Camera start was interrupted — tap again",
  unsupported: "This browser can't access the camera — open MOSH in Chrome, Safari or Firefox",
  unknown: "Couldn't access camera — reload the page and try again",
};

/**
 * Editor empty-state: mirrors the home-screen "TAP TO GO LIVE" hero.
 * Calls getUserMedia synchronously in the click handler (no intermediary hook)
 * so the stream survives after this overlay unmounts once a source is set.
 */
export function StartCameraOverlay() {
  const setVideoSource = useStore(s => s.setVideoSource);
  const [starting, setStarting] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handle = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const facing = defaultFacing();
      const stream = await requestCameraStream({ facing });
      setVideoSource(stream, facing === "user" ? "front camera" : "rear camera");
    } catch (err) {
      const tag = (err as { cameraError?: CameraError }).cameraError ?? "unknown";
      toast.error(ERR[tag]);
      setStarting(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Beneath the button in paint order, so a phrase wide enough to be
          allowed past the collision test reads as passing behind it. */}
      <RoamingPhrases buttonRef={btnRef} />

      <div
        className="absolute inset-0 flex items-center justify-center px-6 text-center"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          ref={btnRef}
          type="button"
          onClick={handle}
          disabled={starting}
          aria-label="Start live camera"
          className="pointer-events-auto group relative z-10 inline-flex items-center gap-3 rounded-full border border-primary/70 bg-background/30 px-8 py-5 font-mono text-sm uppercase tracking-[0.35em] text-primary backdrop-blur-[2px] transition-all disabled:opacity-60 disabled:cursor-wait hover:bg-primary/10 hover:scale-[1.03] active:scale-[0.98] min-h-[48px]"
          style={{
            boxShadow: "0 0 60px hsl(var(--primary) / 0.5), inset 0 0 24px hsl(var(--accent) / 0.2)",
          }}
        >
          <span className="relative flex h-8 w-8 items-center justify-center" style={{ mixBlendMode: "screen" }}>
            <Video className="h-6 w-6 mosh-glitch" aria-hidden="true" />
            <span
              className="absolute inset-0 rounded-full animate-pulse-soft"
              style={{ boxShadow: "0 0 18px hsl(var(--accent) / 0.6)" }}
            />
          </span>
          {starting ? "starting…" : "go live"}
        </button>
      </div>

      {/* The roaming phrases are decorative and aria-hidden, so the guidance
          they replaced still has to reach assistive tech from somewhere. */}
      <p className="sr-only">
        You can also drop an image, paste from the clipboard, browse for a file,
        select a folder, or load a demo from the menu.
      </p>
    </div>
  );
}
