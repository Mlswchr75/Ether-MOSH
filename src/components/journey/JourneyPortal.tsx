import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createForgeRuntime, disposeForgeRuntime, paintForgeSource } from "@/engine/forgeSource";
import { GENERATORS } from "@/engine/forgeGeneratorRegistry";
import type { ForgeState } from "@/store/types";
import { createOrganicClipPaths } from "./organicClip";
import { JOURNEY_PORTAL_CLIPS } from "./portalShapes";
import "./journey-portal.css";

export const JOURNEY_PORTAL_SHAPES = ["breach", "rift", "crater", "slash", "fissure", "edge"] as const;
export type JourneyPortalShape = typeof JOURNEY_PORTAL_SHAPES[number];

export type JourneyPortalConfig = {
  seed?: number;
  palette?: number;
  intensity?: number;
  cadenceMs?: number;
};

export type JourneyPortalFxDepth = 0 | 1 | 2;
type PortalSurface = { canvas: HTMLCanvasElement; crop: number; visible: boolean; fxDepth: JourneyPortalFxDepth; phase: number };
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
      transitionFromSeed: null,
      transitionFromPaletteIdx: null,
    };

    // Long-lived embeds (stream overlays, gallery installations) can outlast
    // the OS-level reduced-motion setting a user had when the page loaded —
    // read it live via a change listener rather than freezing it at mount.
    const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionQuery.matches;
    let targetFps = reducedMotion ? 1 : cpuCount <= 4 ? 15 : 24;
    let frameMs = 1000 / targetFps;
    const applyMotionPreference = () => {
      reducedMotion = motionQuery.matches;
      targetFps = reducedMotion ? 1 : cpuCount <= 4 ? 15 : 24;
      frameMs = 1000 / targetFps;
    };
    motionQuery.addEventListener("change", applyMotionPreference);
    let lastFrame = -Infinity;
    let raf = 0;
    let running = true;

    const drawSurface = (surface: PortalSurface, now: number) => {
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

      if (surface.fxDepth > 0 && !reducedMotion) {
        const phase = now / 1000 + surface.phase;
        const driftX = Math.sin(phase * 1.37) * width * .012;
        const driftY = Math.cos(phase * .91) * height * .008;
        target.save();
        target.globalCompositeOperation = "screen";
        target.globalAlpha = .1 + (.5 + .5 * Math.sin(phase * 2.1)) * .08;
        target.filter = `hue-rotate(${Math.round(105 + Math.sin(phase) * 35)}deg) saturate(2.1) contrast(1.15)`;
        target.drawImage(source, sx, sy, cropSize, cropSize, driftX, -driftY, width, height);
        target.globalAlpha = .08;
        target.filter = "hue-rotate(245deg) saturate(2.4)";
        target.drawImage(source, sx, sy, cropSize, cropSize, -driftX, driftY, width, height);
        target.restore();

        target.save();
        for (let slice = 0; slice < 4; slice += 1) {
          const stripY = ((slice * .247 + phase * .033) % 1) * height;
          const stripHeight = Math.max(2, height * (.018 + (slice % 2) * .012));
          target.beginPath();
          target.rect(0, stripY, width, stripHeight);
          target.clip();
          const shift = Math.sin(phase * 2.7 + slice * 1.9) * width * .055;
          target.globalAlpha = .78;
          target.drawImage(source, sx, sy, cropSize, cropSize, shift, 0, width, height);
          target.restore();
          target.save();
        }
        target.restore();
      }

      if (surface.fxDepth > 1 && !reducedMotion) {
        const phase = now / 1000 + surface.phase;
        target.save();
        target.translate(width / 2, height / 2);
        target.rotate(Math.sin(phase * .43) * .018);
        target.scale(1.045 + Math.sin(phase * .7) * .018, 1.045 + Math.cos(phase * .61) * .018);
        target.globalCompositeOperation = "screen";
        target.globalAlpha = .16;
        target.filter = `blur(${Math.max(1, width * .006)}px) saturate(1.8)`;
        target.drawImage(source, sx, sy, cropSize, cropSize, -width / 2, -height / 2, width, height);
        target.restore();
      }
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
        // Freeze what the outgoing generator was actually drawn with —
        // forge.seed/paletteIdx are overwritten to the incoming generator's
        // values immediately below.
        forge.transitionFromSeed = forge.seed;
        forge.transitionFromPaletteIdx = forge.paletteIdx;
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
        surfacesRef.current.forEach(surface => drawSurface(surface, now));
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
      motionQuery.removeEventListener("change", applyMotionPreference);
      disposeForgeRuntime(runtime);
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
  fxDepth = 0,
}: {
  shape?: JourneyPortalShape;
  className?: string;
  crop?: number;
  label?: boolean;
  clipPath?: string;
  fxDepth?: JourneyPortalFxDepth;
}) {
  const bus = useContext(PortalContext);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clipId = `journey-organic-${useId().replace(/:/g, "")}`;
  const baseClip = clipPath ?? JOURNEY_PORTAL_CLIPS[shape];
  const organicSeed = useMemo(() => [...baseClip].reduce((seed, char) => (seed * 33 + char.charCodeAt(0)) >>> 0, 5381), [baseClip]);
  const organicPaths = useMemo(() => createOrganicClipPaths(baseClip, organicSeed), [baseClip, organicSeed]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bus) return;
    const surface: PortalSurface = { canvas, crop: clamp(crop, 0, 1), visible: true, fxDepth, phase: (organicSeed % 97) / 13 };
    const detach = bus.attach(surface);
    const observer = new IntersectionObserver(([entry]) => { if (entry) surface.visible = entry.isIntersecting; }, { rootMargin: "180px" });
    observer.observe(canvas);
    return () => { observer.disconnect(); detach(); };
  }, [bus, crop, fxDepth, organicSeed]);

  const duration = 11 + organicSeed % 8;
  const style = {
    ["--journey-portal-clip" as string]: baseClip,
    ["--journey-portal-svg-clip" as string]: `url(#${clipId})`,
    ["--journey-portal-drift" as string]: `${duration * .72}s`,
  } as CSSProperties;

  return (
    <div
      className={`journey-portal journey-portal--${shape} journey-portal--fx-${fxDepth} ${className}`}
      style={style}
      data-journey-portal
      aria-hidden="true"
    >
      {organicPaths.length > 0 && <svg className="journey-portal__clip-defs" width="0" height="0" aria-hidden="true">
        <defs><clipPath id={clipId} clipPathUnits="objectBoundingBox"><path d={organicPaths[0]}>
          {!reducedMotion && <animate attributeName="d" values={organicPaths.join(";")} dur={`${duration}s`} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.34;0.68;1" keySplines=".42 0 .58 1;.42 0 .58 1;.42 0 .58 1" />}
        </path></clipPath></defs>
      </svg>}
      <canvas ref={canvasRef} />
      <span className="journey-portal__noise" />
      {label && <span className="journey-portal__label"><i /> Forge Journey / live</span>}
    </div>
  );
}
