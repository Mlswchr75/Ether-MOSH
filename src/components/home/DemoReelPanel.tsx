/**
 * Second title screen. Product photography from the Aesthetic Rebellion
 * catalogue runs past on a glitching film reel; any frame can be grabbed and
 * dropped straight into the instrument, so nobody has to go find an image of
 * their own before they can play with the thing.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { loadDemoFrames, shuffle, sizedSrc, type DemoFrame } from "@/data/demoReel";
import { MoshReel } from "./MoshReel";
import { AmbientGlitch } from "./AmbientGlitch";
import { useReelDirector } from "./useReelDirector";

type Props = {
  onSelect: (src: string, productUrl: string) => void;
};

/** How many frames the reduced-motion grid shows instead of a moving reel. */
const STILLS = 12;

export const DemoReelPanel = ({ onSelect }: Props) => {
  const [pool, setPool] = useState<DemoFrame[]>([]);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    let alive = true;
    loadDemoFrames().then((frames) => {
      if (alive) setPool(frames);
    });
    return () => { alive = false; };
  }, []);

  // Nothing spawns until the panel is actually on screen — no point animating
  // a reel, or burning CDN requests, behind the hero.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { plan, phase } = useReelDirector(pool, visible && !reduced);

  const stills = useMemo(() => (reduced ? shuffle(pool).slice(0, STILLS) : []), [reduced, pool]);

  return (
    <section
      ref={panelRef}
      aria-label="Demo frames from the Aesthetic Rebellion catalogue"
      className="relative h-screen w-screen shrink-0 snap-start overflow-hidden bg-background"
    >
      <div className="pointer-events-none absolute inset-0 scanline opacity-40" />
      <AmbientGlitch active={visible && !reduced} />

      {plan && <MoshReel plan={plan} phase={phase} onSelect={onSelect} />}

      {reduced && (
        <div className="absolute inset-0 z-10 grid grid-cols-2 content-center gap-3 overflow-y-auto p-8 sm:grid-cols-4 lg:grid-cols-6">
          {stills.map((frame) => (
            <button
              key={frame.src}
              type="button"
              onClick={() => onSelect(frame.src, frame.productUrl)}
              className="reel-frame aspect-[4/3]"
              title={`Mosh "${frame.label}"`}
            >
              <img
                src={sizedSrc(frame.src, 320)}
                alt={frame.label}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="reel-frame-label">{frame.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Title block sits above the reel so a frame never scrolls over the
          instructions, and stays click-through so the reel behind it works. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-background/55 px-6 py-5 backdrop-blur-[3px]">
          <h2 className="mosh-text font-mono text-3xl uppercase tracking-[0.3em] text-foreground sm:text-5xl" data-text="demo frames">
            demo frames
          </h2>
          <p className="mt-4 max-w-md font-mono text-[11px] uppercase leading-relaxed tracking-[0.25em] text-foreground/65">
            {pool.length > 0
              ? `${pool.length} frames from the aesthetic rebellion catalogue · tap one to mosh it`
              : "loading frames…"}
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35">
            reels respawn · new spot · new direction
          </p>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-8 left-0 right-0 z-20 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/40">
        ↑ back to the instrument
      </div>
    </section>
  );
};
