import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play, SkipForward, Sliders } from "lucide-react";
import { trackPlayer, type ShowcaseTrack } from "@/engine/trackPlayer";
import { hasOwnLink, trackLink } from "@/engine/radio";

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/**
 * The station plate.
 *
 * The first version of this was a translucent dark rectangle with two lines of
 * small grey text, and against Forge's output it read as a browser error box —
 * which is exactly what it was mistaken for. The lesson is not "make it
 * prettier": an unlabelled dark box floating over a neon wall has no way to
 * say what it is, and a viewer's first guess about an unexplained grey
 * rectangle on a web page is that something has gone wrong.
 *
 * So it states itself. A branded ident with a live dot, the track, a real
 * transport that is always visible, and — the part that was missing entirely —
 * a way back to the controls. Nothing here is hidden behind a hover: a wall
 * display has no cursor, and a phone has no hover at all.
 */
export function RadioHud({
  station,
  nowPlaying,
  upNext,
  paused,
  onSkip,
  onTogglePlay,
  onOpenControls,
}: {
  station: string;
  nowPlaying: ShowcaseTrack | null;
  upNext: ShowcaseTrack | null;
  paused: boolean;
  onSkip: () => void;
  onTogglePlay: () => void;
  onOpenControls: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [dim, setDim] = useState(false);

  // Recede after a while so an unattended wall is mostly picture, but never
  // below legible — and come straight back on any pointer or key activity.
  useEffect(() => {
    if (!nowPlaying) return;
    setDim(false);
    let id = window.setTimeout(() => setDim(true), 12_000);
    const wake = () => {
      setDim(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setDim(true), 12_000);
    };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [nowPlaying]);

  // Progress is written straight to the nodes — a state update per frame for a
  // 2px bar would re-render this card ~200,000 times over an overnight stream.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const duration = trackPlayer.duration();
      const position = trackPlayer.position();
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${duration > 0 ? Math.min(1, position / duration) : 0})`;
      }
      if (timeRef.current) {
        timeRef.current.textContent = duration > 0 ? `${clock(position)} / ${clock(duration)}` : clock(position);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!nowPlaying) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-6 left-6 z-40 w-[min(21rem,calc(100vw-3rem))] select-none overflow-hidden rounded-2xl transition-opacity duration-700"
      style={{
        background: "linear-gradient(140deg, rgba(10,2,20,0.86), rgba(3,1,8,0.80))",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 0 30px rgba(255,45,149,0.10)",
        opacity: dim ? 0.72 : 1,
      }}
      onPointerEnter={() => setDim(false)}
    >
      <div className="px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#00ffff" }}>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: paused ? "#8b8b9a" : "#ff2d95",
                boxShadow: paused ? "none" : "0 0 9px #ff2d95",
                animation: paused ? "none" : "pulse 2s ease-in-out infinite",
              }}
            />
            {paused ? "Paused" : "On air"}
          </div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-white/40">
            MOSH Radio{station !== "all" ? ` · ${station}` : ""}
          </div>
        </div>

        {/* The title is the way out. A station nobody can follow is a
            screensaver — this is the one moment a listener's interest in the
            artist is at its peak, and it costs a click to spend it well.
            target=_blank deliberately: navigating away would take the
            broadcast down with it. */}
        <a
          href={trackLink(nowPlaying)}
          target="_blank"
          rel="noreferrer noopener"
          title={hasOwnLink(nowPlaying) ? `Open "${nowPlaying.title}" on SoundCloud` : "Open the artist on SoundCloud"}
          className="radio-plate-title mt-2 flex items-baseline gap-1.5 text-[17px] font-semibold leading-tight text-white transition-colors"
        >
          <span className="truncate">{nowPlaying.title}</span>
          <ArrowUpRight size={13} className="shrink-0 opacity-45" aria-hidden />
        </a>
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[11px] text-white/55">{nowPlaying.artist || "Aesthetic Rebellion"}</span>
          <span ref={timeRef} className="shrink-0 font-mono text-[10px] tabular-nums text-white/40">0:00</span>
        </div>

        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={paused ? "Resume the broadcast" : "Pause the broadcast"}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button
            type="button"
            onClick={onSkip}
            aria-label="Skip to the next track"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/80 transition hover:border-white/40 hover:bg-white/10 hover:text-white"
          >
            <SkipForward size={13} />
          </button>
          <button
            type="button"
            onClick={onOpenControls}
            className="ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition"
            style={{ borderColor: "rgba(0,255,255,0.35)", color: "#00ffff" }}
          >
            <Sliders size={11} /> Controls
          </button>
        </div>

        {upNext && (
          <div className="mt-2.5 truncate text-[10px] uppercase tracking-[0.16em] text-white/30">
            Next · {upNext.title}
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
 * Shown once on arrival, then gone. Radio drops straight into performance
 * mode, which is the right default for a wall and a genuinely disorienting one
 * for a person who has just opened a link: every control is hidden and nothing
 * says how to get one back. This is the sentence that was missing.
 */
export function RadioWelcome({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 11_000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-6 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-center"
      style={{
        background: "rgba(4,2,10,0.72)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(0,255,255,0.22)",
        animation: "fade-in 400ms ease-out",
      }}
    >
      <span className="text-[11px] text-white/75">
        Broadcasting · <span style={{ color: "#00ffff" }}>Controls</span> for the full rig
        {" · "}<kbd className="rounded border border-white/20 px-1 py-0.5 font-mono text-[9px] text-white/60">Esc</kbd> to exit
      </span>
    </div>
  );
}

/**
 * The one thing a 24/7 station cannot solve on its own: browsers refuse to
 * make sound until someone has touched the page. Shown only when a play() was
 * actually refused, so an autoplay-permitted display (a kiosk profile, an OBS
 * browser source) never sees it.
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
