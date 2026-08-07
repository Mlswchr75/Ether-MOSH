import { useEffect, useState } from "react";
import { Mic, MicOff, Film, Circle, Square, Maximize2, Minimize2 } from "lucide-react";

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

export function ForgeTriggers({
  micOn, onToggleMic,
  onGif, gifBusy, gifProgress,
  isRecording, onToggleRecord,
  isFullscreen, onToggleFullscreen,
}: Props) {
  const [gifOpen, setGifOpen] = useState(false);

  useEffect(() => {
    if (!gifOpen) return;
    const close = () => setGifOpen(false);
    window.addEventListener("pointerdown", close, { capture: true });
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close, { capture: true } as any);
      window.removeEventListener("keydown", close);
    };
  }, [gifOpen]);

  // A capture in flight must close the menu; leaving it open over a running
  // progress bar invites a second tap that cannot be honoured.
  useEffect(() => { if (gifBusy) setGifOpen(false); }, [gifBusy]);

  return (
    <div className="pointer-events-auto absolute right-3 top-3 z-20 flex flex-col gap-1.5">
      <Btn
        label={micOn ? "Audio reactivity on" : "Audio reactivity off"}
        active={micOn}
        onClick={onToggleMic}
        delay={0}
      >
        {micOn ? <Mic className="h-4 w-4" strokeWidth={1.5} /> : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
      </Btn>

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
