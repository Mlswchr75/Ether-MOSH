/**
 * Occasional small glitch flashes scattered behind the reel — texture for
 * the demo-frames panel's empty space, not another thing competing for
 * attention with the reel or the title copy. Each pulse is a short-lived DOM
 * node driven by a single CSS keyframe (see .bg-glitch-pulse); there's no
 * render loop, so it's cheap enough to leave running for as long as the
 * panel is in view.
 */
import { useEffect, useRef, useState } from "react";

type Pulse = { id: number; x: number; y: number; w: number; h: number; dur: number };

let nextId = 0;

export function AmbientGlitch({ active }: { active: boolean }) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) { setPulses([]); return; }
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let alive = true;
    const schedule = () => {
      // 1.4–4s between flashes — frequent enough to read as alive, rare
      // enough to stay background noise rather than a second animation.
      const delay = 1400 + Math.random() * 2600;
      timerRef.current = window.setTimeout(() => {
        if (!alive) return;
        const dur = 380 + Math.random() * 420;
        const pulse: Pulse = {
          id: nextId++,
          x: 4 + Math.random() * 88,
          y: 8 + Math.random() * 80,
          w: 8 + Math.random() * 18,
          h: 4 + Math.random() * 9,
          dur,
        };
        // Cap concurrent pulses — a burst of stale timers (e.g. after a tab
        // was backgrounded) shouldn't paint a screenful at once.
        setPulses(p => [...p.slice(-4), pulse]);
        window.setTimeout(() => {
          if (alive) setPulses(p => p.filter(x => x.id !== pulse.id));
        }, dur + 50);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      alive = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [active]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      {pulses.map(p => (
        <span
          key={p.id}
          className="bg-glitch-pulse absolute block"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.w}vw`,
            height: `${p.h}vh`,
            background: "linear-gradient(90deg, hsl(var(--accent) / 0.5), hsl(var(--primary) / 0.4))",
            "--dur": `${p.dur}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
