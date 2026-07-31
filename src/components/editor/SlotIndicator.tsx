import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";

type Props = {
  onLoad: (i: number) => void;
};

export function SlotIndicator({ onLoad }: Props) {
  const slots = useStore(s => s.slots);
  const active = useStore(s => s.activeSlot);
  const anySaved = slots.some(s => !!s);
  if (!anySaved) return null;
  return (
    <div className="flex items-center gap-1">
      {slots.map((slot, i) => {
        const saved = !!slot;
        const isActive = active === i && saved;
        const tip = saved
          ? slot!.map(l => EFFECTS_BY_ID[l.effectId]?.name ?? l.effectId).join(" · ")
          : "Empty · Shift+" + (i + 1) + " to save";
        return (
          <button
            key={i}
            disabled={!saved}
            onClick={() => onLoad(i)}
            title={`Slot ${i + 1} · ${tip}`}
            className="grid h-6 w-6 place-items-center rounded-sm font-mono text-[10px] transition-colors"
            style={{
              border: "1px solid",
              borderColor: isActive
                ? "hsl(var(--accent))"
                : saved
                ? "hsl(var(--text-primary))"
                : "hsl(var(--border-default))",
              color: saved ? "hsl(var(--text-primary))" : "hsl(var(--text-tertiary))",
              background: isActive ? "hsl(var(--accent) / 0.12)" : "transparent",
              cursor: saved ? "pointer" : "default",
            }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
