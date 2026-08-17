import { useEffect, useState } from "react";
import { useEffect as useEffectReact, useRef as useRefReact } from "react";
import { Mic, MicOff, Film, Circle, Square, Maximize2, Minimize2, Shuffle, Sparkles, Music, Music2, Upload, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { trackPlayer, DEFAULT_TRACK_TITLE } from "@/engine/trackPlayer";

/**
 * Forge's trigger rail — the same controls the editor has, against Forge's own
 * canvas.
 *
 * Reuses the `.hot-trigger` styling rather than inventing a second visual
 * language for the same affordances, so a control means the same thing in both
 * places.
 */

/** Loop lengths offered when the GIF trigger is tapped. */
const GIF_LENGTHS = [3, 5, 7] as const;

/** Auto-shuffle intervals. Same ladder as the visualiser's, so the control
 *  means the same thing in both places. */
const SHUFFLE_OPTIONS: { sec: number; label: string }[] = [
  { sec: 3, label: "3s" },
  { sec: 15, label: "15s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 600, label: "10m" },
  { sec: 1800, label: "30m" },
];

type Props = {
  micOn: boolean;
  onToggleMic: () => void;
  onGif: (seconds: number) => void;
  gifBusy: boolean;
  gifProgress: number;
  isRecording: boolean;
  onToggleRecord: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** null = off. */
  shuffleSec: number | null;
  onShuffleSec: (sec: number | null) => void;
  journeyOn: boolean;
  onToggleJourney: () => void;
};

function Btn({
  label, active, disabled, onClick, children, delay,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active || undefined}
      title={label}
      data-active={active || undefined}
      data-no-longpress
      className="hot-trigger"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="hot-trigger__glitch" aria-hidden>{children}</span>
      <span className="hot-trigger__ico">{children}</span>
    </button>
  );
}

/** Same theme-track hot-trigger as the editor's HotTriggers, adapted to
 *  Forge's `.hot-trigger` rail and local button styling. */
function ForgeTrackTrigger({ delay }: { delay: number }) {
  const trackEnabled = useStore(s => s.trackEnabled);
  const trackTitle = useStore(s => s.trackTitle);
  const setTrackEnabled = useStore(s => s.setTrackEnabled);
  const setTrackMeta = useStore(s => s.setTrackMeta);
  const [open, setOpen] = useState(false);
  const fileRef = useRefReact<HTMLInputElement>(null);
  const wrapRef = useRefReact<HTMLDivElement>(null);

  useEffectReact(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(o => !o)}
        aria-label={trackEnabled ? `Pause ${trackTitle}` : "Play theme track"}
        aria-pressed={trackEnabled}
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        title={trackEnabled ? `Pause · ${trackTitle}` : "Play theme track — tap to open"}
        data-active={(trackEnabled || open) || undefined}
        data-no-longpress
        className="hot-trigger relative"
        style={{ animationDelay: `${delay}ms` }}
      >
        <span className="hot-trigger__glitch" aria-hidden>
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
        <span className="hot-trigger__ico">
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
      </button>

      {open && (
        <div
          className="panel-in-3d absolute right-full top-0 z-50 mr-2 w-52 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2.5 backdrop-blur-md"
          role="menu"
          aria-label="Track options"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
            now playing
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-[hsl(var(--text-primary))]" title={trackTitle}>
            {trackTitle}
          </div>

          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => setTrackEnabled(!trackEnabled)}
            className="mt-2 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            {trackEnabled ? <Music2 className="h-3 w-3" /> : <Music className="h-3 w-3" />} {trackEnabled ? "pause" : "play"}
          </button>

          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => { trackPlayer.seekToRandomSensiblePoint(); setOpen(false); }}
            className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <Shuffle className="h-3 w-3" /> new drop-in point
          </button>

          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => fileRef.current?.click()}
            className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <Upload className="h-3 w-3" /> browse file
          </button>

          {trackEnabled && (
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              onClick={() => { trackPlayer.dispose(); setTrackEnabled(false); setTrackMeta(DEFAULT_TRACK_TITLE, ""); setOpen(false); }}
              className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-destructive hover:text-destructive"
            >
              <X className="h-3 w-3" /> clear all audio
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const url = URL.createObjectURL(f);
              const name = f.name.replace(/\.[^.]+$/, "");
              await trackPlayer.setSource(url, name, "");
              setTrackMeta(name, "");
              setTrackEnabled(true);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ForgeTriggers({
  micOn, onToggleMic,
  onGif, gifBusy, gifProgress,
  isRecording, onToggleRecord,
  isFullscreen, onToggleFullscreen,
  shuffleSec, onShuffleSec,
  journeyOn, onToggleJourney,
}: Props) {
  const [gifOpen, setGifOpen] = useState(false);
  const [shuffleOpen, setShuffleOpen] = useState(false);

  useEffect(() => {
    if (!gifOpen && !shuffleOpen) return;
    const close = () => { setGifOpen(false); setShuffleOpen(false); };
    // Bubble on purpose: both menus stop pointerdown propagation for inside
    // taps. Listening in capture phase closed and unmounted a timing option
    // before its click could call onGif.
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [gifOpen, shuffleOpen]);

  // A capture in flight must close the menu; leaving it open over a running
  // progress bar invites a second tap that cannot be honoured.
  useEffect(() => { if (gifBusy) setGifOpen(false); }, [gifBusy]);

  return (
    <div data-forge-chrome className="ui-chrome pointer-events-auto absolute right-3 top-3 z-20 flex flex-col gap-1.5">
      <Btn
        label={micOn ? "Audio reactivity on" : "Audio reactivity off"}
        active={micOn}
        onClick={onToggleMic}
        delay={0}
      >
        {micOn ? <Mic className="h-4 w-4" strokeWidth={1.5} /> : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
      </Btn>

      <ForgeTrackTrigger delay={20} />

      {/* Journey — the auto-director. Listed above shuffle because turning it
          on supersedes the interval, and adjacency makes that legible. */}
      <Btn
        label={journeyOn ? "Journey mode on" : "Journey mode — reads the room and directs itself"}
        active={journeyOn}
        onClick={onToggleJourney}
        delay={40}
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </Btn>

      {/* Auto-shuffle. One tap opens the interval menu, same as the GIF
          control — the editor's hold-to-reveal was undiscoverable and this
          page shouldn't repeat it. */}
      <div className="relative">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setShuffleOpen(o => !o)}
          aria-label={shuffleSec ? `Auto-shuffle every ${shuffleSec}s` : "Auto-shuffle off"}
          aria-pressed={shuffleSec != null}
          aria-expanded={shuffleOpen || undefined}
          aria-haspopup="menu"
          title="Auto-shuffle — choose an interval"
          data-active={(shuffleSec != null || shuffleOpen) || undefined}
          data-no-longpress
          className="hot-trigger relative"
          style={{ animationDelay: "80ms" }}
        >
          <span className="hot-trigger__glitch" aria-hidden><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
          <span className="hot-trigger__ico"><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
          {shuffleSec != null && (
            <span className="pointer-events-none absolute -bottom-0.5 right-0.5 font-mono text-[7px] leading-none text-[hsl(var(--accent))]">
              {SHUFFLE_OPTIONS.find(o => o.sec === shuffleSec)?.label ?? `${shuffleSec}s`}
            </span>
          )}
        </button>

        {shuffleOpen && (
          <div
            className="panel-in-3d absolute right-full top-0 z-50 mr-2 flex items-center gap-1 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-1 backdrop-blur-md"
            role="menu"
            aria-label="Auto-shuffle interval"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              onClick={() => { setShuffleOpen(false); onShuffleSec(null); }}
              className={`min-w-[34px] rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                shuffleSec == null
                  ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                  : "border-transparent text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
              }`}
            >
              off
            </button>
            {SHUFFLE_OPTIONS.map(opt => (
              <button
                key={opt.sec}
                type="button"
                role="menuitem"
                data-no-longpress
                onClick={() => { setShuffleOpen(false); onShuffleSec(opt.sec); }}
                className={`min-w-[34px] rounded-sm border px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                  shuffleSec === opt.sec
                    ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                    : "border-transparent text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GIF. One tap opens the length menu — same contract as the editor. */}
      <div className="relative">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => { if (!gifBusy) setGifOpen(o => !o); }}
          aria-label={gifBusy ? "Capturing GIF loop…" : "Capture looping GIF"}
          aria-pressed={gifBusy || undefined}
          aria-expanded={gifOpen || undefined}
          aria-haspopup="menu"
          title="Looping GIF — choose 3s / 5s / 7s"
          data-active={(gifBusy || gifOpen) || undefined}
          data-no-longpress
          disabled={gifBusy}
          className="hot-trigger relative"
          style={{ animationDelay: "60ms" }}
        >
          <span className="hot-trigger__glitch" aria-hidden><Film className="h-4 w-4" strokeWidth={1.5} /></span>
          <span className="hot-trigger__ico"><Film className="h-4 w-4" strokeWidth={1.5} /></span>
          {gifBusy && (
            <span
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[hsl(var(--accent))]"
              style={{ transform: `scaleX(${Math.max(0.02, gifProgress)})`, transition: "transform 80ms linear" }}
            />
          )}
        </button>

        {gifOpen && !gifBusy && (
          <div
            className="panel-in-3d absolute right-full top-0 z-50 mr-2 flex items-center gap-1 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-1 backdrop-blur-md"
            role="menu"
            aria-label="GIF loop length"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {GIF_LENGTHS.map(sec => (
              <button
                key={sec}
                type="button"
                role="menuitem"
                data-no-longpress
                onClick={() => { setGifOpen(false); onGif(sec); }}
                className="min-w-[34px] rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
              >
                {sec}s
              </button>
            ))}
          </div>
        )}
      </div>

      <Btn
        label={isRecording ? "Stop recording" : "Record video"}
        active={isRecording}
        onClick={onToggleRecord}
        delay={120}
      >
        {isRecording
          ? <Square className="h-3.5 w-3.5" strokeWidth={2} />
          : <Circle className="h-4 w-4" strokeWidth={1.5} />}
      </Btn>

      <Btn
        label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        active={isFullscreen}
        onClick={onToggleFullscreen}
        delay={180}
      >
        {isFullscreen
          ? <Minimize2 className="h-4 w-4" strokeWidth={1.5} />
          : <Maximize2 className="h-4 w-4" strokeWidth={1.5} />}
      </Btn>
    </div>
  );
}
