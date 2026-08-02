import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";

/** 24-bar frequency strip pinned to the bottom edge of the canvas. */
export function FrequencyStrip({ hidden = false }: { hidden?: boolean }) {
  const micEnabled = useStore(s => s.micEnabled);
  const containerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement[]>([]);
  const beatBoostRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bands = (window as any).__aegisAudioBands as Float32Array | undefined;
      const beatAt = (window as any).__aegisLastBeatAt as number | undefined;
      const now = performance.now();
      // Decay beat boost
      const sinceBeat = beatAt ? now - beatAt : 99999;
      beatBoostRef.current = sinceBeat < 240 ? 1 - sinceBeat / 240 : 0;
      const boost = 1 + beatBoostRef.current * 0.2;
      if (bands) {
        for (let i = 0; i < 24; i++) {
          const el = barsRef.current[i];
          if (!el) continue;
          const v = Math.min(1, bands[i] * boost);
          el.style.height = `${Math.max(1, v * 32)}px`;
          // Color interp text-secondary -> accent based on height
          el.style.background = `hsl(var(--accent) / ${0.25 + v * 0.65})`;
          el.style.opacity = String(0.55 + v * 0.45);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-[2px] px-[2px] transition-opacity duration-200"
      style={{ height: 32, opacity: micEnabled && !hidden ? 0.7 : 0 }}
    >
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { if (el) barsRef.current[i] = el; }}
          style={{ width: 2, height: 1, background: "hsl(var(--text-secondary))" }}
        />
      ))}
    </div>
  );
}

/** Inset border that pulses magenta on each detected beat. */
export function BeatBorder() {
  const [pulseKey, setPulseKey] = useState(0);
  const lastRef = useRef(0);

  useEffect(() => {
    const handler = () => {
      const now = performance.now();
      // Throttle to 8/sec
      if (now - lastRef.current < 125) return;
      lastRef.current = now;
      setPulseKey(k => k + 1);
    };
    window.addEventListener("aegis:beat", handler);
    return () => window.removeEventListener("aegis:beat", handler);
  }, []);

  if (!pulseKey) return null;
  return (
    <div
      key={pulseKey}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30"
      style={{
        boxShadow: "inset 0 0 0 1px hsl(var(--accent))",
        animation: "beatBorderPulse 320ms ease-out forwards",
      }}
    />
  );
}
