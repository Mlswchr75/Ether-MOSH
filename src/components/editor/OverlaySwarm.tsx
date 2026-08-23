import { useMemo } from "react";
import type { OverlayEntity } from "@/engine/overlay/types";
import { generateSwarmInstances } from "@/engine/overlay/swarm";
import { LottieOverlay } from "./LottieOverlay";

type Props = { entity: OverlayEntity };

export function OverlaySwarm({ entity }: Props) {
  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  const instances = useMemo(() => generateSwarmInstances(entity.swarm, isLottie), [entity.swarm, isLottie]);
  if (!entity.swarm.enabled || instances.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 -z-[1] overflow-visible" aria-hidden>
      {instances.map(instance => {
        const style = {
          position: "absolute" as const,
          inset: 0,
          opacity: instance.opacity,
          transform: `translate(${instance.x}px, ${instance.y}px) scale(${instance.scale}) rotate(${instance.rotation}deg)`,
          transformOrigin: "center",
        };
        return (
          <div key={instance.id} style={style}>
            {isLottie ? (
              <LottieOverlay
                asset={entity.asset}
                playback={{
                  ...entity.playback,
                  speed: entity.playback.speed * instance.speed,
                  direction: instance.direction,
                }}
                className="h-full w-full"
              />
            ) : (
              <img src={entity.asset.url} alt="" draggable={false} className="h-full w-full object-contain" />
            )}
          </div>
        );
      })}
    </div>
  );
}
