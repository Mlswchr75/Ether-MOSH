import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Sliders, Volume2 } from "lucide-react";
import { trackPlayer } from "@/engine/trackPlayer";
import type { RadioBroadcast } from "@/hooks/useRadioBroadcast";
import { useRadioLibrary } from "@/hooks/useRadioLibrary";
import { radioLink } from "@/lib/radioLinks";
import { hasOwnLink, trackLink } from "@/engine/radio";
import { RadioLibrary, FavoriteSong } from "./RadioLibrary";
import { RadioShareTag } from "./RadioShareToast";

const clock = (seconds: number) => !Number.isFinite(seconds) || seconds < 0 ? "0:00" : `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
export function RadioHud({ radio, onOpenControls }: { radio: RadioBroadcast; onOpenControls: () => void }) {
  const { nowPlaying, upNext, status } = radio;
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [dim, setDim] = useState(false);
  const [volume, setVolume] = useState(trackPlayer.volume);
  const library = useRadioLibrary();
  useEffect(() => {
    if (open) { setDim(false); return; }
    let id = window.setTimeout(() => setDim(true), 12_000);
    const wake = () => { setDim(false); window.clearTimeout(id); id = window.setTimeout(() => setDim(true), 12_000); };
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    return () => { window.clearTimeout(id); window.removeEventListener("pointermove", wake); window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); };
  }, [open]);
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
  const playing = status === "playing";
  const labels = { playing: "On air", paused: "Paused", blocked: "Tap to listen", loading: "Loading song…", offline: "Reconnecting…" };
  return <section aria-label="MOSH Radio player" className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 w-[min(25rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-[#090510]/95 text-white shadow-2xl backdrop-blur-lg transition-opacity" style={{ opacity: dim && !open ? 0.78 : 1 }} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <div className="px-4 pt-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">MOSH Radio{radio.config.station !== "all" ? ` · ${radio.config.station}` : ""}</p><RadioShareTag url={radioLink({ station: radio.config.station })} title="MOSH Radio"/></div>
      <p role="status" className="text-xs text-white/60">{labels[status]}</p>
      <div className="mt-1 flex items-center gap-2"><h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">{nowPlaying
        /* The share tag beside this sends people to the station; this sends
           them to the artist. Both matter, and they are not the same errand:
           a listener who likes the song wants the person who made it. Opens
           in a new tab — navigating away would take the broadcast with it. */
        ? <a href={trackLink(nowPlaying)} target="_blank" rel="noreferrer noopener" title={hasOwnLink(nowPlaying) ? `Open "${nowPlaying.title}" on SoundCloud` : "Open the artist on SoundCloud"} className="radio-plate-title inline-flex items-baseline gap-1.5 transition-colors"><span>{nowPlaying.title}</span><ArrowUpRight size={14} className="shrink-0 opacity-45" aria-hidden/></a>
        : "Tuning in…"}</h2>{nowPlaying ? <FavoriteSong track={nowPlaying} library={library}/> : <Heart size={18}/>}</div>
      <div className="mt-1 flex items-center justify-between gap-2"><span className="text-sm text-white/60">{nowPlaying?.artist || "MOSH"}</span><span ref={timeRef} className="font-mono text-xs tabular-nums text-white/60">0:00</span></div>
      <div className="mt-3 flex items-center gap-1">
        <button type="button" disabled={!radio.history.length} onClick={radio.previous} aria-label="Previous radio song" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30"><SkipBack size={19}/></button>
        <button type="button" onClick={playing ? radio.togglePlay : radio.start} aria-label={playing ? "Pause the broadcast" : "Resume the broadcast"} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-200/10 text-cyan-200">{playing ? <Pause size={21}/> : <Play size={21}/>}</button>
        <button type="button" onClick={radio.skip} aria-label="Skip to the next track" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-white/10"><SkipForward size={19}/></button>
        <label className="ml-1 flex min-w-0 flex-1 items-center gap-2"><Volume2 size={16} className="shrink-0 text-white/60"/><input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Radio volume" className="h-10 w-full min-w-0 accent-cyan-200" onChange={e => { const value = Number(e.target.value); setVolume(value); trackPlayer.setVolume(value); }}/></label>
        {nowPlaying && <RadioShareTag url={radioLink({ track: nowPlaying })} title={nowPlaying.title}/>}
      </div>
      {upNext && <div className="mt-1 flex items-center gap-2"><button type="button" onClick={() => setOpen(true)} className="min-h-10 min-w-0 flex-1 truncate text-left text-xs text-white/60">Next · {upNext.title}</button><RadioShareTag url={radioLink({ track: upNext })} title={upNext.title}/></div>}
      <div className="flex items-center justify-between gap-2 py-2"><button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/20 px-3 text-sm"><ListMusic size={16}/>{open ? "Close library" : `Queue & library · ${radio.queue.length}`}</button><button type="button" onClick={onOpenControls} className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm text-cyan-200"><Sliders size={15}/> Controls</button></div>
    </div>
    {open && <RadioLibrary radio={radio} library={library}/>}
    <div className="h-0.5 w-full bg-white/10"><div ref={barRef} className="h-full w-full origin-left bg-gradient-to-r from-cyan-300 to-pink-400" style={{ transform: "scaleX(0)" }}/></div>
  </section>;
}
export function RadioWelcome({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => { const id = window.setTimeout(onDismiss, 8_000); return () => window.clearTimeout(id); }, [onDismiss]);
  return <div className="pointer-events-none absolute left-1/2 top-4 z-40 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-cyan-200/20 bg-black/75 px-4 py-2 text-center text-xs text-white/75">Your visuals. Your soundtrack. <span className="text-cyan-200">Queue & library</span> below.</div>;
}
export function RadioGesturePrompt({ onStart }: { onStart: () => void }) {
  return <button type="button" onClick={onStart} className="pointer-events-auto absolute left-1/2 top-16 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-cyan-200/40 bg-[#100b1a]/95 px-5 py-3 text-left text-white shadow-lg">
    <Play size={22} className="shrink-0 text-cyan-200"/><span><span className="block text-base font-medium">Tap to listen</span><span className="block text-xs text-white/60">Your browser needs one tap to enable sound</span></span>
  </button>;
}
