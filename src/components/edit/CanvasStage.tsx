import { useEffect, useRef } from "react";
import { MoshRenderer } from "@/engine/Renderer";
import { resolveLayers, bpmPulse } from "@/engine/modulate";
import { audioEngine } from "@/engine/audio";
import { useStore } from "@/store/useStore";

/**
 * The render surface. Owns the MoshRenderer instance and the rAF loop;
 * everything else (layers, sources, audio) is read straight from the store
 * each frame so React re-renders never touch the hot path.
 */
export const CanvasStage = ({ onRenderer }: { onRenderer?: (r: MoshRenderer | null) => void }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLDivElement>(null);

  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const rendererRef = useRef<MoshRenderer | null>(null);

  // Renderer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current!;
    const host = hostRef.current!;
    let renderer: MoshRenderer;
    try {
      renderer = new MoshRenderer(canvas);
    } catch {
      return; // WebGL unavailable; stage stays black
    }
    rendererRef.current = renderer;
    onRenderer?.(renderer);

    const resize = () => renderer.resize(host.clientWidth, host.clientHeight);
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let frames = 0;
    let fpsWindowStart = performance.now();
    const loop = () => {
      const now = performance.now();
      const t = now / 1000;
      const s = useStore.getState();

      audioEngine.sensitivity = s.micSensitivity;
      audioEngine.update(now);

      const pulse = s.beatEnabled ? bpmPulse(t, s.bpm) : 0;
      const layers = resolveLayers(s.layers, t, audioEngine.levels, pulse);
      renderer.render(layers, Math.max(pulse, audioEngine.levels.beat));

      // FPS meter — write to the DOM directly, skip React
      frames++;
      if (now - fpsWindowStart >= 500) {
        if (fpsRef.current) {
          const fps = Math.round((frames * 1000) / (now - fpsWindowStart));
          fpsRef.current.textContent = `${fps} fps`;
          fpsRef.current.style.display = s.showFps ? "block" : "none";
        }
        frames = 0;
        fpsWindowStart = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      onRenderer?.(null);
      rendererRef.current = null;
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Source binding — image wins unless a live stream is set
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    if (videoElement) {
      renderer.setSourceVideo(videoElement);
      const onMeta = () => renderer.refreshSourceAspect();
      if (videoElement.readyState >= 1) onMeta();
      videoElement.addEventListener("loadedmetadata", onMeta);
      return () => videoElement.removeEventListener("loadedmetadata", onMeta);
    }
    if (imageElement) {
      renderer.setSourceImage(imageElement);
    }
  }, [imageElement, videoElement]);

  return (
    <div ref={hostRef} className="absolute inset-0 touch-none bg-background">
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div
        ref={fpsRef}
        className="pointer-events-none absolute left-3 top-20 z-30 hidden font-mono text-[10px] uppercase tracking-widest text-accent"
      />
    </div>
  );
};
