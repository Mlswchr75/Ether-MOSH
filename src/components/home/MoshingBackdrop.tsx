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

    renderer.setSourceCanvas(src);
    renderer.setRenderScale(0.5);

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

      for (let i = 0; i < 5; i++) {
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

    const loop = () => {
      try {
        const now = performance.now();
        const t = (now - start) / 1000;
        if (now - lastSwap > 9000) {
          stackIdx = (stackIdx + 1) % STACK_ROTATION.length;
          lastSwap = now;
        }

        paintSource(t);

        const layers: RenderLayer[] = STACK_ROTATION[stackIdx].map((l, i) => ({
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

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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
