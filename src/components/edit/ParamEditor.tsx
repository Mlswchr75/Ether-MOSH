import { EFFECTS_BY_ID } from "@/engine/effects";
import { useStore } from "@/store/useStore";
import type { Layer, Modulator, ModulatorType } from "@/store/types";

/**
 * Per-parameter sliders plus a modulator cycle button. Audio-typed modulators
 * (beat / bass / mid / high / audio) read the live analyser, LFO types run on
 * the clock — both are resolved per-frame in engine/modulate.ts.
 */
const MOD_CYCLE: Array<ModulatorType | null> = [null, "sine", "triangle", "saw", "perlin", "random", "beat", "bass", "mid", "high", "audio"];

const MOD_BADGE: Record<ModulatorType, string> = {
  sine: "SIN", triangle: "TRI", saw: "SAW", perlin: "PLN", random: "RND",
  beat: "BEAT", bass: "BASS", mid: "MID", high: "HIGH", audio: "AUD",
};

export const ParamEditor = ({ layer }: { layer: Layer }) => {
  const setParam = useStore(s => s.setParam);
  const setModulator = useStore(s => s.setModulator);
  const def = EFFECTS_BY_ID[layer.effectId];
  if (!def) return null;

  const cycleMod = (key: string) => {
    const cur = layer.mods[key]?.type ?? null;
    const next = MOD_CYCLE[(MOD_CYCLE.indexOf(cur) + 1) % MOD_CYCLE.length];
    setModulator(layer.id, key, next ? { type: next, speed: 0.4, depth: 0.5, offset: 0 } : null);
  };

  const updateMod = (key: string, patch: Partial<Modulator>) => {
    const cur = layer.mods[key];
    if (!cur) return;
    setModulator(layer.id, key, { ...cur, ...patch });
  };

  return (
    <div className="space-y-3">
      {def.params.map(p => {
        const mod = layer.mods[p.key];
        return (
          <div key={p.key} className="space-y-1.5">
            <div className="flex items-center gap-3">
              <label className="w-14 truncate font-mono text-[10px] uppercase tracking-widest text-foreground/50" title={p.label}>
                {p.label}
              </label>
              <input
                type="range" min={p.min} max={p.max} step={p.step ?? (p.max - p.min) / 200}
                value={layer.params[p.key] ?? p.default}
                onChange={(e) => setParam(layer.id, p.key, Number(e.target.value))}
                className="mosh-range flex-1"
              />
              <button
                type="button"
                onClick={() => cycleMod(p.key)}
                className={`min-h-[28px] w-12 border px-1 font-mono text-[9px] uppercase tracking-wider transition ${
                  mod ? "border-accent text-accent" : "border-border text-foreground/40 hover:border-foreground/40"
                }`}
                aria-label={`Modulate ${p.label}`}
              >
                {mod ? MOD_BADGE[mod.type] : "mod"}
              </button>
            </div>
            {mod && (
              <div className="flex items-center gap-3 pl-14 pr-[3.75rem]">
                <span className="font-mono text-[9px] uppercase text-foreground/40">spd</span>
                <input
                  type="range" min={0.05} max={4} step={0.05} value={mod.speed}
                  onChange={(e) => updateMod(p.key, { speed: Number(e.target.value) })}
                  className="mosh-range flex-1"
                />
                <span className="font-mono text-[9px] uppercase text-foreground/40">dep</span>
                <input
                  type="range" min={0} max={1} step={0.01} value={mod.depth}
                  onChange={(e) => updateMod(p.key, { depth: Number(e.target.value) })}
                  className="mosh-range flex-1"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
