/**
 * One film reel: a strip of product frames that scrolls along its own axis at
 * whatever angle, speed and heading the director handed it.
 *
 * Every heading — left, right, up, down, all four diagonals — is the same
 * strip rotated and travelling along its local X. Rotating the container
 * instead of special-casing eight directions keeps the scroll maths to one
 * line and lets the sprocket holes stay glued to the strip's long edges.
 */
import { useEffect, useRef } from "react";
import { sizedSrc, type DemoFrame } from "@/data/demoReel";
import type { ReelPhase, ReelPlan } from "./useReelDirector";

/** Frame box in px. The track length is derived from this, not measured. */
const FRAME_W = 220;
const FRAME_H = 165;
const FRAME_GAP = 10;
const PITCH = FRAME_W + FRAME_GAP;

/** Width the CDN is asked for — 2x the painted size, for retina. */
const THUMB_W = 320;

type Props = {
  plan: ReelPlan;
  phase: ReelPhase;
  onSelect: (src: string, productUrl: string) => void;
};

const phaseClass: Record<ReelPhase, string> = {
  gap: "",
  in: "reel-glitch-in",
  hold: "",
  out: "reel-glitch-out",
};

export const MoshReel = ({ plan, phase, onSelect }: Props) => {
  const trackRef = useRef<HTMLDivElement>(null);
  // Frames are meant to be clicked, and a target crossing the screen at
  // 200px/s is a target you miss. Pointing at the reel stops it.
  const paused = useRef(false);
  const { frames, angle, sign, cx, cy, speed } = plan;

  const base = frames.length * PITCH;
  // The strip has to outrun the viewport in whatever direction it is pointing,
  // so repeat the frames until the track clears the longest on-screen span
  // plus one full cycle — that spare cycle is what the wrap consumes.
  const span = typeof window === "undefined"
    ? 2000
    : Math.hypot(window.innerWidth, window.innerHeight);
  const reps = Math.max(2, Math.ceil(span / base) + 1);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let raf = 0;
    let last = performance.now();
    let pos = 0;

    const tick = (now: number) => {
      // rAF stops while the tab is hidden; clamp so returning to it doesn't
      // teleport the reel through a whole cycle.
      const dt = Math.min(now - last, 50) / 1000;
      last = now;
      if (!paused.current) {
        pos = (pos + speed * dt) % base;
        track.style.transform = `translate3d(${sign > 0 ? pos - base : -pos}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [base, sign, speed]);

  const strip: DemoFrame[] = [];
  for (let i = 0; i < reps; i++) strip.push(...frames);

  return (
    <div
      className={`pointer-events-none absolute z-10 ${phaseClass[phase]}`}
      // The spawn/despawn keyframes rewrite `transform` wholesale, so the
      // rotation travels as a custom property they can read back.
      style={{
        left: `${cx}%`,
        top: `${cy}%`,
        "--reel-angle": `${angle}deg`,
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      } as React.CSSProperties}
      aria-hidden={phase === "out"}
    >
      <div
        className="reel-strip reel-gate pointer-events-auto"
        style={{ width: reps * base }}
        onPointerEnter={() => { paused.current = true; }}
        onPointerLeave={() => { paused.current = false; }}
        onFocusCapture={() => { paused.current = true; }}
        onBlurCapture={() => { paused.current = false; }}
      >
        <div ref={trackRef} className="flex" style={{ gap: FRAME_GAP, willChange: "transform" }}>
          {strip.map((frame, i) => (
            <button
              key={`${frame.src}-${i}`}
              type="button"
              // Frames repeat, so only the first cycle is reachable by keyboard
              // and announced — the rest are the same products again.
              tabIndex={i < frames.length ? 0 : -1}
              aria-hidden={i >= frames.length}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(frame.src, frame.productUrl);
              }}
              className="reel-frame pointer-events-auto shrink-0"
              style={{ width: FRAME_W, height: FRAME_H }}
              title={`Mosh "${frame.label}"`}
            >
              <img
                src={sizedSrc(frame.src, THUMB_W)}
                alt={i < frames.length ? frame.label : ""}
                // Lazy loading tracks a transform-driven strip too slowly and
                // left frames blank — and which cycle is on screen at spawn
                // depends on the heading, so no cycle can be deprioritised.
                // The repeats reuse identical urls, so this is cheap: one
                // request per distinct frame, cache hits for the rest.
                loading="eager"
                decoding="async"
                draggable={false}
                className="h-full w-full object-cover"
              />
              <span className="reel-frame-label">{frame.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
