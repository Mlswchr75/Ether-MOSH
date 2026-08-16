import { useEffect, useRef } from "react";
import { MoshRenderer } from "@/engine/Renderer";
import type { RenderLayer } from "@/engine/Renderer";

/**
 * Ambient home-page visual: a procedural Canvas2D plasma feeds the real MOSH
 * engine with a slowly-rotating stack of effects, so the landing page IS the
 * instrument, not a looping video of it.
 */

const STACK_ROTATION: Array<{ effectId: string; params: Record<string, number>; opacity: number }[]> = [
  [
    { effectId: "rgbShift", params: { amount: 0.35, angle: 0.4 }, opacity: 0.9 },
    { effectId: "liquidWarp", params: { amount: 0.4, speed: 0.5, scale: 3.5 }, opacity: 0.85 },
  ],
  [
    { effectId: "pixelSort", params: { threshold: 0.5, amount: 0.6 }, opacity: 0.8 },
    { effectId: "vhsBleed", params: { amount: 0.55, speed: 0.6 }, opacity: 0.8 },
  ],
  [
    { effectId: "plasmaField", params: { amount: 0.55, speed: 0.7, scale: 5 }, opacity: 0.85 },
    { effectId: "scanBreak", params: { amount: 0.45, speed: 0.9 }, opacity: 0.8 },
  ],
];

function fillParams(effectId: string, given: Record<string, number>): Record<string, number> {
  return given; // resolver in Renderer falls back to defaults for missing keys
}

export const MoshingBackdrop = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (host.clientWidth === 0 || host.clientHeight === 0) {
      // Let container settle dimensions before mounting canvas
    }

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    host.appendChild(canvas);

    const src = document.createElement("canvas");
    src.width = 320;
    src.height = 200;
    const sctx = src.getContext("2d");

    if (!sctx) {
      if (canvas.parentNode) host.removeChild(canvas);
      return;
    }

    let renderer: MoshRenderer | null = null;
    try {
      renderer = new MoshRenderer(canvas);
    } catch {
      if (canvas.parentNode) host.removeChild(canvas);
      return;
    }

    // The backdrop only ever cycles through STACK_ROTATION's effects, not the
    // full ~100-effect catalog — warming up every effect's shader (a single
    // long main-thread task) to avoid a hitch that can never happen here was
    // costing far more than it saved.
    const warmupIds = Array.from(new Set(STACK_ROTATION.flatMap(stack => stack.map(l => l.effectId))));
    renderer.setWarmupEffects(warmupIds);

    renderer.setSourceCanvas(src);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cpuCount = navigator.hardwareConcurrency || 4;
    // This is a decorative background, not the instrument itself — it should
    // never be the reason the page feels slow to respond. Lower ceilings than
    // the editor's own renderer, and a runtime backoff below so a device that
    // turns out slower than hardwareConcurrency suggested still self-corrects
    // instead of contending with the main thread indefinitely.
    let targetFps = cpuCount <= 4 ? 15 : 24;
    let frameTime = 1000 / targetFps;
    const paintFps = 6;
    const paintFrameTime = 1000 / paintFps;
    let downscale = cpuCount <= 4 ? 0.22 : 0.4;
    let singleLayer = cpuCount <= 4;

    renderer.setRenderScale(downscale);

    let isVisible = !document.hidden;
    let isInViewport = true;
    let lastFrameTime = 0;
    let lastPaintTime = 0;

    // Adaptive backoff: measure actual render cost and step down further if
    // frames are running long. A frame budget is a guess about the device;
    // the device's own behavior is the ground truth.
    let slowFrameStreak = 0;
    let downgraded = false;
    const recordFrameCost = (ms: number) => {
      if (downgraded) return;
      if (ms > frameTime * 1.4) {
        slowFrameStreak++;
        if (slowFrameStreak >= 8) {
          downgraded = true;
          targetFps = Math.max(8, Math.round(targetFps * 0.6));
          frameTime = 1000 / targetFps;
          downscale = Math.max(0.14, downscale * 0.65);
          renderer?.setRenderScale(downscale);
          singleLayer = true;
        }
      } else {
        slowFrameStreak = 0;
      }
    };

    const resize = () => {
      if (renderer && host.clientWidth > 0 && host.clientHeight > 0) {
        try {
          renderer.resize(host.clientWidth, host.clientHeight);
        } catch (e) {
          console.warn("MOSH: WebGL resize failed softly", e);
        }
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const io = new IntersectionObserver(
      (entries) => {
        isInViewport = entries[0].isIntersecting;
      },
      { threshold: 0.01 }
    );
    io.observe(host);

    const handleVisibility = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    let raf = 0;
    let stackIdx = 0;
    let lastSwap = performance.now();
    const start = performance.now();

    const paintSource = (t: number) => {
      const g = sctx.createLinearGradient(0, 0, src.width, src.height);
      const h1 = (t * 8) % 360;
      const h2 = (h1 + 90 + 40 * Math.sin(t * 0.3)) % 360;
      g.addColorStop(0, `hsl(${h1} 80% 42%)`);
      g.addColorStop(1, `hsl(${h2} 85% 30%)`);
      sctx.fillStyle = g;
      sctx.fillRect(0, 0, src.width, src.height);

      for (let i = 0; i < 3; i++) {
        const x = (0.5 + 0.42 * Math.sin(t * (0.23 + i * 0.11) + i * 2.1)) * src.width;
        const y = (0.5 + 0.42 * Math.cos(t * (0.31 + i * 0.07) + i * 1.3)) * src.height;
        const r = 24 + 18 * Math.sin(t * 0.5 + i);
        const b = sctx.createRadialGradient(x, y, 0, x, y, Math.max(6, r));
        b.addColorStop(0, `hsl(${(h1 + i * 60) % 360} 95% 65% / 0.9)`);
        b.addColorStop(1, "transparent");
        sctx.fillStyle = b;
        sctx.beginPath();
        sctx.arc(x, y, Math.max(6, r), 0, Math.PI * 2);
        sctx.fill();
      }
    };

    const loop = (now: number) => {
      if (!isVisible || !isInViewport) {
        raf = requestAnimationFrame(loop);
        return;
      }

      if (prefersReducedMotion) {
        if (lastFrameTime === 0) {
          const t = (now - start) / 1000;
          try {
            const elapsed = now - lastPaintTime;
            if (elapsed >= paintFrameTime) {
              paintSource(t);
              lastPaintTime = now;
            }

            const stack = singleLayer ? STACK_ROTATION[stackIdx].slice(0, 1) : STACK_ROTATION[stackIdx];
            const layers: RenderLayer[] = stack.map((l, i) => ({
              id: `bg${i}`,
              effectId: l.effectId,
              hidden: false,
              opacity: l.opacity,
              blend: i === 0 ? "normal" : "screen",
              params: fillParams(l.effectId, l.params),
            }));

            if (renderer && src.width > 0 && src.height > 0) {
              renderer.render(layers, 0.3);
            }
          } catch (err) {
            console.error("MOSH WebGL backdrop caught render error safely:", err);
          }
          lastFrameTime = now;
        }
        raf = requestAnimationFrame(loop);
        return;
      }

      const elapsed = now - lastFrameTime;
      if (elapsed < frameTime) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const frameStart = performance.now();
      try {
        const t = (now - start) / 1000;
        if (now - lastSwap > 9000) {
          stackIdx = (stackIdx + 1) % STACK_ROTATION.length;
          lastSwap = now;
        }

        const paintElapsed = now - lastPaintTime;
        if (paintElapsed >= paintFrameTime) {
          paintSource(t);
          lastPaintTime = now;
        }

        const stack = singleLayer ? STACK_ROTATION[stackIdx].slice(0, 1) : STACK_ROTATION[stackIdx];
        const layers: RenderLayer[] = stack.map((l, i) => ({
          id: `bg${i}`,
          effectId: l.effectId,
          hidden: false,
          opacity: l.opacity,
          blend: i === 0 ? "normal" : "screen",
          params: fillParams(l.effectId, l.params),
        }));

        if (renderer && src.width > 0 && src.height > 0) {
          renderer.render(layers, 0.3 + 0.3 * Math.sin(t * 2));
        }
      } catch (err) {
        console.error("MOSH WebGL backdrop caught render error safely:", err);
      }
      recordFrameCost(performance.now() - frameStart);

      lastFrameTime = now;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      try {
        renderer?.dispose();
      } catch {
        // Ignore disposal context errors
      }
      if (canvas.parentNode) {
        canvas.remove();
      }
    };
  }, []);

  // Backdrop only. The hero copy and its controls belong to the page, which is
  // the single owner of everything the visitor reads or clicks — duplicating
  // them here is what put two "DROP AN IMAGE" headlines and two upload icons on
  // top of each other.
  return (
    <div
      ref={hostRef}
      className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(266_40%_12%),hsl(266_24%_5%))]"
    />
  );
};
