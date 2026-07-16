import { Eye, EyeOff, Lock, LockOpen, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { BLEND_MODES } from "@/engine/blend";
import { useStore } from "@/store/useStore";
import { ParamEditor } from "./ParamEditor";

/**
 * The layer stack: bottom of the list renders first, top renders last.
 * Selecting a row expands its parameter editor inline.
 */
export const LayerStack = () => {
  const layers = useStore(s => s.layers);
  const selectedLayerId = useStore(s => s.selectedLayerId);
  const selectLayer = useStore(s => s.selectLayer);
  const toggleHidden = useStore(s => s.toggleHidden);
  const toggleLocked = useStore(s => s.toggleLocked);
  const duplicateLayer = useStore(s => s.duplicateLayer);
  const removeLayer = useStore(s => s.removeLayer);
  const reorderLayer = useStore(s => s.reorderLayer);
  const setOpacity = useStore(s => s.setOpacity);
  const setBlend = useStore(s => s.setBlend);

  if (!layers.length) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.2em] text-foreground/40">
        stack is empty —<br />add an effect or hit MOSH
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto pb-2">
      {[...layers].reverse().map(layer => {
        const def = EFFECTS_BY_ID[layer.effectId];
        const selected = layer.id === selectedLayerId;
        const iconBtn = "flex h-8 w-8 min-w-[32px] items-center justify-center text-foreground/50 transition hover:text-foreground";
        return (
          <div
            key={layer.id}
            className={`border transition ${selected ? "border-primary/70 bg-primary/5" : "border-border/60"}`}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                onClick={() => selectLayer(selected ? null : layer.id)}
                className={`flex-1 truncate text-left font-mono text-[11px] uppercase tracking-wider ${layer.hidden ? "text-foreground/35 line-through" : "text-foreground/90"}`}
              >
                {def?.name ?? layer.effectId}
              </button>
              <button type="button" onClick={() => reorderLayer(layer.id, 1)} className={iconBtn} aria-label="Move up"><ChevronUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => reorderLayer(layer.id, -1)} className={iconBtn} aria-label="Move down"><ChevronDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => toggleHidden(layer.id)} className={iconBtn} aria-label={layer.hidden ? "Show layer" : "Hide layer"}>
                {layer.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => toggleLocked(layer.id)} className={`${iconBtn} ${layer.locked ? "text-accent" : ""}`} aria-label={layer.locked ? "Unlock layer" : "Lock layer (survives MOSH)"}>
                {layer.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => duplicateLayer(layer.id)} className={iconBtn} aria-label="Duplicate layer"><Copy className="h-4 w-4" /></button>
              <button type="button" onClick={() => removeLayer(layer.id)} className={`${iconBtn} hover:text-primary`} aria-label="Delete layer"><Trash2 className="h-4 w-4" /></button>
            </div>

            {selected && (
              <div className="space-y-3 border-t border-border/60 px-3 py-3">
                <div className="flex items-center gap-3">
                  <label className="w-14 font-mono text-[10px] uppercase tracking-widest text-foreground/50">blend</label>
                  <select
                    value={layer.blend}
                    onChange={(e) => setBlend(layer.id, e.target.value as typeof layer.blend)}
                    className="flex-1 border border-border bg-background px-2 py-1.5 font-mono text-[11px] uppercase tracking-wider text-foreground/85 outline-none focus:border-accent"
                  >
                    {BLEND_MODES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="w-14 font-mono text-[10px] uppercase tracking-widest text-foreground/50">opacity</label>
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={layer.opacity}
                    onChange={(e) => setOpacity(layer.id, Number(e.target.value))}
                    className="mosh-range flex-1"
                  />
                  <span className="w-8 text-right font-mono text-[10px] text-foreground/60">{Math.round(layer.opacity * 100)}</span>
                </div>
                <ParamEditor layer={layer} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
