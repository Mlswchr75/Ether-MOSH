import { Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { defaultFacing, requestCameraStream, type CameraError } from "@/hooks/useCamera";

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
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 px-6 text-center"
         style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div
        aria-hidden="true"
        className="mosh-text font-sans text-[10vw] leading-[0.9] font-bold tracking-tighter sm:text-6xl md:text-7xl lg:text-8xl"
        data-text="TAP TO GO LIVE"
      >
        TAP TO GO LIVE
      </div>

      <button
        type="button"
        onClick={handle}
        disabled={starting}
        aria-label="Start live camera"
        className="pointer-events-auto group relative inline-flex items-center gap-3 rounded-full border border-primary/70 bg-background/30 px-8 py-5 font-mono text-sm uppercase tracking-[0.35em] text-primary backdrop-blur-[2px] transition-all disabled:opacity-60 disabled:cursor-wait hover:bg-primary/10 hover:scale-[1.03] active:scale-[0.98] min-h-[48px]"
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

      <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-foreground/60">
        or drop an image · paste · pick from menu
      </p>
    </div>
  );
}
