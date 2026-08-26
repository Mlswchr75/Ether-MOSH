import { useEffect, useRef } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import type { OverlayAsset, OverlayPlayback, OverlayReaction } from "@/engine/overlay/types";
import { getOverlayAudioData } from "@/engine/overlay/audioBridge";
import { mapOverlayReactions, smoothReactionValue, sourceValue } from "@/engine/overlay/reactions";
import { normalizedToFrame, resolveLottieReaction } from "@/engine/overlay/lottieControl";

type Props = { asset: OverlayAsset; playback: OverlayPlayback; reactions?: OverlayReaction[]; className?: string };

/** Imperative dotLottie bridge. High-frequency audio/playhead state stays local
 * to the player so React/Zustand do not rerender on every animation frame. */
export function LottieOverlay({ asset, playback, reactions = [], className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<DotLottie | null>(null);
  const smoothRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !asset.url) return;
    const player = new DotLottie({ canvas, src: asset.url, autoplay: playback.playing, loop: playback.loop, speed: Math.max(0.01, Math.abs(playback.speed)), mode: playback.direction < 0 ? "reverse" : "forward" });
    playerRef.current = player;
    return () => { if (playerRef.current === player) playerRef.current = null; try { player.destroy(); } catch { /* already torn down */ } };
  }, [asset.id, asset.url]);

  useEffect(() => { const p = playerRef.current; if (p) try { p.setLoop(playback.loop); } catch {} }, [playback.loop]);
  useEffect(() => { const p = playerRef.current; if (p) void p.setMode(playback.direction < 0 ? "reverse" : "forward"); }, [playback.direction]);
  useEffect(() => { const p = playerRef.current; if (!p) return; if (playback.playing) p.play(); else p.pause(); }, [playback.playing]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || playback.position == null) return;
    try { p.setFrame(normalizedToFrame(playback.position, p.totalFrames, playback.segment)); } catch {}
  }, [playback.position, playback.segment]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !playback.segment) return;
    try {
      const start = normalizedToFrame(0, p.totalFrames, playback.segment);
      const end = normalizedToFrame(1, p.totalFrames, playback.segment);
      p.setSegment(start, end);
    } catch {}
  }, [playback.segment]);

  useEffect(() => {
    let raf = 0;
    const hasPlaybackReaction = reactions.some(r => r.target === "playback-speed" || r.target === "playback-position");
    const tick = () => {
      const p = playerRef.current;
      if (p) {
        const audio = getOverlayAudioData();
        for (const r of reactions) {
          if (r.target !== "playback-speed" && r.target !== "playback-position") continue;
          const next = sourceValue(r, audio);
          smoothRef.current[r.id] = smoothReactionValue(smoothRef.current[r.id] ?? next, next, r.smoothing);
        }
        const delta = mapOverlayReactions(reactions, audio, smoothRef.current);
        const resolved = resolveLottieReaction(playback.speed, delta);
        try { p.setSpeed(resolved.speed); } catch {}
        if (resolved.position != null) try { p.setFrame(normalizedToFrame(resolved.position, p.totalFrames, playback.segment)); } catch {}
      }
      if (hasPlaybackReaction) raf = requestAnimationFrame(tick);
    };
    if (hasPlaybackReaction) raf = requestAnimationFrame(tick);
    else { const p = playerRef.current; if (p) try { p.setSpeed(Math.max(0.01, Math.abs(playback.speed))); } catch {} }
    return () => cancelAnimationFrame(raf);
  }, [playback.speed, playback.segment, reactions]);

  useEffect(() => {
    const onVisibility = () => { const p = playerRef.current; if (!p) return; if (document.hidden) p.pause(); else if (playback.playing) p.play(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [playback.playing]);

  return <canvas ref={canvasRef} className={className ?? "h-full w-full"} aria-label={asset.name || "Lottie sticker"} />;
}
