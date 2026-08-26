import { useEffect, useRef } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { MoshRenderer, type RenderLayer } from "@/engine/Renderer";
import type { OverlayEntity } from "@/engine/overlay/types";

type Props = {
  entity: OverlayEntity;
  className?: string;
};

const TARGET_FPS = 20;
const FRAME_MS = 1000 / TARGET_FPS;

/**
 * Dedicated render bridge for an OverlayEntity's OWN FX route. It uses the
 * same MoshRenderer as the main visualizer but owns its own tiny source/output
 * canvases, so per-sticker effects cannot mutate the global layer stack.
 */
export function OverlayOwnFx({ entity, className }: Props) {
  const outputRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MoshRenderer | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lottieRef = useRef<DotLottie | null>(null);
  const layersRef = useRef(entity.ownFx);
  const lastFrameRef = useRef(0);

  useEffect(() => { layersRef.current = entity.ownFx; }, [entity.ownFx]);

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;

    const source = document.createElement("canvas");
    source.width = Math.max(1, Math.round(entity.asset.width ?? 256));
    source.height = Math.max(1, Math.round(entity.asset.height ?? 256));
    sourceRef.current = source;

    let renderer: MoshRenderer;
    try {
      renderer = new MoshRenderer(output);
      rendererRef.current = renderer;
      renderer.setSourceCanvas(source);
      renderer.setWarmupEffects(entity.ownFx.map(layer => layer.effectId));
    } catch (error) {
      console.warn("[overlay-own-fx] renderer unavailable", error);
      return;
    }

    const isLottie = entity.asset.kind === "lottie-json" || entity.asset.kind === "dotlottie";
    if (isLottie) {
      try {
        lottieRef.current = new DotLottie({
          canvas: source,
          src: entity.asset.url,
          autoplay: entity.playback.playing,
          loop: entity.playback.loop,
          speed: Math.max(0.01, Math.abs(entity.playback.speed)),
          mode: entity.playback.direction < 0 ? "reverse" : "forward",
          ...(entity.playback.segment ? { segment: entity.playback.segment } : {}),
        });
      } catch (error) {
        console.warn("[overlay-own-fx] lottie source unavailable", error);
      }
    } else {
      const image = new Image();
      image.decoding = "async";
      image.src = entity.asset.url;
      Object.assign(image.style, {
        position: "fixed", left: "-9999px", top: "0", width: "1px", height: "1px",
        opacity: "0", pointerEvents: "none",
      });
      document.body.appendChild(image);
      imageRef.current = image;
      image.onload = () => {
        const w = image.naturalWidth || source.width;
        const h = image.naturalHeight || source.height;
        if (source.width !== w || source.height !== h) {
          source.width = w;
          source.height = h;
          try { renderer.setSourceCanvas(source); } catch { /* noop */ }
        }
      };
    }

    const resize = () => {
      const rect = output.parentElement?.getBoundingClientRect();
      if (!rect) return;
      try { renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height)); } catch { /* noop */ }
    };
    const observer = new ResizeObserver(resize);
    if (output.parentElement) observer.observe(output.parentElement);
    resize();

    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = now;

      const image = imageRef.current;
      if (image?.complete) {
        const ctx = source.getContext("2d");
        if (ctx) {
          try {
            ctx.clearRect(0, 0, source.width, source.height);
            ctx.drawImage(image, 0, 0, source.width, source.height);
          } catch { /* frame may not be decoded yet */ }
        }
      }

      const renderLayers: RenderLayer[] = layersRef.current.map(layer => ({
        id: layer.id,
        effectId: layer.effectId,
        hidden: layer.hidden,
        opacity: layer.opacity,
        blend: layer.blend,
        params: layer.params,
        region: layer.region ?? null,
      }));
      try { renderer.render(renderLayers, now / 1000); } catch (error) {
        console.warn("[overlay-own-fx] render failed", error);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      try { lottieRef.current?.destroy(); } catch { /* noop */ }
      lottieRef.current = null;
      imageRef.current?.remove();
      imageRef.current = null;
      sourceRef.current = null;
      try { renderer.dispose(); } catch { /* noop */ }
      rendererRef.current = null;
    };
    // Asset identity changes require a new source; live FX settings stay in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.asset.id, entity.asset.url]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try { renderer.setWarmupEffects(entity.ownFx.map(layer => layer.effectId)); } catch { /* noop */ }
  }, [entity.ownFx]);

  useEffect(() => {
    const player = lottieRef.current;
    if (!player) return;
    try {
      player.setLoop(entity.playback.loop);
      player.setSpeed(Math.max(0.01, Math.abs(entity.playback.speed)));
      void player.setMode(entity.playback.direction < 0 ? "reverse" : "forward");
      if (entity.playback.segment) player.setSegment(entity.playback.segment[0], entity.playback.segment[1]);
      if (entity.playback.playing) player.play(); else player.pause();
    } catch { /* noop */ }
  }, [entity.playback]);

  return <canvas ref={outputRef} className={className ?? "pointer-events-none h-full w-full"} aria-label={`${entity.asset.name || "Sticker"} own effects`} />;
}
