import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Download, ArrowLeft, Shuffle, Upload } from "lucide-react";
import { MoshRenderer } from "@/engine/Renderer";
import type { RenderLayer } from "@/engine/Renderer";
import { rngFromSeed } from "@/engine/seed";
import { drawSeamless } from "@/engine/seamlessSource";
import { composeForgeStack, type ForgeLayer } from "@/engine/forgeCompose";
import { seamScore } from "@/engine/tileSafety";
import { healToSeamless, renderSizeFor, DEFAULT_HEAL_BAND as DEFAULT_BAND } from "@/engine/seamlessHeal";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { toast } from "sonner";
import { MicAnalyzer } from "@/engine/mic";
import { applyAudio, bandsFrom, stepBeat } from "@/engine/audioMapping";
import { captureLoopingGif } from "@/engine/gifCapture";
import { CanvasRecorder } from "@/engine/recorder";
import { downloadBlob } from "@/engine/export";
import { ForgeTriggers } from "@/components/forge/ForgeTriggers";
import { ForgeJourney, type JourneyMove, type JourneyState, type Section } from "@/engine/forgeJourney";
import { useIdleFade } from "@/hooks/useIdleFade";

const EASE = [0.22, 1, 0.36, 1] as const;

const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: "acid",    colors: ["#FF1F8F", "#00FFB2", "#1A0033"] },
  { name: "chrome",  colors: ["#C0C0C0", "#4488FF", "#0A0A14"] },
  { name: "plasma",  colors: ["#FF4500", "#FF00CC", "#050510"] },
  { name: "drift",   colors: ["#00BFFF", "#7700FF", "#000A1A"] },
  { name: "void",    colors: ["#8800FF", "#00FF88", "#040008"] },
  { name: "heat",    colors: ["#FF6B00", "#FF0033", "#100400"] },
];

/**
 * Print sizes. 2048 covers most garment panels at 150 DPI; 4096 is there for
 * large-format and for anything that will be scaled up by a fulfiller.
 */
const EXPORT_SIZES = [1024, 2048, 4096] as const;

export default function PatternForge() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MoshRenderer | null>(null);

  const [paletteIdx, setPaletteIdx] = useState(0);
  const [seamless, setSeamless] = useState(true);
  const [intensity, setIntensity] = useState(0.6);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 0xFFFFFF));
  const [currentStack, setCurrentStack] = useState<ForgeLayer[]>(
    () => composeForgeStack({ rand: Math.random, seamless: true, intensity: 0.6 }),
  );
  const [exporting, setExporting] = useState(false);
  const [seam, setSeam] = useState<number | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [baseName, setBaseName] = useState<string | null>(null);
  /** How much of the generated field sits over an uploaded base, 0..1. */
  const [overlay, setOverlay] = useState(0.55);
  const fileRef = useRef<HTMLInputElement>(null);

  const micRef = useRef(new MicAnalyzer());
  /** Per-param smoothing, held across frames so values glide instead of jumping. */
  const audioSmoothRef = useRef<Map<string, number>>(new Map());
  const beatRef = useRef({ envelope: 0, average: 0 });
  const lastMsRef = useRef(performance.now());
  /** Latest bands, read by the source painter so the imagery itself reacts. */
  const bandsRef = useRef({ bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 });
  const [micOn, setMicOn] = useState(false);

  /* Auto-shuffle and the journey director, which are mutually exclusive: one
     switches on a clock, the other decides for itself, and running both means
     neither is in charge. */
  const [shuffleSec, setShuffleSec] = useState<number | null>(null);
  const [journeyOn, setJourneyOn] = useState(false);
  const [journeyState, setJourneyState] = useState<JourneyState | null>(null);
  const journeyRef = useRef<ForgeJourney | null>(null);
  const journeySectionRef = useRef<Section>("intro");

  const [gifBusy, setGifBusy] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const palette = PALETTES[paletteIdx];

  /* The render loop reads these through refs rather than closing over the
     state.

     They used to be effect dependencies, which meant every shuffle disposed the
     MoshRenderer and built a new one — a full GL context teardown, visible as a
     black flash. Tolerable when shuffling was a manual button press; not
     tolerable at all once a timer or the journey director is firing it every
     few seconds. The renderer now lives as long as the page does. */
  const stackRef = useRef<ForgeLayer[]>(currentStack);
  useEffect(() => { stackRef.current = currentStack; }, [currentStack]);

  /**
   * Paint the source frame. Shared by the preview and the exporter on purpose:
   * two copies of this drifted apart is exactly how an export stops matching
   * what the user was looking at when they pressed save.
   *
   * With a base image loaded, the generated field composites OVER it at
   * `overlay` — so the photo's structure survives and the pattern reads as
   * something done to it, rather than replacing it. At overlay 0 the effect
   * stack works the image directly; at 1 the image is gone.
   */
  const drawSourceFrame = useCallback((
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: number,
  ) => {
    if (baseImage) {
      // Cover-fit so an off-aspect upload fills the square without letterboxing.
      const iw = baseImage.naturalWidth || baseImage.width;
      const ih = baseImage.naturalHeight || baseImage.height;
      const scale = Math.max(w / iw, h / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(baseImage, (w - dw) / 2, (h - dh) / 2, dw, dh);
      if (overlay > 0.01) {
        const layer = document.createElement("canvas");
        layer.width = w; layer.height = h;
        drawSeamless(layer.getContext("2d")!, w, h, {
          colors: palette.colors,
          seed: seed.toString(36),
          t,
          complexity: 2 + Math.round(intensity * 4),
        });
        ctx.save();
        ctx.globalAlpha = overlay;
        // Overlay rather than source-over: it keeps the base image's luminance
        // structure and tints through it, which is what makes the result read
        // as the photo reworked instead of the photo hidden.
        ctx.globalCompositeOperation = "overlay";
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
      return;
    }
    /* Audio shapes the imagery, not only the effects on top of it.
       Forge generates its own source, so treble adding field complexity and a
       kick shoving the phase forward means the pattern is genuinely being
       composed by the music rather than merely filtered by it. Bounded so a
       loud room cannot push complexity past what the generator handles. */
    const b = bandsRef.current;
    const reactiveComplexity = Math.min(6, 2 + Math.round(intensity * 4 + b.treble * 2));
    const beatKick = b.beat * 1.4;

    drawSeamless(ctx, w, h, {
      colors: palette.colors,
      seed: seed.toString(36),
      t: t + beatKick,
      complexity: reactiveComplexity,
    });
  }, [baseImage, overlay, palette, seed, intensity]);

  const drawRef = useRef(drawSourceFrame);
  useEffect(() => { drawRef.current = drawSourceFrame; }, [drawSourceFrame]);

  const toggleMic = useCallback(async () => {
    const mic = micRef.current;
    if (mic.enabled) { mic.stop(); setMicOn(false); return; }
    try {
      await mic.start("mic");
      setMicOn(true);
      toast.success("Audio reactive", { description: "Pattern now responds to sound" });
    } catch {
      toast.error("Mic unavailable — allow access and try again");
    }
  }, []);
  // Release the mic when leaving the page; a hot mic after navigation is both a
  // battery cost and a privacy surprise.
  useEffect(() => () => micRef.current.stop(), []);

  const captureGif = useCallback(async (seconds: number) => {
    const canvas = exportCanvasRef.current;
    if (!canvas || gifBusy) return;
    setGifBusy(true);
    setGifProgress(0);
    const t = toast.loading(`Capturing ${seconds}s loop…`, { duration: 30_000 });
    try {
      const res = await captureLoopingGif(canvas, {
        durationMs: seconds * 1000,
        fps: 12,
        maxWidth: 480,
        onProgress: (phase, p) => setGifProgress(phase === "capture" ? p * 0.7 : 0.7 + p * 0.3),
      });
      downloadBlob(res.blob, `mosh-forge-${seed.toString(16)}-${seconds}s_loop.gif`);
      const quality = res.loopScore > 0.85 ? "tight loop" : res.loopScore > 0.6 ? "clean loop" : "loop";
      toast.success(`${seconds}s GIF saved · ${res.frameCount}f · ${quality}`, { id: t });
    } catch {
      toast.error("GIF capture failed", { id: t });
    } finally {
      setGifBusy(false);
      setGifProgress(0);
    }
  }, [gifBusy, seed]);

  const toggleRecord = useCallback(async () => {
    const canvas = exportCanvasRef.current;
    if (!canvas) return;
    if (recorderRef.current) {
      try {
        const blob = await recorderRef.current.stop();
        downloadBlob(blob, `mosh-forge-${seed.toString(16)}.${recorderRef.current.extension()}`);
        toast.success("Recording saved");
      } catch {
        toast.error("Recording failed");
      } finally {
        recorderRef.current = null;
        setIsRecording(false);
      }
      return;
    }
    if (!CanvasRecorder.isSupported()) {
      toast.error("This browser can't record video");
      return;
    }
    try {
      const rec = new CanvasRecorder();
      rec.start(canvas, 30);
      recorderRef.current = rec;
      setIsRecording(true);
      toast.message("Recording…", { description: "Tap again to stop and save" });
    } catch {
      toast.error("Couldn't start recording");
    }
  }, [seed]);

  const toggleFullscreen = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const active = document.fullscreenElement || (document as any).webkitFullscreenElement;
    if (active) {
      (document.exitFullscreen?.() ?? Promise.resolve()).catch(() => {});
    } else {
      (host.requestFullscreen?.() ?? Promise.resolve()).catch(() => {
        toast.error("Fullscreen unavailable");
      });
    }
  }, []);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync as any);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as any);
    };
  }, []);

  const loadBase = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setBaseImage(img);
      setBaseName(file.name);
      setSeam(null);
      toast.success("Base image loaded", { description: "Pattern now builds on top of it" });
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast.error("Couldn't read that image"); };
    img.src = url;
  }, []);

  const randomise = useCallback(() => {
    setSeed(Math.floor(Math.random() * 0xFFFFFF));
    setCurrentStack(composeForgeStack({ rand: Math.random, seamless, intensity }));
    setPaletteIdx(Math.floor(Math.random() * PALETTES.length));
    setSeam(null);
  }, [seamless, intensity]);

  // Re-roll when the pool changes: a stack built without the tile constraint
  // will contain effects that cannot survive it.
  useEffect(() => {
    setCurrentStack(composeForgeStack({ rand: Math.random, seamless, intensity }));
    setSeam(null);
  }, [seamless]);

  /* Auto-shuffle. Held in a ref so changing the interval doesn't restart the
     countdown from a stale closure over `randomise`. */
  const randomiseRef = useRef(randomise);
  useEffect(() => { randomiseRef.current = randomise; }, [randomise]);

  useEffect(() => {
    if (shuffleSec == null) return;
    const id = window.setInterval(() => randomiseRef.current(), shuffleSec * 1000);
    return () => window.clearInterval(id);
  }, [shuffleSec]);

  /* ── Journey mode ────────────────────────────────────────────────────
     The director owns what plays and when. Everything it decides — how strong,
     which families of effect, how long to hold — comes back through `onMove`;
     this page's only job is to apply it and to keep the tiling constraint,
     which the director has no business overriding. */
  const applyMove = useCallback((move: JourneyMove, st: JourneyState) => {
    setCurrentStack(composeForgeStack({
      rand: Math.random,
      seamless,
      intensity: move.intensity,
      categoryBias: move.bias,
    }));
    setSeam(null);

    /* A section change is a bigger event than a switch inside one, so it also
       moves the ground: a new seed rebuilds the underlying field and the
       palette turns over. Doing this on every move would mean nothing ever
       held long enough to be recognised. */
    if (st.section !== journeySectionRef.current) {
      journeySectionRef.current = st.section;
      setSeed(Math.floor(Math.random() * 0xFFFFFF));
      setPaletteIdx(i => (i + 1 + Math.floor(Math.random() * (PALETTES.length - 1))) % PALETTES.length);
    }
  }, [seamless]);

  const applyMoveRef = useRef(applyMove);
  useEffect(() => { applyMoveRef.current = applyMove; }, [applyMove]);

  useEffect(() => {
    if (!journeyOn) { setJourneyState(null); return; }

    const journey = new ForgeJourney({
      getCanvas: () => exportCanvasRef.current,
      // Only hand over a live mic. Passing a stopped one would have the
      // director reading zeroes and confidently reporting silence.
      getMic: () => (micRef.current.enabled ? micRef.current : null),
      onMove: (move, st) => applyMoveRef.current(move, st),
      onState: setJourneyState,
    });
    journeyRef.current = journey;
    journey.start();
    return () => {
      journey.stop();
      journeyRef.current = null;
    };
  }, [journeyOn]);

  const toggleJourney = useCallback(async () => {
    if (journeyOn) { setJourneyOn(false); return; }
    setShuffleSec(null);

    /* The mode is about following the music, so switching it on is the moment
       to ask for the mic — this handler runs inside the user gesture, which is
       the only place the browser will grant it. It still runs without: with no
       audio it reads the frame alone and paces itself slowly, which is a
       reasonable ambient mode rather than a failure. */
    if (!micRef.current.enabled) {
      try {
        await micRef.current.start("mic");
        setMicOn(true);
      } catch {
        toast.message("Journey started without audio", {
          description: "Allow the mic to have it follow the music",
        });
      }
    }
    setJourneyOn(true);
  }, [journeyOn]);

  // Picking an interval by hand is a statement that you want the clock, not the
  // director — so it stands down rather than fighting over the stack.
  const chooseShuffle = useCallback((sec: number | null) => {
    setShuffleSec(sec);
    if (sec != null) setJourneyOn(false);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(canvas);
    exportCanvasRef.current = canvas;

    const src = document.createElement("canvas");
    src.width = 256; src.height = 256;
    const sctx = src.getContext("2d")!;

    let renderer: MoshRenderer | null = null;
    try {
      renderer = new MoshRenderer(canvas);
      rendererRef.current = renderer;
    } catch {
      host.removeChild(canvas);
      return;
    }

    renderer.setSourceCanvas(src);
    // Wrapped sampling is what lets ordinary displacement effects continue
    // across the join instead of smearing the edge pixel.
    renderer.setTileableSampling(seamless);

    const resize = () => {
      renderer!.resize(host.clientWidth, host.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const start = performance.now();

    const loop = () => {
      const nowMs = performance.now();
      const t = (nowMs - start) / 1000;

      // Guard against zero-dimension canvas initialization frames
      if (host.clientWidth === 0 || host.clientHeight === 0) {
        raf = requestAnimationFrame(loop);
        return;
      }

      drawRef.current(sctx, src.width, src.height, t);

      const layers: RenderLayer[] = stackRef.current.map((l, i) => ({
        id: `forge${i}`,
        effectId: l.effectId,
        hidden: false,
        opacity: l.opacity,
        blend: l.blend,
        params: l.params,
      }));

      /* Audio drives the stack the same way it drives the visualiser.
         Passing a scalar pulse alone was the bug: only the handful of effects
         that read uPulse in main() responded, so with the mic on most stacks
         looked identical to mic off. Every parameter now listens to a band. */
      const mic = micRef.current;
      const dt = Math.max(0.001, Math.min(0.1, (nowMs - lastMsRef.current) / 1000));
      lastMsRef.current = nowMs;

      let pulse: number;
      if (mic.enabled) {
        beatRef.current = stepBeat(mic.level(), beatRef.current, dt);
        const bands = bandsFrom(mic, beatRef.current.envelope);
        bandsRef.current = bands;
        pulse = Math.min(1, bands.overall * 0.7 + bands.beat * 0.6);

        const smooth = audioSmoothRef.current;
        for (const layer of layers) {
          const def = EFFECTS_BY_ID[layer.effectId];
          if (!def) continue;
          const tuned: Record<string, number> = {};
          for (const p of def.params) {
            const range = p.max - p.min;
            const v = applyAudio(
              layer.params[p.key] ?? p.default,
              p.key, range, bands, smooth, `${layer.id}:${p.key}`,
            );
            tuned[p.key] = Math.max(p.min, Math.min(p.max, v));
          }
          layer.params = tuned;
        }
      } else {
        bandsRef.current = { bass: 0, mid: 0, treble: 0, overall: 0, beat: 0 };
        pulse = 0.4 + 0.3 * Math.sin(t * 1.5);
      }

      renderer!.render(layers, pulse);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer?.dispose();
      canvas.remove();
      rendererRef.current = null;
    };
  }, [seamless]);

  /**
   * Render the pattern at print resolution, off-screen.
   *
   * The preview canvas is viewport-sized — nowhere near enough pixels for a
   * garment panel. This spins up a second renderer at the requested square
   * size, renders one frame, measures the seam, and only then hands over the
   * file. Measuring rather than assuming matters because the effect stack is
   * random: the classifier keeps obviously-unsafe effects out of the pool, but
   * the output is the only thing that actually proves a tile.
   */
  const exportAt = useCallback(async (size: number) => {
    if (exporting) return;
    setExporting(true);
    const t = toast.loading(seamless ? "Finding the cleanest frame…" : `Rendering ${size}x${size}…`);
    let off: HTMLCanvasElement | null = null;
    let r: MoshRenderer | null = null;
    try {
      // Render oversized: the surplus is the material the heal blends with.
      const renderSize = seamless ? renderSizeFor(size) : size;
      off = document.createElement("canvas");
      off.width = renderSize;
      off.height = renderSize;
      r = new MoshRenderer(off);

      const src = document.createElement("canvas");
      src.width = src.height = Math.min(1024, Math.max(256, Math.floor(renderSize / 2)));
      const sctx = src.getContext("2d", { willReadFrequently: true })!;

      r.setSourceCanvas(src);
      r.setTileableSampling(seamless);
      r.setRenderScale(1);
      r.resize(renderSize, renderSize);
      r.setHdrIntensity(0);
      r.setHdr(0);

      const layers: RenderLayer[] = currentStack.map((l, i) => ({
        id: `forge${i}`,
        effectId: l.effectId,
        hidden: false,
        opacity: l.opacity,
        blend: l.blend,
        params: l.params,
      }));

      // Probe surface, reused across candidates — allocating one per frame at
      // 4K is most of the cost of the search.
      const probe = document.createElement("canvas");
      const pw = 256;
      probe.width = probe.height = pw;
      const pctx = probe.getContext("2d", { willReadFrequently: true })!;

      const paint = (time: number) => {
        drawSourceFrame(sctx, src.width, src.height, time);
        r!.render(layers, 0.5);
      };

      /* Search for the best moment rather than capturing the instant of the
         click.

         Effects animate, so the seam quality genuinely varies frame to frame.
         The heal will close the join either way — but the frame that needed the
         LEAST correction has the narrowest visible blend band, so picking it
         makes the repair harder to see. Bounded to ~1.6s: past that the user is
         just waiting, and the curve has flattened. */
      const CANDIDATES = seamless ? 12 : 1;
      const SPACING_MS = 130;
      let bestTime = 0;
      let bestRaw = -1;

      for (let i = 0; i < CANDIDATES; i++) {
        const time = i * (SPACING_MS / 1000);
        paint(time);
        // Twice: the first pass may land while a shader is still linking.
        if (i === 0) paint(time);
        if (CANDIDATES === 1) { bestTime = time; break; }

        pctx.drawImage(off, 0, 0, pw, pw);
        const raw = seamScore(pctx.getImageData(0, 0, pw, pw).data, pw, pw).worst;
        if (raw > bestRaw) { bestRaw = raw; bestTime = time; }
        // Already effectively seamless before any repair — stop early.
        if (raw > 0.995) break;
        await new Promise(res => setTimeout(res, 8));
      }

      // Re-render the winner, then repair its edges.
      paint(bestTime);
      paint(bestTime);

      let finalCanvas: HTMLCanvasElement = off;
      let band = 0;
      if (seamless) {
        const healed = healToSeamless(off, size, DEFAULT_BAND);
        finalCanvas = healed.canvas;
        band = healed.band;
      }

      // Score what is actually being handed over, not what went into the heal.
      let score: number | null = null;
      try {
        pctx.clearRect(0, 0, pw, pw);
        pctx.drawImage(finalCanvas, 0, 0, pw, pw);
        score = seamScore(pctx.getImageData(0, 0, pw, pw).data, pw, pw).worst;
        setSeam(score);
      } catch { /* advisory only — never block the save */ }

      const blob = await new Promise<Blob | null>(res => finalCanvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Encoding failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mosh-forge-${seed.toString(16)}-${size}${seamless ? "-tile" : ""}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      /* Always saved, always told what you got.
         The previous version suppressed the success toast when the seam failed,
         so a file that did download looked like a refusal. */
      const pct = score !== null ? `${(score * 100).toFixed(1)}%` : "n/a";
      if (!seamless) {
        toast.success(`${size}x${size} exported`, { id: t });
      } else if (score !== null && score < 0.9) {
        toast.warning(`${size}x${size} saved — edges may show`, {
          id: t,
          description: `Edge match ${pct}. Reshuffle for a cleaner tile, or drop density.`,
          duration: 10000,
        });
      } else {
        toast.success(`${size}x${size} seamless tile saved`, {
          id: t,
          description: `Edge match ${pct} · ${band}px blended`,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
    } finally {
      r?.dispose();
      off?.remove();
      setExporting(false);
    }
  }, [exporting, palette, seed, currentStack, seamless, intensity, drawSourceFrame]);

  const idleStage = useIdleFade(2_000);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground" data-idle={idleStage}>
      <Helmet>
        <title>Pattern Forge — MOSH</title>
        <meta name="description" content="Generate procedural glitch patterns to use as MOSH source images." />
      </Helmet>

      {/* Top bar */}
      <div className="ui-chrome flex shrink-0 items-center justify-between border-b border-border/30 px-5 py-3">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 transition hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back
        </button>
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-foreground/40">
          pattern forge
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={randomise}
            className="flex items-center gap-1.5 border border-border/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-foreground/60 transition hover:border-accent hover:text-accent"
          >
            <Shuffle className="h-3 w-3" />
            shuffle
          </button>
          <div className="flex items-center gap-1 border border-primary/60">
            <Download className="ml-2 h-3 w-3 text-primary" />
            {EXPORT_SIZES.map(sz => (
              <button
                key={sz}
                type="button"
                onClick={() => exportAt(sz)}
                disabled={exporting}
                title={`Export ${sz}x${sz} PNG${seamless ? " (seamless tile)" : ""}`}
                className="px-2 py-1.5 font-mono text-xs uppercase tracking-[0.15em] text-primary transition hover:bg-primary/10 disabled:opacity-40"
              >
                {sz >= 1024 ? `${sz / 1024}k` : sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={hostRef}
          className="relative flex-1 bg-black"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f && f.type.startsWith("image/")) loadBase(f);
          }}
        >
          <ForgeTriggers
            micOn={micOn}
            onToggleMic={toggleMic}
            onGif={captureGif}
            gifBusy={gifBusy}
            gifProgress={gifProgress}
            isRecording={isRecording}
            onToggleRecord={toggleRecord}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            shuffleSec={shuffleSec}
            onShuffleSec={chooseShuffle}
            journeyOn={journeyOn}
            onToggleJourney={toggleJourney}
          />

          {/* Journey readout. An unattended director that never says what it is
              doing is indistinguishable from a broken one, so it reports the
              measurements it acted on rather than just a status light. */}
          {journeyOn && journeyState && (
            <div className="ui-chrome pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(22rem,60vw)] rounded-sm border border-[hsl(var(--border-default))] bg-black/70 px-3 py-2 backdrop-blur-md">
              <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[hsl(var(--accent))]">
                journey · {journeyState.section}
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-foreground/70">
                {micOn ? journeyState.reading.label : "no audio — pacing from the image alone"}
              </p>
              <p className="mt-1 font-mono text-[9px] leading-relaxed text-foreground/40">
                load {Math.round(journeyState.frame.load * 100)}%
                {journeyState.move ? ` · amount ${Math.round(journeyState.move.intensity * 100)}%` : ""}
                {` · next ${(journeyState.nextInMs / 1000).toFixed(1)}s`}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <motion.div
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="flex w-52 shrink-0 flex-col gap-6 overflow-y-auto border-l border-border/30 p-5"
        >
          {/* Palette */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              palette
            </p>
            <div className="space-y-1.5">
              {PALETTES.map((p, i) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => setPaletteIdx(i)}
                  className={`flex w-full items-center gap-3 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] transition ${
                    i === paletteIdx ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
                  }`}
                >
                  <span className="flex gap-1">
                    {p.colors.map(c => (
                      <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Base image */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              base
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60 transition hover:text-accent"
            >
              {baseImage ? "replace image" : "upload image"}
              <Upload className="h-3 w-3" />
            </button>
            {baseName && (
              <>
                <p className="mt-1 truncate px-2 font-mono text-[9px] text-accent/70" title={baseName}>
                  {baseName}
                </p>
                <button
                  type="button"
                  onClick={() => { setBaseImage(null); setBaseName(null); setSeam(null); }}
                  className="mt-1 px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 transition hover:text-destructive"
                >
                  remove
                </button>
                <p className="mb-1 mt-3 px-2 font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/40">
                  pattern over base
                </p>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={overlay}
                  onChange={(e) => setOverlay(parseFloat(e.target.value))}
                  className="w-full accent-[hsl(var(--accent))]"
                  aria-label="Pattern strength over base image"
                />
                <p className="mt-1 px-2 font-mono text-[8px] uppercase tracking-[0.15em] text-foreground/30">
                  {overlay < 0.05 ? "effects rework the image directly" : `${Math.round(overlay * 100)}% pattern`}
                </p>
              </>
            )}
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadBase(f); e.target.value = ""; }}
            />
          </div>

          {/* Seamless */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              output
            </p>
            <button
              type="button"
              onClick={() => setSeamless(v => !v)}
              className={`flex w-full items-center justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition ${
                seamless ? "text-accent" : "text-foreground/50 hover:text-foreground/80"
              }`}
            >
              seamless tile
              <span>{seamless ? "on" : "off"}</span>
            </button>
            {seamless && (
              <p className="mt-1 px-2 font-mono text-[8px] leading-relaxed uppercase tracking-[0.15em] text-foreground/30">
pool limited to tile-safe effects · edges healed on export
              </p>
            )}
            {seam !== null && (
              <p className={`mt-2 px-2 font-mono text-[9px] uppercase tracking-[0.2em] ${
                seam >= 0.97 ? "text-accent/80" : "text-destructive/80"
              }`}>
                edge match {(seam * 100).toFixed(1)}%
              </p>
            )}
          </div>

          {/* Intensity */}
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              density
            </p>
            <input
              type="range" min={0} max={1} step={0.05}
              value={intensity}
              onChange={(e) => setIntensity(parseFloat(e.target.value))}
              className="w-full accent-[hsl(var(--accent))]"
              aria-label="Pattern density"
            />
          </div>

          {/* Current Effect Stack Summary */}
          <div>
            <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              active effects
            </p>
            <div className="space-y-1 overflow-hidden">
              <AnimatePresence mode="popLayout">
                {currentStack.map((l, i) => (
                  <motion.div
                    key={`${EFFECTS_BY_ID[l.effectId]?.name ?? l.effectId}-${i}`}
                    initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 12, filter: "blur(4px)" }}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: EASE }}
                    className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent/80"
                  >
                    {l.effectId}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Seed */}
          <div>
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/40">
              seed
            </p>
            <p className="font-mono text-[11px] text-foreground/50">
              #{seed.toString(16).padStart(6, "0")}
            </p>
            <button
              type="button"
              onClick={() => setSeed(Math.floor(Math.random() * 0xFFFFFF))}
              className="mt-2 font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/35 transition hover:text-accent"
            >
              re-seed
            </button>
          </div>

          <div className="mt-auto border-t border-border/30 pt-4">
            <p className="font-mono text-[9px] leading-relaxed text-foreground/30 uppercase tracking-[0.2em]">
              Seamless tiles repeat edge-to-edge for all-over print. 2k suits most
              garment panels at 150 DPI; 4k for large format.
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
