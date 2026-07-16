import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, SwitchCamera, Video } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/hooks/useHaptics";
import { useCamera, isTouchDevice } from "@/hooks/useCamera";

/**
 * LIVE control cluster. One tap starts the camera (rear on phones, default
 * webcam on desktop); once live, a flip button swaps front/rear and a device
 * list appears for multi-webcam setups. All touch targets are ≥44px.
 */
export const CameraMenu = ({ autoStart }: { autoStart?: boolean }) => {
  const cam = useCamera();
  const [menuOpen, setMenuOpen] = useState(false);
  const touch = isTouchDevice();
  const autoStarted = useRef(false);

  useEffect(() => {
    if (autoStart && !autoStarted.current) {
      autoStarted.current = true;
      void cam.start({ facing: touch ? "environment" : "user" }).then(ok => {
        if (ok) toast.success("Live camera on");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    if (cam.error) toast.error(cam.error);
  }, [cam.error]);

  const startDefault = async () => {
    haptic(10);
    const ok = await cam.start({ facing: touch ? "environment" : "user" });
    if (ok) toast.success("Live camera on");
  };

  const btn = "flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 border font-mono text-[10px] uppercase tracking-[0.2em] transition px-3";

  if (!cam.active) {
    return (
      <button
        type="button"
        onClick={startDefault}
        disabled={cam.starting}
        className={`${btn} border-border text-foreground/70 hover:border-accent hover:text-accent disabled:opacity-50`}
        aria-label="Start live camera"
      >
        <Camera className="h-4 w-4" />
        <span className="hidden sm:inline">{cam.starting ? "starting…" : "live"}</span>
      </button>
    );
  }

  return (
    <div className="relative flex items-center gap-1.5">
      <span className="mr-1 hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] text-primary sm:flex">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
        live
      </span>

      <button
        type="button"
        onClick={() => { haptic(10); void cam.flip(); }}
        disabled={cam.starting}
        className={`${btn} border-accent/60 text-accent hover:border-accent disabled:opacity-50`}
        aria-label={cam.facing === "user" ? "Switch to rear camera" : "Switch to front camera"}
        title={cam.facing === "user" ? "rear cam" : "front cam"}
      >
        <SwitchCamera className="h-4 w-4" />
      </button>

      {cam.devices.length > 1 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            className={`${btn} border-border text-foreground/70 hover:border-accent hover:text-accent`}
            aria-label="Pick camera device"
            aria-expanded={menuOpen}
          >
            <Video className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-56 border border-border bg-card p-1 shadow-xl">
              {cam.devices.map(d => (
                <button
                  key={d.deviceId}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    haptic(8);
                    void cam.selectDevice(d.deviceId).then(ok => {
                      if (ok) toast.success(`Camera: ${d.label}`);
                    });
                  }}
                  className={`block w-full truncate px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-wider transition hover:bg-accent/10 hover:text-accent ${
                    d.deviceId === cam.currentDeviceId ? "text-accent" : "text-foreground/70"
                  }`}
                >
                  {d.deviceId === cam.currentDeviceId ? "▸ " : ""}{d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => { haptic([10, 30, 10]); cam.stop(); toast("Camera stopped"); }}
        className={`${btn} border-primary/60 text-primary hover:border-primary`}
        aria-label="Stop camera"
      >
        <CameraOff className="h-4 w-4" />
      </button>
    </div>
  );
};
