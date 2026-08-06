import { useEffect, useRef } from "react";
import { getAudioData } from "@/engine/audioAnalyzer";

/** 3-bar live audio HUD pinned bottom-left; updates via direct DOM writes. */
export function SystemAudioHud({ visible }: { visible: boolean }) {
  const bassRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const highRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      const { bass, mid, high } = getAudioData();
      if (bassRef.current) bassRef.current.style.height = `${Math.max(2, bass * 28)}px`;
      if (midRef.current)  midRef.current.style.height  = `${Math.max(2, mid  * 28)}px`;
      if (highRef.current) highRef.current.style.height = `${Math.max(2, high * 28)}px`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-3 left-3 z-40 flex items-end gap-[3px] rounded-full px-2 py-1.5"
      style={{ height: 36, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
    >
      {[bassRef, midRef, highRef].map((r, i) => (
        <div
          key={i}
          ref={r}
          style={{
            width: 4,
            height: 2,
            background: "#00ffff",
            boxShadow: "0 0 6px #00ffff",
            borderRadius: 2,
            transition: "height 60ms linear",
          }}
        />
      ))}
    </div>
  );
}
