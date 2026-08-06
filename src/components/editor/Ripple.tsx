import { useEffect, useState } from "react";

type RippleEvent = { id: number; x: number; y: number };

/** Visual radial pulse spawned by Cmd/Ctrl-click in Performance Mode. */
export function RippleLayer() {
  const [ripples, setRipples] = useState<RippleEvent[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ x: number; y: number }>;
      if (!ce.detail) return;
      const id = performance.now();
      setRipples(rs => [...rs, { id, x: ce.detail.x, y: ce.detail.y }]);
      window.setTimeout(() => {
        setRipples(rs => rs.filter(r => r.id !== id));
      }, 850);
    };
    window.addEventListener("aegis:ripple", handler as EventListener);
    return () => window.removeEventListener("aegis:ripple", handler as EventListener);
  }, []);

  if (!ripples.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {ripples.map(r => (
        <span
          key={r.id}
          aria-hidden
          className="absolute motion-reduce:!animate-none"
          style={{
            left: r.x,
            top: r.y,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: "50%",
            border: "1px solid hsl(var(--accent))",
            boxShadow: "0 0 24px hsl(var(--accent) / 0.6)",
            animation: "ripplePulse 800ms ease-out forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes ripplePulse {
          0%   { opacity: 0.9; transform: scale(0.6); }
          100% { opacity: 0;   transform: scale(28); }
        }
      `}</style>
    </div>
  );
}
