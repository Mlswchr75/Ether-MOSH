import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";
import type { AudioMap, AudioSource, ModulatorType } from "@/store/types";
import { Activity, Waves, Triangle, MoveHorizontal, Shuffle, Heart, X, Trash2 } from "lucide-react";
import { SeamlessPanel } from "./SeamlessPanel";

const MOD_TYPES: { id: ModulatorType; label: string; icon: typeof Activity }[] = [
  { id: "sine", label: "Sine", icon: Waves },
  { id: "triangle", label: "Tri", icon: Triangle },
  { id: "saw", label: "Saw", icon: MoveHorizontal },
  { id: "perlin", label: "Perlin", icon: Activity },
  { id: "random", label: "Rand", icon: Shuffle },
  { id: "beat", label: "Beat", icon: Heart },
];

const SOURCES: AudioSource[] = ["bass", "mid", "treble", "overall", "beat"];

export function ParamDock() {
  const layers = useStore(s => s.layers);
  const selected = useStore(s => s.selectedLayerId);
  const setParam = useStore(s => s.setParam);
  const setMod = useStore(s => s.setModulator);
  const setAudioMap = useStore(s => s.setAudioMap);
  const layer = layers.find(l => l.id === selected) ?? null;
  const [openMap, setOpenMap] = useState<string | null>(null);

  if (!layer) {
    return (
      <div className="space-y-2 p-2">
        <SeamlessPanel />
        <div className="p-8 text-center font-mono text-[11px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">
          select a layer to tune
        </div>
      </div>
    );
  }

  const def = EFFECTS_BY_ID[layer.effectId];

  return (
    <div className="space-y-2 p-2">
      <SeamlessPanel />
      <div className="flex items-baseline justify-between px-1 pb-1">
        <div className="font-mono text-[12px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">{def.name}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">{def.category}</div>
      </div>

      {def.params.map(p => {
        const v = layer.params[p.key] ?? p.default;
        const mod = layer.mods[p.key];
        const am = layer.audioMaps?.[p.key] ?? null;
        const open = openMap === p.key;
        return (
          <div key={p.key} className="glass-2 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-[hsl(var(--text-secondary))]">
                {p.label}
                <button
                  onClick={() => setOpenMap(open ? null : p.key)}
                  title={am ? `Mapped → ${am.source}` : "Map to audio"}
                  className={`grid h-3.5 w-3.5 place-items-center font-mono text-[10px] leading-none ${
                    am ? "text-[hsl(var(--accent))] audio-tilde-on" : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))]"
                  }`}
                  aria-label="audio mapping"
                >
                  ~
                </button>
              </label>
              <span className="font-mono text-[10px] text-[hsl(var(--text-secondary))]">
                {v.toFixed(p.step ? 0 : 2)}
              </span>
            </div>
            <input
              type="range" min={p.min} max={p.max} step={p.step ?? (p.max - p.min) / 200}
              value={v}
              onChange={(e) => setParam(layer.id, p.key, +e.target.value)}
              onDoubleClick={() => setParam(layer.id, p.key, p.default)}
              aria-label={`${p.label} for ${def.name}`}
              className={`slider-hair w-full ${mod ? "outline outline-1 outline-[hsl(var(--accent-dim))]" : ""}`}
            />
            {am && <AudioMeter source={am.source} />}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">mod:</span>
              {MOD_TYPES.map(m => {
                const on = mod?.type === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMod(layer.id, p.key, on ? null : { type: m.id, speed: 0.5, depth: (p.max - p.min) * 0.2, offset: 0 })}
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] transition ${
                      on
                        ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                        : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
              {mod && (
                <button
                  onClick={() => setMod(layer.id, p.key, null)}
                  className="ml-auto text-[hsl(var(--text-tertiary))] transition hover:text-[hsl(var(--destructive))]"
                >
                  <X className="h-3 w-3" strokeWidth={1.5} />
                </button>
              )}
            </div>
            {mod && (
              <div className="mt-2 grid grid-cols-3 gap-3">
                <ModSlider label="Speed" v={mod.speed} min={0} max={4} onChange={(x) => setMod(layer.id, p.key, { ...mod, speed: x })} />
                <ModSlider label="Depth" v={mod.depth} min={0} max={(p.max - p.min)} onChange={(x) => setMod(layer.id, p.key, { ...mod, depth: x })} />
                <ModSlider label="Offset" v={mod.offset} min={-(p.max - p.min)/2} max={(p.max - p.min)/2} onChange={(x) => setMod(layer.id, p.key, { ...mod, offset: x })} />
              </div>
            )}
            {open && (
              <AudioMapPopover
                value={am}
                onChange={(next) => setAudioMap(layer.id, p.key, next)}
                onClose={() => setOpenMap(null)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ModSlider({ label, v, min, max, onChange }: { label: string; v: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">{label}</span>
        <span className="font-mono text-[9px] text-[hsl(var(--text-secondary))]">{v.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={(max - min) / 200} value={v} onChange={(e) => onChange(+e.target.value)} className="slider-hair w-full" />
    </div>
  );
}

function AudioMeter({ source }: { source: AudioSource }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const sources = (window as any).__aegisAudioSources as Record<string, number> | undefined;
      const v = sources ? Math.min(1, sources[source] ?? 0) : 0;
      if (ref.current) ref.current.style.width = `${v * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source]);
  return (
    <div className="mt-1 h-[2px] w-full bg-[hsl(var(--border-subtle))]">
      <div ref={ref} className="audio-meter-bar h-full" style={{ width: 0 }} />
    </div>
  );
}

function AudioMapPopover({
  value,
  onChange,
  onClose,
}: {
  value: AudioMap | null;
  onChange: (m: AudioMap | null) => void;
  onClose: () => void;
}) {
  const v = value ?? { source: "bass" as AudioSource, amount: 0.6, smoothing: 0.3 };
  const update = (patch: Partial<AudioMap>) => onChange({ ...v, ...patch });
  return (
    <div className="glass-2 mt-2 space-y-2 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--accent))]">Audio Map</span>
        <button onClick={onClose} className="text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]" aria-label="close">
          <X className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex items-center gap-1">
        {SOURCES.map(s => (
          <button
            key={s}
            onClick={() => update({ source: s })}
            className={`flex-1 rounded-sm border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.04em] transition ${
              v.source === s
                ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                : "border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--text-primary))]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">Amount</span>
          <span className="font-mono text-[9px] text-[hsl(var(--text-secondary))]">{Math.round(v.amount * 100)}%</span>
        </div>
        <input type="range" min={-1} max={1} step={0.01} value={v.amount} onChange={(e) => update({ amount: +e.target.value })} className="slider-hair w-full" />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">Smoothing</span>
          <span className="font-mono text-[9px] text-[hsl(var(--text-secondary))]">{Math.round(v.smoothing * 100)}%</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={v.smoothing} onChange={(e) => update({ smoothing: +e.target.value })} className="slider-hair w-full" />
      </div>
      {value && (
        <button
          onClick={() => { onChange(null); onClose(); }}
          className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-[hsl(var(--border-default))] py-1 font-mono text-[9px] uppercase tracking-[0.04em] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--destructive))]"
        >
          <Trash2 className="h-3 w-3" strokeWidth={1.5} /> Remove mapping
        </button>
      )}
    </div>
  );
}
