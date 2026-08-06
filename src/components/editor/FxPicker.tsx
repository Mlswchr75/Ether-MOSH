import { useState } from "react";
import { EFFECTS, CATEGORY_LABELS, type EffectCategory } from "@/engine/effects";
import { useStore } from "@/store/useStore";
import { haptic } from "@/hooks/useHaptics";
import { Plus } from "lucide-react";

const CATEGORIES: EffectCategory[] = ["corruption", "color", "geometry", "atmosphere"];

export function FxPicker() {
  const [cat, setCat] = useState<EffectCategory>("corruption");
  const addLayer = useStore(s => s.addLayer);
  const items = EFFECTS.filter(e => e.category === cat);

  return (
    <div className="flex flex-col">
      <div className="flex gap-3 overflow-x-auto border-b border-[hsl(var(--border-subtle))] px-3 py-2 no-scrollbar">
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCat(c)}
            data-active={cat === c}
            className="tab-rack shrink-0 px-1 py-1.5"
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(eff => (
          <button
            key={eff.id}
            onClick={() => { addLayer(eff.id); haptic(8); }}
            className="glass-2 group flex flex-col gap-1 px-3 py-2.5 text-left transition hover:bg-[hsl(var(--surface-hover)/var(--surface-hover-a))]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-mono text-[12px] uppercase tracking-[0.04em] text-[hsl(var(--text-primary))]">{eff.name}</div>
              <Plus className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))] group-hover:text-[hsl(var(--text-secondary))]" strokeWidth={1.5} />
            </div>
            <div className="line-clamp-1 font-mono text-[10px] text-[hsl(var(--text-secondary))]">
              {eff.blurb}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
