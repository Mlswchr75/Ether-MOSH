import { X, Wand2, Target, RefreshCw } from "lucide-react";
import { useStore } from "@/store/useStore";

export function IsolationPanel({ onClose }: { onClose: () => void }) {
  const mode    = useStore(s => s.isolationMode);
  const feather = useStore(s => s.isolationFeather);
  const invert  = useStore(s => s.isolationInvert);
  const setMode    = useStore(s => s.setIsolationMode);
  const setFeather = useStore(s => s.setIsolationFeather);
  const setInvert  = useStore(s => s.setIsolationInvert);

  return (
    <div data-iso-panel className="flex flex-col gap-2 w-52 rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md panel-in-3d">
      <div className="flex items-center justify-between px-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">⌖ isolation</span>
        <button type="button" onClick={onClose} className="text-white/40 hover:text-white">
          <X className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {([
          { id: 'auto' as const, icon: Wand2,  label: 'Auto detect' },
          { id: 'tap'  as const, icon: Target, label: 'Tap object'  },
        ] as const).map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(mode === id ? 'off' : id)}
            data-active={mode === id || undefined}
            className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55 hover:border-white/25 hover:text-white data-[active]:border-[hsl(var(--accent))]/60 data-[active]:bg-[hsl(var(--accent))]/10 data-[active]:text-[hsl(var(--accent))] transition-colors"
          >
            <Icon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="px-1">
        <div className="flex justify-between mb-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-white/50">feather</span>
          <span className="font-mono text-[9px] text-white/35">{feather}px</span>
        </div>
        <input type="range" min={0} max={30} step={1} value={feather}
          onChange={e => setFeather(Number(e.target.value))}
          className="w-full accent-[hsl(var(--accent))]" />
      </div>

      <button
        type="button"
        onClick={() => setInvert(!invert)}
        data-active={invert || undefined}
        className="flex items-center justify-between rounded border border-white/10 px-2 py-1.5 text-white/55 hover:border-white/25 hover:text-white data-[active]:border-[hsl(var(--accent))]/60 data-[active]:text-[hsl(var(--accent))] transition-colors"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]">invert mask</span>
        <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
      </button>

      {mode !== 'off' && (
        <button
          type="button"
          onClick={() => setMode('off')}
          className="rounded border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60 text-center"
        >
          clear / off
        </button>
      )}
    </div>
  );
}
