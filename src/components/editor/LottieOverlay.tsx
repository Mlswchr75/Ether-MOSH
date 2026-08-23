import { useEffect, useRef } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import type { OverlayAsset, OverlayPlayback } from "@/engine/overlay/types";

type Props = {
  asset: OverlayAsset;
  playback: OverlayPlayback;
  className?: string;
};

/**
 * Thin imperative bridge around dotLottie. Playback stays inside the player
 * instance so animation frames never churn the global overlay Zustand store.
 */
export function LottieOverlay({ asset, playback, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DotLottie | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !asset.url) return;

    const player = new DotLottie({
      canvas,
      src: asset.url,
      autoplay: playback.playing,
      loop: playback.loop,
      speed: Math.max(0.01, Math.abs(playback.speed)),
      mode: playback.direction < 0 ? "reverse" : "forward",
      ...(playback.segment ? { segment: playback.segment } : {}),
    });
    playerRef.current = player;

    return () => {
      if (playerRef.current === player) playerRef.current = null;
      try { player.destroy(); } catch { /* player may already be torn down after load error */ }
    };
    // Reload only when the underlying animation changes. Playback properties
    // are synchronized by the focused effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, asset.url]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try { player.setLoop(playback.loop); } catch { /* noop */ }
  }, [playback.loop]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    try { player.setSpeed(Math.max(0.01, Math.abs(playback.speed))); } catch { /* noop */ }
  }, [playback.speed]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    void player.setMode(playback.direction < 0 ? "reverse" : "forward");
  }, [playback.direction]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playback.segment) return;
    try { player.setSegment(playback.segment[0], playback.segment[1]); } catch { /* noop */ }
  }, [playback.segment]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (playback.playing) player.play();
    else player.pause();
  }, [playback.playing]);

  // Avoid spending battery/GPU on an animation hidden behind another app or
  // browser tab; restoring visibility follows the entity's intended state.
  useEffect(() => {
    const onVisibility = () => {
      const player = playerRef.current;
      if (!player) return;
      if (document.hidden) player.pause();
      else if (playback.playing) player.play();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [playback.playing]);

  return <canvas ref={canvasRef} className={className ?? "h-full w-full"} aria-label={asset.name || "Lottie sticker"} />;
}
