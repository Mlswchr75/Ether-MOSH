import { useEffect, useState } from "react";
import { Shuffle, Clock, Zap } from "lucide-react";
import { useStore } from "@/store/useStore";
import { haptic } from "@/hooks/useHaptics";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";


const OPTIONS: { sec: number; label: string }[] = [
  { sec: 3, label: "3s" },
  { sec: 15, label: "15s" },
  { sec: 30, label: "30s" },
  { sec: 60, label: "1m" },
  { sec: 300, label: "5m" },
  { sec: 600, label: "10m" },
];

export function ShufflePanel() {
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);
  const mosh = useStore(s => s.mosh);
  const [expanded, setExpanded] = useState(false);

  // (Interval driver lives in Editor.tsx so it keeps firing when this panel is unmounted.)

  const isOn = shuffleSec !== null;
  const activeLabel = isOn ? OPTIONS.find(o => o.sec === shuffleSec)?.label ?? `${shuffleSec}s` : null;

  const handleMoshNow = () => {
    haptic([10, 16, 22]);
    crossfadeLayers(mosh, MOSH_FADE_MS);
  };


  return (
    <div className="border-b border-[hsl(var(--border-subtle))] px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-sm border transition ${isOn ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))] shadow-[0_0_10px_hsl(var(--accent)/0.4)]" : "border-[hsl(var(--border-default))] text-[hsl(var(--text-tertiary))]"}`}>
            <Shuffle className="h-3.5 w-3.5" strokeWidth={1.5} />
          </div>
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--text-primary))]">Auto-Mosh</div>
            <div className="font-mono text-[10px] text-[hsl(var(--text-secondary))]">
              {isOn ? (
                <span className="inline-flex items-center gap-1 text-[hsl(var(--accent))]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--accent))] opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
                  </span>
                  Every {activeLabel}
                </span>
              ) : (
                <span>Off</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={handleMoshNow}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-[hsl(var(--border-default))] px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
            title="Mosh now"
          >
            <Zap className="h-3 w-3" strokeWidth={1.5} />
            <span className="hidden sm:inline">Now</span>
          </button>

          <button
            onClick={() => setExpanded(e => !e)}
            className={`flex h-8 items-center gap-1.5 rounded-sm border px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition ${isOn ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]" : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"}`}
            title="Set shuffle interval"
          >
            <Clock className="h-3 w-3" strokeWidth={1.5} />
            <span>{expanded ? "Close" : "Set"}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 animate-ui-rise">
          <button
            onClick={() => { setShuffleSec(null); haptic(8); }}
            className={`flex h-8 items-center rounded-sm border px-3 font-mono text-[10px] uppercase tracking-[0.1em] transition ${shuffleSec === null ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.08)] text-[hsl(var(--accent))]" : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"}`}
          >
            Off
          </button>
          {OPTIONS.map(opt => (
            <button
              key={opt.sec}
              onClick={() => { setShuffleSec(opt.sec); haptic(8); }}
              className={`flex h-8 items-center rounded-sm border px-3 font-mono text-[10px] uppercase tracking-[0.1em] transition ${shuffleSec === opt.sec ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.08)] text-[hsl(var(--accent))]" : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
