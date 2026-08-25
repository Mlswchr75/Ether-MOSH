import { createContext, useContext, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { createForgeRuntime, paintForgeSource } from "@/engine/forgeSource";
import { GENERATORS } from "@/engine/forgeGeneratorRegistry";
import type { ForgeState } from "@/store/types";
import "./journey-portal.css";

export const JOURNEY_PORTAL_SHAPES = ["breach", "rift", "crater", "slash", "fissure", "edge"] as const;
export type JourneyPortalShape = typeof JOURNEY_PORTAL_SHAPES[number];

export type JourneyPortalConfig = {
  seed?: number;
  palette?: number;
  intensity?: number;
  cadenceMs?: number;
};

type PortalSurface = { canvas: HTMLCanvasElement; crop: number; visible: boolean };
type JourneyPortalBus = { attach: (surface: PortalSurface) => () => void };

const PortalContext = createContext<JourneyPortalBus | null>(null);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeJourneyPortalShape(value: string | null | undefined): JourneyPortalShape {
  return JOURNEY_PORTAL_SHAPES.includes(value as JourneyPortalShape) ? value as JourneyPortalShape : "breach";
}

export function normalizeJourneyPortalConfig(config: JourneyPortalConfig = {}) {
  return {
    seed: Math.floor(config.seed ?? 0xE7A45A),
    palette: clamp(Math.floor(config.palette ?? 0), 0, 5),
    intensity: clamp(config.intensity ?? .82, 0, 1),
    cadenceMs: clamp(config.cadenceMs ?? 7_200, 4_800, 9_500),
  };
}

/**
 * One Forge/Journey source fans out to every portal on the page. This keeps a
 * page with six tears at one simulation and at most one WebGL context instead
 * of multiplying renderer cost for every decorative opening.
 */
export function JourneyPortalProvider({ children, config }: { children: ReactNode; config?: JourneyPortalConfig }) {
  const normalized = useMemo(() => normalizeJourneyPortalConfig(config), [config?.seed, config?.palette, config?.intensity, config?.cadenceMs]);
  const surfacesRef = useRef(new Set<PortalSurface>());
  const bus = useMemo<JourneyPortalBus>(() => ({
    attach(surface) {
      surfacesRef.current.add(surface);
      return () => surfacesRef.current.delete(surface);
    },
  }), []);

  useEffect(() => {
    const source = document.createElement("canvas");
    const cpuCount = navigator.hardwareConcurrency || 4;
    const sourceSize = cpuCount <= 4 ? 320 : 480;
    source.width = sourceSize;
    source.height = sourceSize;
    const ctx = source.getContext("2d", { alpha: false });
    if (!ctx) return;

    const runtime = createForgeRuntime();
    const generatorIds = GENERATORS.map(generator => generator.id);
    let generatorIndex = Math.abs(normalized.seed) % generatorIds.length;
    let lastJourneyMove = performance.now();
    const forge: ForgeState = {
      paletteIdx: normalized.palette,
      seed: normalized.seed,
      intensity: normalized.intensity,
      seamless: false,
      stack: [],
      baseImage: null,
      baseName: null,
      mosaicEnabled: false,
      mosaicDensity: .45,
      overlay: .55,
      activeGeneratorId: generatorIds[generatorIndex],
      kaleidoscopeFolds: null,
      transitionFromGeneratorId: null,
      transitionStartedAt: null,
    };

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetFps = reducedMotion ? 1 : cpuCount <= 4 ? 15 : 24;
    const frameMs = 1000 / targetFps;
    let lastFrame = -Infinity;
    let raf = 0;
    let running = true;

    const drawSurface = (surface: PortalSurface) => {
      if (!surface.visible) return;
      const rect = surface.canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = Math.min(devicePixelRatio || 1, cpuCount <= 4 ? 1 : 1.35);
      const width = Math.max(2, Math.round(rect.width * dpr));
      const height = Math.max(2, Math.round(rect.height * dpr));
      if (surface.canvas.width !== width || surface.canvas.height !== height) {
        surface.canvas.width = width;
        surface.canvas.height = height;
      }
      const target = surface.canvas.getContext("2d", { alpha: false });
      if (!target) return;
      const cropSize = sourceSize * (.68 + surface.crop * .2);
      const range = sourceSize - cropSize;
      const sx = range * (.12 + surface.crop * .66);
      const sy = range * (.72 - surface.crop * .54);
      target.clearRect(0, 0, width, height);
      target.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, width, height);
    };

    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - lastFrame < frameMs) return;
      if (![...surfacesRef.current].some(surface => surface.visible)) return;
      lastFrame = now;

      if (!reducedMotion && now - lastJourneyMove >= normalized.cadenceMs) {
        const previous = forge.activeGeneratorId;
        generatorIndex = (generatorIndex + 1) % generatorIds.length;
        forge.transitionFromGeneratorId = previous;
        forge.transitionStartedAt = performance.now();
        forge.activeGeneratorId = generatorIds[generatorIndex];
        forge.paletteIdx = (forge.paletteIdx + 1) % 6;
        forge.seed = (forge.seed * 1664525 + 1013904223) >>> 0;
        forge.kaleidoscopeFolds = generatorIndex % 3 === 0 ? 6 : null;
        lastJourneyMove = now;
      }

      const t = now / 1000;
      const pulse = .5 + .5 * Math.sin(t * 1.7);
      try {
        paintForgeSource(ctx, sourceSize, sourceSize, t, forge, {
          energy: .48 + pulse * .34,
          beat: Math.pow(Math.max(0, Math.sin(t * 3.2)), 8),
          treble: .35 + .3 * Math.sin(t * 2.1),
          brightness: .68,
          dynamics: .54,
          density: .62,
          bpm: 112,
        }, runtime);
        surfacesRef.current.forEach(drawSurface);
      } catch {
        // A decorative portal should never take its host page down. Forge's
        // renderer already falls back generator-by-generator; this is the
        // final containment boundary for unusual browser canvas failures.
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      runtime.volumetric?.dispose();
    };
  }, [normalized]);

  return <PortalContext.Provider value={bus}>{children}</PortalContext.Provider>;
}

export function JourneyPortal({
  shape = "breach",
  className = "",
  crop = .5,
  label = false,
  clipPath,
}: {
  shape?: JourneyPortalShape;
  className?: string;
  crop?: number;
  label?: boolean;
  clipPath?: string;
}) {
  const bus = useContext(PortalContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bus) return;
    const surface: PortalSurface = { canvas, crop: clamp(crop, 0, 1), visible: true };
    const detach = bus.attach(surface);
    const observer = new IntersectionObserver(([entry]) => { surface.visible = entry.isIntersecting; }, { rootMargin: "180px" });
    observer.observe(canvas);
    return () => { observer.disconnect(); detach(); };
  }, [bus, crop]);

  return (
    <div
      className={`journey-portal journey-portal--${shape} ${className}`}
      style={clipPath ? { ["--journey-portal-clip" as string]: clipPath } as CSSProperties : undefined}
      data-journey-portal
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
      <span className="journey-portal__noise" />
      {label && <span className="journey-portal__label"><i /> Forge Journey / live</span>}
    </div>
  );
}
