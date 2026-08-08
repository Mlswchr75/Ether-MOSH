import { useEffect, useState } from "react";

/**
 * Brief film-cut transition when a new image source loads:
 * - 80ms of white noise
 * - 240ms fade-in (no scale because the underlying canvas can't be transformed)
 * Skipped when prefers-reduced-motion is set.
 */
export function SourceTransition({ trigger }: { trigger: number }) {
  const [phase, setPhase] = useState<"noise" | "fade" | "off">("off");

  useEffect(() => {
    if (!trigger) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    setPhase("noise");
    const t1 = window.setTimeout(() => setPhase("fade"), 80);
    const t2 = window.setTimeout(() => setPhase("off"), 80 + 240);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [trigger]);

  if (phase === "off") return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40"
      style={{
        opacity: phase === "noise" ? 1 : 0,
        transition: phase === "fade" ? "opacity 240ms ease-out" : undefined,
        backgroundColor: "rgba(255,255,255,0.18)",
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.85'/></svg>\")",
        backgroundSize: "160px 160px",
        mixBlendMode: "screen",
      }}
    />
  );
}
