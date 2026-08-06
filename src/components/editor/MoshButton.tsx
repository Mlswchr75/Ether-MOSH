import { useEffect, useRef, useState } from "react";
import { Shuffle, Zap } from "lucide-react";
import { useStore } from "@/store/useStore";
import { haptic } from "@/hooks/useHaptics";
import type { Intensity } from "@/store/types";

const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: "mild", label: "Mild" },
  { id: "savage", label: "Savage" },
  { id: "nuclear", label: "Nuclear" },
  { id: "interdimensional", label: "Interdim" },
];

const SHUFFLE_OPTIONS: { sec: number; label: string }[] = [
  { sec: 3, label: "3s" },
  { sec: 15, label: "15s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 600, label: "10m" },
  { sec: 1800, label: "30m" },
];

export function MoshButton() {
  const mosh = useStore(s => s.mosh);
  const intensity = useStore(s => s.intensity);
  const setIntensity = useStore(s => s.setIntensity);
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shufflePickerOpen, setShufflePickerOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const continuousTimer = useRef<number | null>(null);

  // Auto-shuffle interval
  useEffect(() => {
    if (shuffleSec == null) return;
    const id = window.setInterval(() => mosh(), shuffleSec * 1000);
    return () => clearInterval(id);
  }, [shuffleSec, mosh]);

  const start = () => {
    haptic([8, 12, 28]);
    mosh();
    longPressTimer.current = window.setTimeout(() => {
      haptic([20, 40, 20]);
      continuousTimer.current = window.setInterval(() => mosh(), 600);
    }, 480);
  };

  const end = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (continuousTimer.current) { clearInterval(continuousTimer.current); continuousTimer.current = null; }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex flex-col items-center gap-2">
      {pickerOpen && (
        <div className="glass-1 pointer-events-auto flex gap-1 px-1 py-1 animate-ui-rise">
          {INTENSITIES.map(i => (
            <button
              key={i.id}
              onClick={() => { setIntensity(i.id); setPickerOpen(false); haptic(8); }}
              data-active={intensity === i.id}
              className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] transition ${
                intensity === i.id
                  ? "text-[hsl(var(--accent))]"
                  : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      )}

      {shufflePickerOpen && (
        <div className="glass-1 pointer-events-auto flex gap-1 px-1 py-1 animate-ui-rise">
          <button
            onClick={() => { setShuffleSec(null); setShufflePickerOpen(false); haptic(8); }}
            data-active={shuffleSec === null}
            className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] transition ${
              shuffleSec === null
                ? "text-[hsl(var(--accent))]"
                : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
            }`}
          >
            Off
          </button>
          {SHUFFLE_OPTIONS.map(opt => (
            <button
              key={opt.sec}
              onClick={() => { setShuffleSec(opt.sec); setShufflePickerOpen(false); haptic(8); }}
              data-active={shuffleSec === opt.sec}
              className={`px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.04em] transition ${
                shuffleSec === opt.sec
                  ? "text-[hsl(var(--accent))]"
                  : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          onClick={() => setPickerOpen(o => !o)}
          className="btn-ghost h-9"
          aria-label="Intensity"
        >
          {INTENSITIES.find(i => i.id === intensity)?.label}
        </button>

        <button
          onPointerDown={start}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className="glass-1 flex h-12 items-center gap-2 px-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--surface-hover)/var(--surface-hover-a))] focus:outline-none animate-mosh-pulse"
          aria-label="MOSH"
        >
          <Zap className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Mosh</span>
        </button>

        <button
          onClick={() => setShufflePickerOpen(o => !o)}
          data-on={shuffleSec !== null}
          className="btn-ghost flex h-9 w-[60px] items-center justify-center gap-1"
          aria-label="Shuffle interval"
          title={shuffleSec ? `Auto-mosh every ${SHUFFLE_OPTIONS.find(o => o.sec === shuffleSec)?.label ?? shuffleSec + "s"}` : "Shuffle off"}
        >
          <Shuffle className="h-3 w-3" strokeWidth={1.5} />
          <span className="font-mono text-[10px]">{shuffleSec ? (SHUFFLE_OPTIONS.find(o => o.sec === shuffleSec)?.label ?? `${shuffleSec}s`) : "Off"}</span>
        </button>
      </div>
    </div>
  );
}
