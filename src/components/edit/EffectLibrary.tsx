import { useState } from "react";
import { EFFECTS, CATEGORY_LABELS, type EffectCategory } from "@/engine/effects";
import { useStore } from "@/store/useStore";
import { haptic } from "@/hooks/useHaptics";

const CATEGORIES: EffectCategory[] = ["corruption", "color", "geometry", "atmosphere"];

/** Browsable effect catalog — tapping an effect pushes a layer onto the stack. */
export const EffectLibrary = ({ onAdd }: { onAdd?: () => void }) => {
  const [cat, setCat] = useState<EffectCategory>("corruption");
  const addLayer = useStore(s => s.addLayer);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto">
        {CATEGORIES.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={`whitespace-nowrap border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
              cat === c
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-foreground/60 hover:border-foreground/40"
            }`}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pb-2 sm:grid-cols-3">
        {EFFECTS.filter(e => e.category === cat).map(e => (
          <button
            key={e.id}
            type="button"
            onClick={() => { addLayer(e.id); haptic(8); onAdd?.(); }}
            className="min-h-[44px] border border-border/70 px-2 py-2 text-left transition hover:border-accent hover:bg-accent/10"
            title={e.blurb}
          >
            <div className="font-mono text-[11px] uppercase tracking-wider text-foreground/90">{e.name}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-foreground/45">{e.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
