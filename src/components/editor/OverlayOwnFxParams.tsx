import { SlidersHorizontal } from "lucide-react";
import { PUBLIC_EFFECTS } from "@/engine/effects";
import { patchOwnFxParam } from "@/engine/overlay/ownFxParams";
import type { OverlayEntity } from "@/engine/overlay/types";
import { useOverlayStore } from "@/store/useOverlayStore";

type Props = { entity: OverlayEntity };

export function OverlayOwnFxParams({ entity }: Props) {
  const patchEntity = useOverlayStore(s => s.patchEntity);
  if (entity.compositing !== "own-fx" || entity.ownFx.length === 0) return null;

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-violet-300/20 bg-violet-500/5 p-1">
      <SlidersHorizontal size={9} className="mx-1 text-violet-200" />
      {entity.ownFx.map((layer, index) => {
        const effect = PUBLIC_EFFECTS.find(item => item.id === layer.effectId);
        if (!effect) return null;
        return (
          <div key={layer.id} className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-white/10 px-1.5 py-1">
            <span className="font-mono text-[7px] uppercase text-violet-200/75">{index + 1}. {effect.name}</span>
            <label className="flex items-center gap-1 font-mono text-[7px] uppercase text-white/45">
              mix
              <input
                aria-label={`${effect.name} opacity`}
                type="range" min={0} max={1} step={0.05} value={layer.opacity}
                onChange={event => patchEntity(entity.id, { ownFx: entity.ownFx.map(item => item.id === layer.id ? { ...item, opacity: Number(event.target.value) } : item) })}
                className="w-12 accent-violet-300"
              />
            </label>
            {effect.params.map(param => {
              const value = typeof layer.params[param.key] === "number" ? layer.params[param.key] : param.default;
              return (
                <label key={param.key} className="flex items-center gap-1 font-mono text-[7px] uppercase text-white/45" title={`${effect.name}: ${param.label}`}>
                  {param.label}
                  <input
                    aria-label={`${effect.name} ${param.label}`}
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step ?? Math.max(0.001, (param.max - param.min) / 100)}
                    value={value}
                    onChange={event => patchEntity(entity.id, { ownFx: patchOwnFxParam(entity.ownFx, layer.id, param.key, Number(event.target.value)) })}
                    className="w-16 accent-violet-300"
                  />
                  <span className="min-w-8 text-right text-white/30">{Number(value).toFixed((param.step ?? 0.01) < 0.1 ? 2 : 1)}</span>
                </label>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
