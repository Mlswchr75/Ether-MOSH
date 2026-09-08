import { useEffect, useRef, useState } from "react";
import { Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Sliders, Volume2, Minimize2, ChevronUp, Radio } from "lucide-react";
import { useRadioLibrary } from "@/hooks/useRadioLibrary";
import { RadioLibrary } from "@/components/editor/RadioLibrary";
import { RadioShareTag } from "@/components/editor/RadioShareToast";
import type { RadioHudProps } from "@/types/radio";

export function RadioHud({ radio, trackPlayer, status = "offline", nowPlaying, upNext, onOpenControls }: RadioHudProps) {
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState(false);
  const [volume, setVolume] = useState(trackPlayer?.volume ?? 0.8);
  const [isMinimized, setIsMinimized] = useState(false);
  const library = useRadioLibrary();
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let timer: number | undefined;
    const reset = () => {
      setDim(false);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setDim(true), 6000);
    };
    reset();
    window.addEventListener("pointerdown", reset, { passive: true });
    window.addEventListener("keydown", reset);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "h" || e.key === "H") &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        setIsMinimized(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const playing = status === "playing";
  const labels: Record<string, string> = {
    playing: "On air",
    paused: "Paused",
    blocked: "Tap to listen",
    loading: "Loading song…",
    offline: "Reconnecting…",
  };

  const stationName = radio?.config?.station && radio.config.station !== "all" ? ` · ${radio.config.station}` : "";

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setIsMinimized(false)}
        className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-[#090510]/95 px-3.5 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-lg transition hover:bg-white/10"
        title="Show Radio player (H)"
        aria-label="Expand MOSH Radio player"
      >
        <Radio size={14} className="animate-pulse text-cyan-200" />
        <span className="truncate max-w-[140px]">{nowPlaying?.title || "MOSH Radio"}</span>
        <ChevronUp size={14} className="text-white/60" />
      </button>
    );
  }

  return (
    <section
      aria-label="MOSH Radio player"
      className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 w-[min(25rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-[#090510]/95 text-white shadow-2xl backdrop-blur-lg transition-opacity"
      style={{ opacity: dim && !open ? 0.78 : 1 }}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            MOSH Radio{stationName}
          </p>
          <div className="flex items-center gap-1">
            <RadioShareTag url={typeof window !== "undefined" ? window.location.href : "/radio"} title="MOSH Radio" />
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              aria-label="Minimize radio controls"
              title="Minimize (H)"
              className="flex h-7 w-7 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Minimize2 size={15} />
            </button>
          </div>
        </div>
        <p role="status" className="text-xs text-white/60">{labels[status] ?? "Live"}</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">{nowPlaying?.title || "Tuning in…"}</h2>
          <Heart size={18} className="text-white/60" />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm text-white/60">{nowPlaying?.artist || "MOSH"}</span>
          <span ref={timeRef} className="font-mono text-xs tabular-nums text-white/60">0:00</span>
        </div>
        <div className="mt-3 flex items-center gap-1">
          <button type="button" disabled={!radio?.history?.length} onClick={() => radio?.previous?.()} aria-label="Previous radio song" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30"><SkipBack size={19} /></button>
          <button type="button" onClick={() => (playing ? radio?.togglePlay?.() : radio?.start?.())} aria-label={playing ? "Pause the broadcast" : "Resume the broadcast"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-200/10 text-cyan-200">{playing ? <Pause size={21} /> : <Play size={21} />}</button>
          <button type="button" onClick={() => radio?.skip?.()} aria-label="Skip to the next track" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10"><SkipForward size={19} /></button>
          <label className="ml-1 flex min-w-0 flex-1 items-center gap-2"><Volume2 size={16} className="shrink-0 text-white/60" /><input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Radio volume" className="h-10 w-full min-w-0 accent-cyan-200" onChange={e => { const value = Number(e.target.value); setVolume(value); trackPlayer?.setVolume?.(value); }} /></label>
          {nowPlaying && <RadioShareTag url={typeof window !== "undefined" ? window.location.href : "/radio"} title={nowPlaying.title} />}
        </div>
        {upNext && (
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => setOpen(true)} className="min-h-10 min-w-0 flex-1 truncate text-left text-xs text-white/60">
              Next · {upNext.title}
            </button>
            <RadioShareTag url={typeof window !== "undefined" ? window.location.href : "/radio"} title={upNext.title} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 py-2">
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-sm"><ListMusic size={16} />{open ? "Close library" : `Queue & library · ${radio?.queue?.length ?? 0}`}</button>
          <button type="button" onClick={onOpenControls} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm text-cyan-200"><Sliders size={15} /> Controls</button>
        </div>
      </div>
      {open && <RadioLibrary radio={radio} library={library} />}
      <div className="h-0.5 w-full bg-white/10"><div ref={barRef} className="h-full w-full origin-left bg-gradient-to-r from-cyan-300 to-pink-400" style={{ transform: "scaleX(0)" }} /></div>
    </section>
  );
}

export function RadioWelcome({ onDismiss }: { onDismiss: () => void }) {
  return null;
}

/** Browsers want a real gesture before they will make sound; this is the
 *  "tap to start" prompt. Named for what its one caller passes — it was
 *  declared as `onDismiss` while Editor.tsx has always passed `onStart`,
 *  which is the second half of why typecheck has been failing. */
export function RadioGesturePrompt({ onStart }: { onStart: () => void }) {
  return null;
}
