import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Copy, RotateCcw, Trash2, ChevronDown, ChevronUp, Play, Pause, Repeat, Rewind, Zap, Sparkles, Crosshair } from "lucide-react";
import type { OverlayBehaviorKind, OverlayEntity, OverlayReaction, OverlayTrackingTarget, OverlayTransform } from "@/engine/overlay/types";
import { applyPinch, midpoint, translateNormalized, type Point } from "@/engine/overlay/transform";
import { sampleBehavior } from "@/engine/overlay/behaviors";
import { mapOverlayReactions, smoothReactionValue, sourceValue } from "@/engine/overlay/reactions";
import { getOverlayAudioData } from "@/engine/overlay/audioBridge";
import { applyTrackedTarget, getTrackedTarget } from "@/engine/overlay/tracking";
import { overlayCssBlend } from "@/engine/overlay/compositing";
import { useOverlayStore } from "@/store/useOverlayStore";
import { OverlayMedia } from "@/components/editor/OverlayMedia";
import { OverlaySwarm } from "@/components/editor/OverlaySwarm";

type Props = { entity: OverlayEntity; selected: boolean; index: number; count: number };
type Gesture = { startTransform: OverlayTransform; startPointers: Map<number, Point> };

const BEHAVIORS: Array<{ value: OverlayBehaviorKind; label: string }> = [
  { value: "none", label: "Still" }, { value: "float", label: "Float" }, { value: "pulse", label: "Pulse" },
  { value: "wobble", label: "Wobble" }, { value: "orbit", label: "Orbit" }, { value: "bounce", label: "Bounce" },
  { value: "flicker", label: "Flicker" }, { value: "jitter", label: "Jitter" }, { value: "random-walk", label: "Drift" },
];

type ReactionPreset = "off" | "bass-pulse" | "beat-punch" | "mid-spin" | "treble-flicker" | "overall-breathe";
function makeReaction(source: OverlayReaction["source"], target: OverlayReaction["target"], amount: number, smoothing: number): OverlayReaction {
  return { id: crypto.randomUUID(), source, target, amount, smoothing, invert: false };
}
function reactionsForPreset(preset: ReactionPreset): OverlayReaction[] {
  switch (preset) {
    case "bass-pulse": return [makeReaction("bass", "scale", 0.8, 0.3)];
    case "beat-punch": return [makeReaction("beat", "scale", 1.25, 0.05), makeReaction("beat", "rotation", 0.08, 0.08)];
    case "mid-spin": return [makeReaction("mid", "rotation", 0.65, 0.45)];
    case "treble-flicker": return [makeReaction("treble", "opacity", -0.55, 0.18)];
    case "overall-breathe": return [makeReaction("overall", "scale", 0.45, 0.65)];
    default: return [];
  }
}
function identifyReactionPreset(reactions: OverlayReaction[]): ReactionPreset {
  if (!reactions.length) return "off";
  const first = reactions[0];
  if (first.source === "bass" && first.target === "scale") return "bass-pulse";
  if (first.source === "beat" && first.target === "scale") return "beat-punch";
  if (first.source === "mid" && first.target === "rotation") return "mid-spin";
  if (first.source === "treble" && first.target === "opacity") return "treble-flicker";
  if (first.source === "overall" && first.target === "scale") return "overall-breathe";
  return "off";
}

export function OverlayEntityView({ entity, selected, index, count }: Props) {
  const patchTransform = useOverlayStore(s => s.patchTransform);
  const patchEntity = useOverlayStore(s => s.patchEntity);
  const selectEntity = useOverlayStore(s => s.selectEntity);
  const duplicateEntity = useOverlayStore(s => s.duplicateEntity);
  const removeEntity = useOverlayStore(s => s.removeEntity);
  const reorderEntity = useOverlayStore(s => s.reorderEntity);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reactionSmoothRef = useRef<Record<string, number>>({});

  const style = useMemo<CSSProperties>(() => ({
    position: "absolute", left: `${entity.transform.x * 100}%`, top: `${entity.transform.y * 100}%`,
    width: entity.asset.width ? Math.min(entity.asset.width, 512) : 220, height: entity.asset.height ? Math.min(entity.asset.height, 512) : 220,
    opacity: entity.transform.opacity,
    transform: `translate(-50%, -50%) scale(${entity.transform.scale}) rotate(${entity.transform.rotation}deg)`,
    transformOrigin: "center", zIndex: 20 + index, mixBlendMode: overlayCssBlend(entity.blend), touchAction: "none",
    display: entity.hidden ? "none" : undefined,
    willChange: entity.behavior.kind === "none" && !entity.reactions.length && !entity.tracking?.enabled ? undefined : "transform,left,top,opacity",
  }), [entity, index]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || entity.hidden) return;
    const animated = entity.behavior.kind !== "none" || entity.reactions.length > 0 || !!entity.tracking?.enabled;
    if (!animated) return;
    let raf = 0;
    const tick = (time: number) => {
      const trackedBase = entity.tracking?.enabled
        ? applyTrackedTarget(entity.transform, entity.tracking, getTrackedTarget(entity.tracking.target))
        : entity.transform;
      const behavior = sampleBehavior(entity.behavior, time, trackedBase);
      const audio = getOverlayAudioData();
      const smoothed = reactionSmoothRef.current;
      for (const reaction of entity.reactions) {
        const next = sourceValue(reaction, audio);
        smoothed[reaction.id] = smoothReactionValue(smoothed[reaction.id] ?? next, next, reaction.smoothing);
      }
      const react = mapOverlayReactions(entity.reactions, audio, smoothed);
      el.style.left = `${(trackedBase.x + behavior.x) * 100}%`;
      el.style.top = `${(trackedBase.y + behavior.y) * 100}%`;
      el.style.opacity = String(Math.max(0, Math.min(1, trackedBase.opacity * behavior.opacity * react.opacity)));
      el.style.transform = `translate(-50%, -50%) scale(${trackedBase.scale * behavior.scale * react.scale}) rotate(${trackedBase.rotation + behavior.rotation + react.rotation}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [entity.behavior, entity.hidden, entity.reactions, entity.tracking, entity.transform]);

  const pointOf = (event: ReactPointerEvent): Point => ({ x: event.clientX, y: event.clientY });
  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation(); selectEntity(entity.id); if (entity.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, pointOf(event));
    if (!gesture.current || pointers.current.size === 2) gesture.current = { startTransform: { ...entity.transform }, startPointers: new Map(pointers.current) };
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current || entity.locked) return;
    pointers.current.set(event.pointerId, pointOf(event)); const stage = event.currentTarget.parentElement?.getBoundingClientRect(); if (!stage) return;
    const current = [...pointers.current.values()], initial = [...gesture.current.startPointers.values()];
    if (current.length >= 2 && initial.length >= 2) {
      const pinched = applyPinch(gesture.current.startTransform, initial[0], initial[1], current[0], current[1]);
      const a = midpoint(initial[0], initial[1]), b = midpoint(current[0], current[1]);
      patchTransform(entity.id, translateNormalized(pinched, { x: b.x - a.x, y: b.y - a.y }, stage)); return;
    }
    const start = initial[0], now = current[0]; if (!start || !now) return;
    patchTransform(entity.id, translateNormalized(gesture.current.startTransform, { x: now.x - start.x, y: now.y - start.y }, stage));
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) { gesture.current = null; return; }
    gesture.current = { startTransform: { ...(useOverlayStore.getState().entities.find(e => e.id === entity.id)?.transform ?? entity.transform) }, startPointers: new Map(pointers.current) };
  };

  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  const setPlayback = (patch: Partial<OverlayEntity["playback"]>) => patchEntity(entity.id, { playback: { ...entity.playback, ...patch } });
  const setBehavior = (patch: Partial<OverlayEntity["behavior"]>) => patchEntity(entity.id, { behavior: { ...entity.behavior, ...patch } });
  const setSwarm = (patch: Partial<OverlayEntity["swarm"]>) => patchEntity(entity.id, { swarm: { ...entity.swarm, ...patch } });
  const setTracking = (target: "off" | OverlayTrackingTarget) => patchEntity(entity.id, {
    tracking: target === "off" ? null : {
      enabled: true, target, offsetX: 0, offsetY: 0, scaleWithTarget: target === "person" || target === "hand" || target === "face", rotateWithTarget: target === "hand" || target === "face",
    },
  });
  const reactionPreset = identifyReactionPreset(entity.reactions);
  const trackingValue: "off" | OverlayTrackingTarget = entity.tracking?.enabled ? entity.tracking.target : "off";

  return (
    <div ref={rootRef} style={style} className={`group select-none pointer-events-auto ${selected ? "outline outline-1 outline-cyan-300/80" : ""}`} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={() => duplicateEntity(entity.id)}>
      <OverlaySwarm entity={entity} />
      <OverlayMedia entity={entity} />

      {selected && (
        <div className="absolute left-1/2 top-full mt-2 flex min-w-max max-w-[min(94vw,52rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-white/15 bg-black/80 p-1 shadow-xl backdrop-blur-md" onPointerDown={event => event.stopPropagation()}>
          {isLottie && <>
            <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10" title={entity.playback.playing ? "Pause animation" : "Play animation"} onClick={() => setPlayback({ playing: !entity.playback.playing })}>{entity.playback.playing ? <Pause size={11} /> : <Play size={11} />}</button>
            <button className={`rounded-full p-1.5 hover:bg-white/10 ${entity.playback.loop ? "text-cyan-200" : "text-white/40"}`} title="Toggle loop" onClick={() => setPlayback({ loop: !entity.playback.loop })}><Repeat size={11} /></button>
            <button className={`rounded-full p-1.5 hover:bg-white/10 ${entity.playback.direction < 0 ? "text-cyan-200" : "text-white/50"}`} title="Reverse" onClick={() => setPlayback({ direction: entity.playback.direction < 0 ? 1 : -1 })}><Rewind size={11} /></button>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">{entity.playback.speed.toFixed(1)}×<input aria-label="Playback speed" type="range" min={0.1} max={4} step={0.1} value={entity.playback.speed} onChange={e => setPlayback({ speed: Number(e.target.value) })} className="w-14 accent-cyan-300" /></label>
            <span className="mx-0.5 h-4 w-px bg-white/10" />
          </>}

          <select aria-label="Sticker behavior" value={entity.behavior.kind} onChange={e => setBehavior({ kind: e.target.value as OverlayBehaviorKind })} className="rounded-full border border-white/10 bg-black/70 px-2 py-1 font-mono text-[7px] uppercase text-white/65 outline-none" title="Behavior">
            {BEHAVIORS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {entity.behavior.kind !== "none" && <>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">amt<input aria-label="Behavior amount" type="range" min={0} max={1} step={0.05} value={entity.behavior.amount} onChange={e => setBehavior({ amount: Number(e.target.value) })} className="w-12 accent-cyan-300" /></label>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">spd<input aria-label="Behavior speed" type="range" min={0.1} max={4} step={0.1} value={entity.behavior.speed} onChange={e => setBehavior({ speed: Number(e.target.value) })} className="w-12 accent-cyan-300" /></label>
          </>}

          <label className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[7px] uppercase ${reactionPreset === "off" ? "border-white/10 text-white/45" : "border-cyan-300/30 text-cyan-200"}`}><Zap size={9} /><select aria-label="Audio reaction preset" value={reactionPreset} onChange={e => patchEntity(entity.id, { reactions: reactionsForPreset(e.target.value as ReactionPreset) })} className="bg-transparent text-inherit outline-none"><option value="off">React off</option><option value="bass-pulse">Bass pulse</option><option value="beat-punch">Beat punch</option><option value="mid-spin">Mid spin</option><option value="treble-flicker">Treble flicker</option><option value="overall-breathe">Volume breathe</option></select></label>

          <label className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[7px] uppercase ${trackingValue === "off" ? "border-white/10 text-white/45" : "border-emerald-300/35 text-emerald-200"}`}><Crosshair size={9} /><select aria-label="Tracking target" value={trackingValue} onChange={e => setTracking(e.target.value as "off" | OverlayTrackingTarget)} className="bg-transparent text-inherit outline-none"><option value="off">Track off</option><option value="hand">Hand</option><option value="face">Face</option><option value="person">Subject</option><option value="object">Object</option><option value="journey">Journey focus</option></select></label>

          <button className={`flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[7px] uppercase ${entity.swarm.enabled ? "border-fuchsia-300/40 text-fuchsia-200" : "border-white/10 text-white/45"}`} title="Toggle Swarm" onClick={() => setSwarm({ enabled: !entity.swarm.enabled })}><Sparkles size={9} />Swarm</button>
          {entity.swarm.enabled && <>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">n {entity.swarm.count}<input aria-label="Swarm count" type="range" min={2} max={isLottie ? 12 : 32} step={1} value={entity.swarm.count} onChange={e => setSwarm({ count: Number(e.target.value) })} className="w-14 accent-fuchsia-300" /></label>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">spread<input aria-label="Swarm spread" type="range" min={0.2} max={3} step={0.1} value={entity.swarm.spread} onChange={e => setSwarm({ spread: Number(e.target.value) })} className="w-12 accent-fuchsia-300" /></label>
            <label className="flex items-center gap-1 px-1 font-mono text-[7px] uppercase text-white/40">chaos<input aria-label="Swarm chaos" type="range" min={0} max={1} step={0.05} value={entity.swarm.chaos} onChange={e => setSwarm({ chaos: Number(e.target.value) })} className="w-12 accent-fuchsia-300" /></label>
          </>}

          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10" title="Rotate 15°" onClick={() => patchTransform(entity.id, { rotation: entity.transform.rotation + 15 })}><RotateCcw size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 disabled:opacity-25" title="Move backward" disabled={index === 0} onClick={() => reorderEntity(entity.id, -1)}><ChevronDown size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10 disabled:opacity-25" title="Move forward" disabled={index === count - 1} onClick={() => reorderEntity(entity.id, 1)}><ChevronUp size={11} /></button>
          <button className="rounded-full p-1.5 text-white/65 hover:bg-white/10" title="Duplicate" onClick={() => duplicateEntity(entity.id)}><Copy size={11} /></button>
          <button className="rounded-full p-1.5 text-red-300/75 hover:bg-red-500/15" title="Delete" onClick={() => removeEntity(entity.id)}><Trash2 size={11} /></button>
        </div>
      )}
    </div>
  );
}
