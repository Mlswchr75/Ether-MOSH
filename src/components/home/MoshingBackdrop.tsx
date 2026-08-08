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

interface MoshingBackdropProps {
  onFileUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartCamera?: () => void;
}

export const MoshingBackdrop = ({ onFileUpload, onStartCamera }: MoshingBackdropProps) => {
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

  const handleCameraClick = () => {
    if (onStartCamera) {
      onStartCamera();
    } else {
      window.location.href = "/editor?source=camera";
    }
  };

  return (
    <div ref={hostRef} className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(266_40%_12%),hsl(266_24%_5%))] flex items-center justify-center">
      
      {/* INTERACTIVE HERO OVERLAY */}
      <div className="relative z-10 flex flex-col items-center justify-center pointer-events-auto">

        {/* TOP TEXT: Starts above the Camera Icon (shifted right) */}
        <div className="text-xs font-mono tracking-widest text-[#ff2a8d] translate-x-14 mb-3 uppercase drop-shadow-[0_0_8px_rgba(255,42,141,0.6)]">
          GO LIVE WITH CAMERA →
        </div>

        {/* CENTER BUTTONS: Upload Box & Camera Box Side-by-Side */}
        <div className="flex items-center justify-center gap-6 my-2">
          
          {/* Left Icon: Upload Arrow Box */}
          <label 
            htmlFor="backdrop-file-upload" 
            className="w-20 h-20 border-2 border-[#ff2a8d] bg-black/60 rounded-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,42,141,0.4)] hover:shadow-[0_0_25px_rgba(255,42,141,0.8)]"
            title="Upload Image"
          >
            <svg className="w-9 h-9 stroke-[#ff2a8d]" fill="none" viewBox="0 0 24 24" strokeWidth="2">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
            <input 
              id="backdrop-file-upload" 
              type="file" 
              accept="image/*" 
              onChange={onFileUpload} 
              className="hidden" 
            />
          </label>

          {/* Right Icon: Camera Icon Box (Initiates Live Camera Feed) */}
          <button 
            type="button"
            onClick={handleCameraClick}
            className="w-20 h-20 border-2 border-[#ff2a8d] bg-black/60 rounded-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,42,141,0.4)] hover:shadow-[0_0_25px_rgba(255,42,141,0.8)]"
            title="Start Live Camera Feed"
          >
            <svg className="w-9 h-9 stroke-[#ff2a8d]" fill="none" viewBox="0 0 24 24" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>

        </div>

        {/* BOTTOM TEXT: Shifted left ~2 tab spaces (-translate-x-16) */}
        <h1 className="text-4xl md:text-6xl font-black text-white -translate-x-16 mt-4 tracking-tighter drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
          DROP AN IMAGE
        </h1>

      </div>

    </div>
  );
};
