import { useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Copy, RotateCcw, Trash2, ChevronDown, ChevronUp, Play, Pause, Repeat, Rewind } from "lucide-react";
import type { OverlayEntity, OverlayTransform } from "@/engine/overlay/types";
import { applyPinch, midpoint, translateNormalized, type Point } from "@/engine/overlay/transform";
import { useOverlayStore } from "@/store/useOverlayStore";
import { LottieOverlay } from "@/components/editor/LottieOverlay";

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
  const patchEntity = useOverlayStore(s => s.patchEntity);
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
    if (!gesture.current || pointers.current.size === 2) {
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
      startTransform: { ...(useOverlayStore.getState().entities.find(e => e.id === entity.id)?.transform ?? entity.transform) },
      startPointers: new Map(pointers.current),
    };
  };

  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  const setPlayback = (patch: Partial<OverlayEntity["playback"]>) => patchEntity(entity.id, {
    playback: { ...entity.playback, ...patch },
  });

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
        <LottieOverlay asset={entity.asset} playback={entity.playback} className="pointer-events-none h-full w-full" />
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
          className="absolute left-1/2 top-full mt-2 flex min-w-max -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/80 p-1 shadow-xl backdrop-blur-md"
          onPointerDown={event => event.stopPropagation()}
        >
          {isLottie && (
            <>
              <button
                className="rounded-full p-1.5 text-white/65 hover:bg-white/10 hover:text-white"
                title={entity.playback.playing ? "Pause animation" : "Play animation"}
                onClick={() => setPlayback({ playing: !entity.playback.playing })}
              >
                {entity.playback.playing ? <Pause size={11} /> : <Play size={11} />}
              </button>
              <button
                className={`rounded-full p-1.5 hover:bg-white/10 ${entity.playback.loop ? "text-cyan-200" : "text-white/40"}`}
                title="Toggle loop"
                onClick={() => setPlayback({ loop: !entity.playback.loop })}
              ><Repeat size={11} /></button>
              <button
                className={`rounded-full p-1.5 hover:bg-white/10 ${entity.playback.direction < 0 ? "text-cyan-200" : "text-white/50"}`}
                title="Reverse"
                onClick={() => setPlayback({ direction: entity.playback.direction < 0 ? 1 : -1 })}
              ><Rewind size={11} /></button>
              <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase tracking-wider text-white/40" title="Playback speed">
                {entity.playback.speed.toFixed(1)}×
                <input
                  aria-label="Playback speed"
                  type="range"
                  min={0.1}
                  max={4}
                  step={0.1}
                  value={entity.playback.speed}
                  onChange={event => setPlayback({ speed: Number(event.target.value) })}
                  className="w-14 accent-cyan-300"
                />
              </label>
              <span className="mx-0.5 h-4 w-px bg-white/10" />
            </>
          )}
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
