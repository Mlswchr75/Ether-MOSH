import { useMemo } from "react";
import type { OverlayEntity } from "@/engine/overlay/types";
import { currentOverlayPerformanceBudget } from "@/engine/overlay/performanceBudget";
import { generateSwarmInstances } from "@/engine/overlay/swarm";
import { LottieOverlay } from "./LottieOverlay";

type Props = { entity: OverlayEntity };
const PERF = currentOverlayPerformanceBudget();

export function OverlaySwarm({ entity }: Props) {
  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  const budgetedSwarm = useMemo(() => ({
    ...entity.swarm,
    count: Math.min(entity.swarm.count, isLottie ? PERF.lottieSwarmCap : PERF.rasterSwarmCap),
  }), [entity.swarm, isLottie]);
  const instances = useMemo(() => generateSwarmInstances(budgetedSwarm, isLottie), [budgetedSwarm, isLottie]);
  if (!entity.swarm.enabled || instances.length === 0) return null;
  return <div className="pointer-events-none absolute inset-0 z-0 overflow-visible" aria-hidden>{instances.map(instance => {
    const style = { position: "absolute" as const, inset: 0, opacity: instance.opacity, transform: `translate(${instance.x}px, ${instance.y}px) scale(${instance.scale}) rotate(${instance.rotation}deg)`, transformOrigin: "center" };
    return <div key={instance.id} style={style}>{isLottie ? <LottieOverlay asset={entity.asset} playback={{ ...entity.playback, speed: entity.playback.speed * instance.speed, direction: instance.direction }} reactions={entity.reactions} className="h-full w-full" /> : <img src={entity.asset.url} alt="" draggable={false} className="h-full w-full object-contain" />}</div>;
  })}</div>;
}
