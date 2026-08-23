import { Eye, EyeOff, Lock, Unlock, Layers3, Crosshair, WandSparkles } from "lucide-react";
import { BLEND_MODES, type BlendMode } from "@/engine/blend";
import { PUBLIC_EFFECTS } from "@/engine/effects";
import type { OverlayCompositingMode, OverlayTrackingTarget } from "@/engine/overlay/types";
import { makeLayer } from "@/store/useStore";
import { useOverlayStore } from "@/store/useOverlayStore";

const TRACK_OPTIONS: Array<{ value: "off" | OverlayTrackingTarget; label: string }> = [
  { value: "off", label: "Track off" },
  { value: "hand", label: "Hand" },
  { value: "face", label: "Face" },
  { value: "person", label: "Subject" },
  { value: "object", label: "Object" },
  { value: "journey", label: "Journey focus" },
];

const OWN_FX = PUBLIC_EFFECTS.filter(effect => effect.category !== "dimension");
const DEFAULT_OWN_FX = OWN_FX[0]?.id ?? PUBLIC_EFFECTS[0]?.id ?? "";

export function OverlayInspector() {
  const selectedId = useOverlayStore(s => s.selectedId);
  const entity = useOverlayStore(s => s.entities.find(item => item.id === selectedId) ?? null);
  const patchEntity = useOverlayStore(s => s.patchEntity);
  if (!entity) return null;

  const trackingValue: "off" | OverlayTrackingTarget = entity.tracking?.enabled ? entity.tracking.target : "off";
  const setTracking = (target: "off" | OverlayTrackingTarget) => patchEntity(entity.id, {
    tracking: target === "off" ? null : {
      enabled: true,
      target,
      offsetX: 0,
      offsetY: 0,
      scaleWithTarget: target === "person" || target === "hand" || target === "face",
      rotateWithTarget: target === "hand" || target === "face",
    },
  });

  const setCompositing = (mode: OverlayCompositingMode) => {
    if (mode === "own-fx" && entity.ownFx.length === 0 && DEFAULT_OWN_FX) {
      patchEntity(entity.id, { compositing: mode, ownFx: [makeLayer(DEFAULT_OWN_FX)] });
      return;
    }
    patchEntity(entity.id, { compositing: mode });
  };

  const ownEffectId = entity.ownFx[0]?.effectId ?? DEFAULT_OWN_FX;

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-[90] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-1 rounded-xl border border-white/15 bg-black/75 p-1.5 shadow-xl backdrop-blur-md">
      <span className="max-w-28 truncate px-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-white/45" title={entity.asset.name}>{entity.asset.name || "Sticker"}</span>

      <select aria-label="Sticker blend mode" value={entity.blend} onChange={event => patchEntity(entity.id, { blend: event.target.value as BlendMode })} className="rounded-full border border-white/10 bg-black/70 px-2 py-1 font-mono text-[7px] uppercase text-white/65 outline-none" title="Blend mode">
        {BLEND_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
      </select>

      <label className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-white/55" title="Tracking target">
        <Crosshair size={9} />
        <select aria-label="Inspector tracking target" value={trackingValue} onChange={event => setTracking(event.target.value as "off" | OverlayTrackingTarget)} className="bg-transparent font-mono text-[7px] uppercase text-inherit outline-none">
          {TRACK_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-white/55" title="Compositing route">
        <Layers3 size={9} />
        <select aria-label="Sticker compositing route" value={entity.compositing} onChange={event => setCompositing(event.target.value as OverlayCompositingMode)} className="bg-transparent font-mono text-[7px] uppercase text-inherit outline-none">
          <option value="after-fx">After FX</option>
          <option value="before-fx">Before FX</option>
          <option value="own-fx">Own FX</option>
        </select>
      </label>

      {entity.compositing === "own-fx" && (
        <label className="flex items-center gap-1 rounded-full border border-fuchsia-300/25 px-2 py-1 text-fuchsia-200" title="Independent sticker effect">
          <WandSparkles size={9} />
          <select
            aria-label="Independent sticker effect"
            value={ownEffectId}
            onChange={event => patchEntity(entity.id, { ownFx: [makeLayer(event.target.value)] })}
            className="max-w-36 bg-transparent font-mono text-[7px] uppercase text-inherit outline-none"
          >
            {OWN_FX.map(effect => <option key={effect.id} value={effect.id}>{effect.name}</option>)}
          </select>
        </label>
      )}

      <button type="button" onClick={() => patchEntity(entity.id, { hidden: !entity.hidden })} className="rounded-full p-1.5 text-white/55 hover:bg-white/10 hover:text-white" title={entity.hidden ? "Show sticker" : "Hide sticker"}>{entity.hidden ? <EyeOff size={11} /> : <Eye size={11} />}</button>
      <button type="button" onClick={() => patchEntity(entity.id, { locked: !entity.locked })} className={`rounded-full p-1.5 hover:bg-white/10 ${entity.locked ? "text-amber-200" : "text-white/55 hover:text-white"}`} title={entity.locked ? "Unlock sticker" : "Lock sticker"}>{entity.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
    </div>
  );
}
