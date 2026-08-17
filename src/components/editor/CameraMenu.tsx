import { Camera, FlipHorizontal2, StopCircle, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import { toast } from "sonner";

export function CameraMenu() {
  const { isLive, facing, devices, start, stop, flip, error } = useCamera();
  const [open, setOpen] = useState(false);
  const wasLiveRef = useRef(isLive);

  // flip() and the device-picker below both call start() fire-and-forget, so
  // a failure (no rear camera, device busy/disconnected) otherwise stops the
  // stream with zero feedback — the LIVE badge just disappears. Watching
  // `error` here catches both without duplicating start()'s logic. Gated on
  // "was live a moment ago" so this doesn't also fire (and double up with
  // handleStart's own toast) for a plain failed initial camera request.
  useEffect(() => {
    if (error && wasLiveRef.current) {
      toast.error("Couldn't switch camera. Tap the camera button to reconnect.");
    }
    wasLiveRef.current = isLive;
  }, [error, isLive]);

  const handleStart = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera not supported on this browser");
      return;
    }
    const ok = await start();
    if (!ok) {
      toast.error("Couldn't access camera — check browser permissions and try again");
    }
    setOpen(false);
  };

  if (isLive) {
    return (
      <div className="flex items-center gap-1">
        <button
          onClick={flip}
          title={`Switch to ${facing === "user" ? "rear" : "front"} camera`}
          className="flex h-12 w-12 items-center justify-center rounded text-foreground/70 hover:text-accent hover:bg-surface-1 transition"
        >
          <FlipHorizontal2 className="h-5 w-5" />
        </button>
        <button
          onClick={stop}
          title="Stop camera"
          className="flex h-12 w-12 items-center justify-center rounded text-foreground/70 hover:text-destructive hover:bg-surface-1 transition"
        >
          <StopCircle className="h-5 w-5" />
        </button>
        {devices.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex h-12 items-center gap-0.5 rounded px-1 text-foreground/50 hover:text-foreground hover:bg-surface-1 transition"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open && (
              <div className="absolute top-full mt-1 right-0 z-50 min-w-[180px] rounded border border-border bg-surface-0 shadow-modal py-1">
                {devices.map(d => (
                  <button
                    key={d.deviceId}
                    onClick={() => { start({ deviceId: d.deviceId }); setOpen(false); }}
                    className="block w-full px-3 py-2 text-left font-mono text-xs text-foreground/80 hover:bg-surface-1 hover:text-foreground transition truncate"
                  >
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent animate-pulse-soft select-none">LIVE</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleStart}
      title="Go live — use camera as source"
      className="flex h-12 items-center gap-2 rounded px-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 hover:text-accent hover:bg-surface-1 transition"
    >
      <Camera className="h-4 w-4" />
      live
    </button>
  );
}
