import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { BLEND_MODES } from "@/engine/blend";
import { Eye, EyeOff, Lock, LockOpen, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";

export function LayerStack() {
  const layers = useStore(s => s.layers);
  const selected = useStore(s => s.selectedLayerId);
  const select = useStore(s => s.selectLayer);
  const toggleHidden = useStore(s => s.toggleHidden);
  const toggleLocked = useStore(s => s.toggleLocked);
  const duplicate = useStore(s => s.duplicateLayer);
  const remove = useStore(s => s.removeLayer);
  const reorder = useStore(s => s.reorderLayer);
  const setOpacity = useStore(s => s.setOpacity);
  const setBlend = useStore(s => s.setBlend);

  if (!layers.length) {
    return (
      <div className="px-5 py-10 text-center font-mono text-[11px] uppercase tracking-[0.04em] text-[hsl(var(--text-tertiary))]">
        no layers — open <span className="text-[hsl(var(--text-secondary))]">FX</span> or tap to randomize
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {[...layers].reverse().map((l) => {
        const def = EFFECTS_BY_ID[l.effectId];
        const isSel = selected === l.id;
        return (
          <li
            key={l.id}
            className={`flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--border-subtle))] px-3 py-2.5 transition ${
              isSel ? "border-l border-l-[hsl(var(--accent))] bg-[hsl(var(--surface-hover)/var(--surface-hover-a))]" : "hover:bg-[hsl(var(--surface-hover)/var(--surface-hover-a))]"
            }`}
            onClick={() => select(l.id)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); toggleHidden(l.id); }}
              className="text-[hsl(var(--text-tertiary))] transition hover:text-[hsl(var(--text-primary))]"
              aria-label="toggle visibility"
            >
              {l.hidden ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); toggleLocked(l.id); }}
              className={l.locked ? "text-[hsl(var(--accent))]" : "text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]"}
              aria-label="toggle lock"
            >
              {l.locked ? <Lock className="h-3.5 w-3.5" strokeWidth={1.5} /> : <LockOpen className="h-3.5 w-3.5" strokeWidth={1.5} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[12px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">{def.name}</div>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={l.blend}
                  onChange={(e) => { setBlend(l.id, e.target.value as typeof l.blend); }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Blend mode for ${def.name}`}
                  className="border-none bg-transparent font-mono text-[10px] uppercase tracking-[0.04em] text-[hsl(var(--text-secondary))] focus:outline-none"
                >
                  {BLEND_MODES.map(b => <option key={b} value={b} className="bg-[hsl(var(--surface-1))]">{b}</option>)}
                </select>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={l.opacity}
                  onChange={(e) => setOpacity(l.id, +e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Opacity for ${def.name}`}
                  className="slider-hair flex-1"
                />
              </div>
            </div>
            <div className="flex flex-col">
              <button onClick={(e) => { e.stopPropagation(); reorder(l.id, 1); }} aria-label={`Move ${def.name} up`} className="text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]">
                <ChevronUp className="h-3 w-3" strokeWidth={1.5} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); reorder(l.id, -1); }} aria-label={`Move ${def.name} down`} className="text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]">
                <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
              </button>
            </div>
            <button onClick={(e) => { e.stopPropagation(); duplicate(l.id); }} className="text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))]" aria-label="duplicate">
              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); remove(l.id); }} className="text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--destructive))]" aria-label="delete">
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
