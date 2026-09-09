import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronUp, Heart, ListMusic, Minimize2, Pause, Play, Radio, Shuffle, SkipBack, SkipForward, Sliders, Volume2 } from "lucide-react";
import { hasOwnLink, trackLink } from "@/engine/radio";
import { trackPlayer } from "@/engine/trackPlayer";
import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import { useRadioLibrary } from "@/hooks/useRadioLibrary";
import { radioLink } from "@/lib/radioLinks";
import { FavoriteSong, RadioLibrary } from "./RadioLibrary";
import { RadioShareTag } from "./RadioShareToast";

const clock = (seconds: number) =>
  !Number.isFinite(seconds) || seconds < 0 ? "0:00" : `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

/**
 * How see-through the plate sits over the visuals, 0.35–1.
 *
 * The picture is the point of this screen and the plate covers a corner of it,
 * so how much of it you're willing to lose is a taste call rather than a
 * default — a VJ running this on a wall wants it nearly gone, someone picking
 * songs wants it solid. Persisted because it is a preference, not a mode.
 */
const OPACITY_KEY = "mosh_radio_plate_opacity_v1";
const MIN_OPACITY = 0.35;

function loadOpacity(): number {
  try {
    const raw = Number(localStorage.getItem(OPACITY_KEY));
    return Number.isFinite(raw) && raw >= MIN_OPACITY && raw <= 1 ? raw : 1;
  } catch {
    return 1;
  }
}

export function RadioHud({ radio, onOpenControls }: { radio: RadioBroadcast; onOpenControls: () => void }) {
  const { nowPlaying, upNext, status } = radio;
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [volume, setVolume] = useState(trackPlayer.volume);
  const [opacity, setOpacity] = useState(loadOpacity);
  const library = useRadioLibrary();

  // The wheel's track trigger hands its caret over to this panel on a station
  // (see TrackTrigger) — the station's queue is the only one that is real.
  useEffect(() => {
    const show = () => { setOpen(true); setMinimized(false); };
    window.addEventListener("mosh:open-radio-library", show);
    return () => window.removeEventListener("mosh:open-radio-library", show);
  }, []);

  // Idle fade — the plate steps back when nothing is happening and returns on
  // the first sign of life. Suspended while the library is open, since a list
  // you are reading is not idle no matter how still the pointer is.
  useEffect(() => {
    if (open) { setDim(false); return; }
    let id = window.setTimeout(() => setDim(true), 12_000);
    const wake = () => { setDim(false); window.clearTimeout(id); id = window.setTimeout(() => setDim(true), 12_000); };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [open]);

  /* Position and duration are read on a timer rather than pushed through state:
     they change every frame and nothing else on the screen depends on them, so
     writing them straight into the two nodes that show them keeps a 2Hz clock
     from re-rendering the queue. */
  useEffect(() => {
    const tick = () => {
      const duration = trackPlayer.duration();
      const position = trackPlayer.position();
      if (barRef.current) barRef.current.style.transform = `scaleX(${duration > 0 ? Math.min(1, position / duration) : 0})`;
      if (timeRef.current) timeRef.current.textContent = `${clock(position)} / ${clock(duration)}`;
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);

  // H folds the plate away without stopping the broadcast. Ignored while a
  // field has focus, so typing a playlist name doesn't hide the player.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "h" && e.key !== "H") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      setMinimized(v => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeOpacity = useCallback((value: number) => {
    setOpacity(value);
    try { localStorage.setItem(OPACITY_KEY, String(value)); } catch { /* private mode — the session keeps the value anyway */ }
  }, []);

  const playing = status === "playing";
  const labels: Record<typeof status, string> = {
    playing: "On air",
    paused: "Paused",
    blocked: "Tap to listen",
    loading: "Loading song…",
    offline: "Reconnecting…",
  };
  /* A station holding for the listener's own audio is paused for a reason the
     word "Paused" does not carry — and the transport still works, so without
     saying why, pressing play to get the visuals moving would fight the mic
     for the analyser and look broken from both ends. */
  const statusLine = radio.externalAudio ? "Your audio is driving the visuals" : labels[status];
  const station = radio.config.station !== "all" ? ` · ${radio.config.station}` : "";

  if (minimized) {
    return (
      <button
        type="button"
        data-cursor-zone="controls"
        onClick={() => setMinimized(false)}
        onPointerDown={e => e.stopPropagation()}
        title="Show the player (H)"
        aria-label="Expand the MOSH Radio player"
        className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-[#090510]/95 px-3.5 py-2 text-xs font-medium text-white shadow-2xl backdrop-blur-lg transition hover:bg-white/10"
        style={{ opacity }}
      >
        <Radio size={14} className={playing ? "animate-pulse text-cyan-200" : "text-white/50"} />
        <span className="max-w-[9rem] truncate">{nowPlaying?.title || "MOSH Radio"}</span>
        <ChevronUp size={14} className="text-white/60" />
      </button>
    );
  }

  return (
    <section
      aria-label="MOSH Radio player"
      data-cursor-zone="controls"
      className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 max-h-[calc(100dvh-2rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-[#090510]/95 text-white shadow-2xl backdrop-blur-lg transition-opacity"
      style={{ opacity: opacity * (dim && !open ? 0.78 : 1) }}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">MOSH Radio{station}</p>
          <div className="flex items-center gap-1">
            <RadioShareTag url={radioLink({ station: radio.config.station })} title="MOSH Radio" />
            <button
              type="button"
              onClick={() => setMinimized(true)}
              aria-label="Minimize the radio player"
              title="Minimize (H)"
              className="flex h-9 w-9 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Minimize2 size={15} />
            </button>
          </div>
        </div>
        <p role="status" className="text-xs text-white/60">{statusLine}</p>
        <div className="mt-1 flex items-center gap-2">
          {/* The share tag above sends people to the station; this sends them
              to the artist. Both matter, and they are not the same errand: a
              listener who likes the song wants the person who made it. Opens
              in a new tab — navigating away would take the broadcast with it. */}
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">
            {nowPlaying
              ? <a
                  href={trackLink(nowPlaying)}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={hasOwnLink(nowPlaying) ? `Open "${nowPlaying.title}" on SoundCloud` : "Open the artist on SoundCloud"}
                  className="radio-plate-title inline-flex items-baseline gap-1.5 transition-colors"
                >
                  <span>{nowPlaying.title}</span>
                  <ArrowUpRight size={14} className="shrink-0 opacity-45" aria-hidden />
                </a>
              : "Tuning in…"}
          </h2>
          {nowPlaying ? <FavoriteSong track={nowPlaying} library={library} /> : <Heart size={18} className="text-white/40" />}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-sm text-white/60">{nowPlaying?.artist || "MOSH"}</span>
          <span ref={timeRef} className="font-mono text-xs tabular-nums text-white/60">0:00</span>
        </div>

        <div className="mt-3 flex items-center gap-1">
          <button type="button" disabled={!radio.history.length} onClick={radio.previous} aria-label="Previous radio song" title="Previous" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30"><SkipBack size={19} /></button>
          <button type="button" onClick={playing ? radio.togglePlay : radio.start} aria-label={playing ? "Pause the broadcast" : "Resume the broadcast"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-200/10 text-cyan-200">{playing ? <Pause size={21} /> : <Play size={21} />}</button>
          <button type="button" onClick={radio.skip} aria-label="Skip to the next track" title="Next" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10"><SkipForward size={19} /></button>
          <button type="button" onClick={radio.shuffle} aria-label="Shuffle the queue" title="Shuffle the queue" className="flex h-11 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"><Shuffle size={18} /></button>
          <label className="ml-1 flex min-w-0 flex-1 items-center gap-2">
            <Volume2 size={16} className="shrink-0 text-white/60" />
            <input
              type="range" min="0" max="1" step="0.01" value={volume}
              aria-label="Radio volume"
              className="h-10 w-full min-w-0 accent-cyan-200"
              onChange={e => { const value = Number(e.target.value); setVolume(value); trackPlayer.setVolume(value); }}
            />
          </label>
          {nowPlaying && <RadioShareTag url={radioLink({ track: nowPlaying })} title={nowPlaying.title} />}
        </div>

        {upNext && (
          <div className="mt-1 flex items-center gap-2">
            <button type="button" onClick={() => setOpen(true)} className="min-h-10 min-w-0 flex-1 truncate text-left text-xs text-white/60">Next · {upNext.title}</button>
            <RadioShareTag url={radioLink({ track: upNext })} title={upNext.title} />
          </div>
        )}

        <label className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/40">
          <span className="shrink-0">Fade</span>
          <input
            type="range" min={MIN_OPACITY} max="1" step="0.05" value={opacity}
            aria-label="Player transparency"
            className="h-8 w-full min-w-0 accent-cyan-200/70"
            onChange={e => changeOpacity(Number(e.target.value))}
          />
        </label>

        <div className="flex items-center justify-between gap-2 py-2">
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-sm"><ListMusic size={16} />{open ? "Close library" : `Queue & library · ${radio.queue.length}`}</button>
          <button type="button" onClick={onOpenControls} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm text-cyan-200"><Sliders size={15} /> Controls</button>
        </div>
      </div>
      {open && <RadioLibrary radio={radio} library={library} />}
      <div className="h-0.5 w-full bg-white/10"><div ref={barRef} className="h-full w-full origin-left bg-gradient-to-r from-cyan-300 to-pink-400" style={{ transform: "scaleX(0)" }} /></div>
    </section>
  );
}

export function RadioWelcome({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, 8_000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-cyan-200/20 bg-black/75 px-4 py-2 text-center text-xs text-white/75">
      Your visuals. Your soundtrack. <span className="text-cyan-200">Queue &amp; library</span> below.
    </div>
  );
}

/**
 * The one tap a browser requires before it will make sound.
 *
 * Not optional and not decorative: every current browser refuses
 * `audio.play()` until the page has seen a real gesture, so with this absent
 * the station loads, reports itself blocked, and plays nothing — with no
 * control on screen that can change that. It is the only path from "blocked"
 * to "on air" for a first-time visitor.
 */
export function RadioGesturePrompt({ onStart }: { onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      data-cursor-zone="controls"
      className="pointer-events-auto absolute left-1/2 top-16 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-200/40 bg-[#100b1a]/95 px-5 py-3 text-left text-white shadow-lg"
    >
      <Play size={22} className="shrink-0 text-cyan-200" />
      <span>
        <span className="block text-base font-medium">Tap to listen</span>
        <span className="block text-xs text-white/60">Your browser needs one tap to enable sound</span>
      </span>
    </button>
  );
}
