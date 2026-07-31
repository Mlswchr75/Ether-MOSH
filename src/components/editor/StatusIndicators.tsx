import { useEffect, useState } from "react";
import { useStore } from "@/store/useStore";

type Props = {
  isRecording: boolean;
};

/** Top-right status stack for the canvas. Visible in normal AND performance mode. */
export function StatusIndicators({ isRecording }: Props) {
  const micEnabled = useStore(s => s.micEnabled);
  const showFps = useStore(s => s.showFps);
  const slotFlash = useStore(s => s.slotFlash);
  const [micLevel, setMicLevel] = useState(0);
  const [fps, setFps] = useState(60);
  const [casting, setCasting] = useState(false);

  // Poll mic level + fps for cheap reactivity
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setMicLevel(((window as any).__aegisMicLevel as number) ?? 0);
      const f = (window as any).__aegisFps as number | undefined;
      if (typeof f === "number") setFps(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Naive cast detection: external display larger than the window
  useEffect(() => {
    const check = () => {
      try {
        const ext = window.screen.availWidth - window.outerWidth;
        const fsOnOther = !!document.fullscreenElement && window.screen.availWidth > window.innerWidth + 200;
        setCasting(ext > 200 || fsOnOther);
      } catch { setCasting(false); }
    };
    check();
    const id = window.setInterval(check, 1500);
    window.addEventListener("resize", check);
    return () => { window.clearInterval(id); window.removeEventListener("resize", check); };
  }, []);

  const liveAlpha = 0.4 + Math.min(0.6, micLevel * 0.9);

  return (
    <div className="pointer-events-none absolute top-4 right-4 z-40 flex flex-col items-end gap-1 font-mono text-[10px] uppercase tracking-[0.2em] select-none">
      {micEnabled && (
        <div className="flex items-center gap-1.5" style={{ color: "rgb(255 90 90 / 0.92)" }}>
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-current"
            style={{ opacity: liveAlpha, transition: "opacity 120ms linear" }}
          />
          <span>LIVE</span>
        </div>
      )}
      {isRecording && (
        <div className="flex items-center gap-1.5" style={{ color: "rgb(255 90 90 / 0.92)" }}>
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
          <span>REC</span>
        </div>
      )}
      {casting && (
        <div className="flex items-center gap-1.5 text-[hsl(var(--accent))]">
          <span aria-hidden>↗</span>
          <span>CASTING</span>
        </div>
      )}
      {showFps && (
        <div className="text-[hsl(var(--text-tertiary))]">
          {Math.round(fps)} FPS
        </div>
      )}
      {slotFlash !== null && (
        <div className="text-[hsl(var(--accent))] animate-ui-rise">
          SLOT {slotFlash + 1}
        </div>
      )}
    </div>
  );
}
