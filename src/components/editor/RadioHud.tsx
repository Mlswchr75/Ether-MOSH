import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { trackPlayer, type ShowcaseTrack } from "@/engine/trackPlayer";

/**
 * The station ident.
 *
 * Two competing jobs: a viewer who just landed wants to know what this is and
 * what is playing; a stream that has been up for six hours wants a clean frame.
 * So the card states itself loudly for a few seconds after every track change
 * and then recedes to a thin now-playing line, which is also what a broadcast
 * lower-third does and for the same reason.
 *
 * `?hud=0` removes it entirely, for a capture that should carry no chrome at all.
 */
export function RadioHud({
  station,
  nowPlaying,
  upNext,
  onSkip,
}: {
  station: string;
  nowPlaying: ShowcaseTrack | null;
  upNext: ShowcaseTrack | null;
  onSkip: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  // Announce, then recede.
  useEffect(() => {
    if (!nowPlaying) return;
    setExpanded(true);
    const id = window.setTimeout(() => setExpanded(false), 9_000);
    return () => window.clearTimeout(id);
  }, [nowPlaying]);

  // Progress is written straight to the node — a state update per frame for a
  // 4px bar would re-render this card ~200,000 times over an overnight stream.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bar = barRef.current;
      if (bar) {
        const duration = trackPlayer.duration();
        const ratio = duration > 0 ? Math.min(1, trackPlayer.position() / duration) : 0;
        bar.style.transform = `scaleX(${ratio})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!nowPlaying) return null;

  return (
    <div
      className="absolute bottom-6 left-6 z-40 select-none overflow-hidden rounded-2xl transition-all duration-700"
      style={{
        background: "rgba(4,2,10,0.62)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 0 40px rgba(0,255,255,0.10)",
        maxWidth: expanded ? 340 : 260,
        opacity: expanded ? 1 : 0.55,
      }}
      onMouseEnter={() => setExpanded(true)}
    >
      <div className="px-4 pb-3 pt-2.5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em]" style={{ color: "#00ffff" }}>
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "#ff2d95", boxShadow: "0 0 8px #ff2d95", animation: "pulse 2s ease-in-out infinite" }}
          />
          MOSH Radio{station !== "all" ? ` · ${station}` : ""}
        </div>

        <div className="mt-1.5 truncate text-[15px] font-semibold leading-tight text-white">{nowPlaying.title}</div>
        <div className="truncate text-[11px] text-white/50">{nowPlaying.artist || "Aesthetic Rebellion"}</div>

        {expanded && (
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 truncate text-[10px] uppercase tracking-[0.18em] text-white/35">
              {upNext ? `Next · ${upNext.title}` : ""}
            </div>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip to the next track"
              className="shrink-0 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SkipForward size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="h-[2px] w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          ref={barRef}
          className="h-full w-full origin-left"
          style={{ background: "linear-gradient(90deg,#00ffff,#ff2d95)", transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}

/**
 * The one thing a 24/7 station cannot solve on its own: browsers refuse to
 * make sound until someone has touched the page. Shown only when a play()
 * was actually refused, so an autoplay-permitted display (a kiosk profile,
 * an OBS browser source) never sees it.
 */
export function RadioGesturePrompt({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3"
      style={{ background: "radial-gradient(circle at center, rgba(8,2,16,0.72), rgba(0,0,0,0.92))" }}
    >
      <span className="text-[11px] uppercase tracking-[0.4em]" style={{ color: "#00ffff" }}>Ether-MOSH</span>
      <span className="text-2xl font-semibold tracking-tight text-white">Tap to start the broadcast</span>
      <span className="text-[12px] text-white/45">Your browser needs one touch before it will play audio</span>
    </button>
  );
}
