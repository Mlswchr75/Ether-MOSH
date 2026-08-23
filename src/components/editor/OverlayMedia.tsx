import type { OverlayEntity } from "@/engine/overlay/types";
import { LottieOverlay } from "./LottieOverlay";
import { OverlayOwnFx } from "./OverlayOwnFx";

type Props = { entity: OverlayEntity };

export function OverlayMedia({ entity }: Props) {
  if (entity.compositing === "own-fx" && entity.ownFx.length > 0) {
    return <OverlayOwnFx entity={entity} className="pointer-events-none relative z-10 h-full w-full" />;
  }

  const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
  if (isLottie) {
    return <LottieOverlay asset={entity.asset} playback={entity.playback} className="pointer-events-none relative z-10 h-full w-full" />;
  }

  return (
    <img
      src={entity.asset.url}
      alt={entity.asset.name || "sticker"}
      draggable={false}
      className="pointer-events-none relative z-10 h-full w-full object-contain"
    />
  );
}
