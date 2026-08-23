import { useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Copy, RotateCcw, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { OverlayEntity, OverlayTransform } from "@/engine/overlay/types";
import { applyPinch, midpoint, translateNormalized, type Point } from "@/engine/overlay/transform";
import { useOverlayStore } from "@/store/useOverlayStore";

type Props = {
  entity: OverlayEntity;
  selected: boolean;
  index: number;
  count: number;
};

type Gesture = {
  startTransform: OverlayTransform;
  startPointers: Map<number, Point>;
};

export function OverlayEntityView({ entity, selected, index, count }: Props) {
  const patchTransform = useOverlayStore(s => s.patchTransform);
  const selectEntity = useOverlayStore(s => s.selectEntity);
  const duplicateEntity = useOverlayStore(s => s.duplicateEntity);
  const removeEntity = useOverlayStore(s => s.removeEntity);
  const reorderEntity = useOverlayStore(s => s.reorderEntity);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);

  const style = useMemo<CSSProperties>(() => ({
    position: "absolute",
    left: `${entity.transform.x * 100}%`,
    top: `${entity.transform.y * 100}%`,
    width: entity.asset.width ? Math.min(entity.asset.width, 512) : 220,
    height: entity.asset.height ? Math.min(entity.asset.height, 512) : 220,
    opacity: entity.transform.opacity,
    transform: `translate(-50%, -50%) scale(${entity.transform.scale}) rotate(${entity.transform.rotation}deg)`,
    transformOrigin: "center",
    zIndex: 20 + index,
    mixBlendMode: entity.blend as CSSProperties["mixBlendMode"],
    touchAction: "none",
    display: entity.hidden ? "none" : undefined,
  }), [entity, index]);

  const pointOf = (event: ReactPointerEvent): Point => ({ x: event.clientX, y: event.clientY });

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    selectEntity(entity.id);
    if (entity.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, pointOf(event));
    if (!gesture.current) {
      gesture.current = {
        startTransform: { ...entity.transform },
        startPointers: new Map(pointers.current),
      };
    } else if (pointers.current.size === 2) {
      gesture.current = {
        startTransform: { ...entity.transform },
        startPointers: new Map(pointers.current),
      };
    }
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current || entity.locked) return;
    pointers.current.set(event.pointerId, pointOf(event));
    const stage = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!stage) return;

    const current = [...pointers.current.values()];
    const initial = [...gesture.current.startPointers.values()];
    if (current.length >= 2 && initial.length >= 2) {
      const pinched = applyPinch(gesture.current.startTransform, initial[0], initial[1], current[0], current[1]);
      const a = midpoint(initial[0], initial[1]);
      const b = midpoint(current[0], current[1]);
      const moved = translateNormalized(pinched, { x: b.x - a.x, y: b.y - a.y }, stage);
      patchTransform(entity.id, moved);
      return;
    }

    const start = initial[0];
    const now = current[0];
    if (!start || !now) return;
    patchTransform(entity.id, translateNormalized(
      gesture.current.startTransform,
      { x: now.x - start.x, y: now.y - start.y },
      stage,
    ));
  };

  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      return;
    }
    gesture.current = {
      startTransform: { ...useOverlayStore.getState().entities.find(e => e.id === entity.id)?.transform ?? entity.transform },
      startPointers: new Map(pointers.current),
    };
  };

  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";

  return (
    <div
      style={style}
      className={`group select-none ${selected ? "outline outline-1 outline-cyan-300/80" : ""}`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => duplicateEntity(entity.id)}
    >
      {isLottie ? (
        <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-white/25 bg-black/35 font-mono text-[9px] uppercase tracking-[0.2em] text-white/45">
          Lottie ready
        </div>
      ) : (
        <img
          src={entity.asset.url}
          alt={entity.asset.name || "sticker"}
          draggable={false}
          className="pointer-events-none h-full w-full object-contain"
        />
      )}

      {selected && (
        <div
          className="absolute left-1/2 top-full mt-2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/80 p-1 shadow-xl backdrop-blur-md"
          onPointerDown={event => event.stopPropagation()}
        >
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white" title="Rotate 15°" onClick={() => patchTransform(entity.id, { rotation: entity.transform.rotation + 15 })}><RotateCcw size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-25" title="Move backward" disabled={index === 0} onClick={() => reorderEntity(entity.id, -1)}><ChevronDown size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-25" title="Move forward" disabled={index === count - 1} onClick={() => reorderEntity(entity.id, 1)}><ChevronUp size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white" title="Duplicate" onClick={() => duplicateEntity(entity.id)}><Copy size={11} /></button>
          <button className="rounded-full p-1.5 text-red-300/75 hover:bg-red-500/15 hover:text-red-200" title="Delete" onClick={() => removeEntity(entity.id)}><Trash2 size={11} /></button>
        </div>
      )}
    </div>
  );
}
