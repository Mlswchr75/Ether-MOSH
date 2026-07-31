import { useEffect, useMemo, useState } from "react";

type Hint = {
  text: string;
  cursive?: boolean;
  size?: string;
  rotate?: number;
  x: number; // % within column band
  y: number; // % within row band
  band: "tl" | "tr" | "bl" | "br" | "ml" | "mr";
  delay: number;
  duration: number;
};

const POOL: Array<{ text: string; cursive?: boolean; weight: number }> = [
  { text: "drop an image", weight: 3 },
  { text: "drop an image", weight: 2 },
  { text: "paste an image", weight: 2 },
  { text: "drag · drop · paste", weight: 1 },
  { text: "jpg · png · svg", weight: 1 },
  { text: "warp anything", weight: 1 },
  { text: "mosh anything", weight: 1 },
  { text: "browse", weight: 1 },
  { text: "upload", weight: 1 },
  { text: "mosh yourself", cursive: true, weight: 3 },
  { text: "start camera", cursive: true, weight: 3 },
  { text: "go live", cursive: true, weight: 2 },
  { text: "point · shoot · warp", cursive: true, weight: 1 },
];

// Six safe placement bands that avoid the vertical center where the MOSH button
// lives. Each band is a rectangle (in %) inside which we pick a random point.
const BANDS: Record<Hint["band"], { xMin: number; xMax: number; yMin: number; yMax: number }> = {
  tl: { xMin: 3,  xMax: 32, yMin: 6,  yMax: 26 },
  tr: { xMin: 62, xMax: 94, yMin: 6,  yMax: 26 },
  ml: { xMin: 2,  xMax: 20, yMin: 34, yMax: 62 },
  mr: { xMin: 78, xMax: 96, yMin: 34, yMax: 62 },
  bl: { xMin: 4,  xMax: 34, yMin: 70, yMax: 90 },
  br: { xMin: 60, xMax: 92, yMin: 70, yMax: 90 },
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pickWeighted = <T,>(items: Array<T & { weight: number }>): T => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const it of items) { r -= it.weight; if (r <= 0) return it; }
  return items[0];
};

function generateHints(): Hint[] {
  const bands: Hint["band"][] = ["tl", "tr", "ml", "mr", "bl", "br"];
  // 2 hints per band; each at a random point inside its band.
  const hints: Hint[] = [];
  let orderIdx = 0;
  for (const band of bands) {
    const b = BANDS[band];
    const perBand = 1 + Math.floor(Math.random() * 2); // 1 or 2
    for (let i = 0; i < perBand; i++) {
      const pick = pickWeighted(POOL);
      const cursive = pick.cursive ?? false;
      hints.push({
        text: pick.text,
        cursive,
        size: cursive
          ? `${Math.round(rand(18, 30))}px`
          : `${Math.round(rand(10, 13))}px`,
        rotate: rand(-10, 10),
        x: rand(b.xMin, b.xMax),
        y: rand(b.yMin, b.yMax),
        band,
        delay: 200 + orderIdx * 220 + Math.random() * 300,
        duration: cursive ? 1400 : 900,
      });
      orderIdx++;
    }
  }
  return hints;
}

function TypedHint({ hint }: { hint: Hint }) {
  const [chars, setChars] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + hint.delay;
    const total = hint.text.length;
    const step = () => {
      const now = performance.now();
      if (now < start) { raf = requestAnimationFrame(step); return; }
      const t = Math.min(1, (now - start) / hint.duration);
      setChars(Math.round(t * total));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hint.delay, hint.duration, hint.text]);

  const visible = hint.text.slice(0, chars);
  const done = chars >= hint.text.length;

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: `${hint.x}%`,
    top: `${hint.y}%`,
    transform: `translate(-50%, -50%) rotate(${hint.rotate}deg)`,
    fontSize: hint.size,
    whiteSpace: "nowrap",
    color: hint.cursive
      ? "hsl(var(--accent) / 0.72)"
      : "hsl(var(--foreground) / 0.45)",
    textShadow: hint.cursive
      ? "0 0 12px hsl(var(--accent) / 0.35)"
      : "0 1px 6px rgba(0,0,0,0.6)",
    letterSpacing: hint.cursive ? "0.01em" : "0.28em",
    textTransform: hint.cursive ? "none" : "uppercase",
    fontFamily: hint.cursive
      ? "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', 'Homemade Apple', cursive"
      : "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
    fontStyle: hint.cursive ? "italic" : "normal",
    fontWeight: hint.cursive ? 400 : 500,
    userSelect: "none",
    pointerEvents: "none",
    opacity: chars > 0 ? 1 : 0,
    transition: "opacity 200ms ease-out",
  };

  return (
    <span style={baseStyle} aria-hidden="true">
      {visible}
      {!done && (
        <span
          style={{
            display: "inline-block",
            width: hint.cursive ? "0.5ch" : "0.6ch",
            marginLeft: "0.05em",
            background: hint.cursive ? "hsl(var(--accent) / 0.7)" : "hsl(var(--foreground) / 0.6)",
            height: hint.cursive ? "0.85em" : "0.9em",
            verticalAlign: "-0.05em",
            animation: "caretBlink 0.9s steps(2) infinite",
          }}
        />
      )}
    </span>
  );
}

export function ScatteredHints({ seed }: { seed?: number }) {
  const hints = useMemo(() => generateHints(), [seed]);
  return (
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden" aria-hidden="true">
      {hints.map((h, i) => (
        <TypedHint key={i} hint={h} />
      ))}
      <style>{`
        @keyframes caretBlink { 0%,50% { opacity: 1 } 51%,100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) {
          .no-motion, .no-motion * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </div>
  );
}
