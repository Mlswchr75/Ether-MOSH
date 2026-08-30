import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { overlayFromUrl } from "@/lib/overlayMode";
import { MoshRenderer, type RenderLayer } from "@/engine/Renderer";
import { evalModulator } from "@/engine/modulators";
import { BeatClock } from "@/engine/beat";
import { MicAnalyzer } from "@/engine/mic";
import { trackPlayer } from "@/engine/trackPlayer";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { timeController } from "@/engine/timefx";
import { ProceduralSource } from "@/engine/proceduralSource";
import { paintForgeSource, createForgeRuntime, disposeForgeRuntime, type ForgeRuntime } from "@/engine/forgeSource";
import { AudioWindow, SILENT_FEATURES, type AudioFeatures, type JourneyMic } from "@/engine/journeyCore";
import { FrequencyStrip, BeatBorder } from "./AudioFeedback";
import { startAnalyzer, stopAnalyzer, getAudioData } from "@/engine/audioAnalyzer";
import { IsolationOverlay } from "./IsolationOverlay";
import { StickerCapture } from "./StickerCapture";
import { toast } from "sonner";
import { vrMode } from "@/engine/vrMode";
import { VrButton } from "./VrButton";
import { cursorFx } from "@/engine/cursorFx";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";

/** Matches JourneyDirector's default sampleMs — the cadence its AudioFeatures
 *  computation was designed for, not an arbitrary choice. */
const FORGE_AUDIO_FEATURES_INTERVAL_MS = 110;

/** Forge's live-preview source canvas resolution. This was hardcoded at
 *  256×256 and then magnified 5-10x by the GPU to fill the screen — the
 *  main cause of Forge looking pixelated/blocky compared to its own PNG
 *  export path (which renders up to 1024px). 512 is 4x the pixel count at a
 *  cost the per-pixel Canvas2D generators (Shatter Field, Pour Bloom) can
 *  still afford every frame; dropping to 384 on ≤4-core devices follows the
 *  same hardwareConcurrency tiering already used for their cell/blob counts
 *  (see forgeCompose.ts, pourBloom.ts, shatterField.ts, forgeSource.ts) so
 *  low-end devices don't inherit a new frame-time regression. Cell/site
 *  placement in every generator is in normalized [0,1) space, so this only
 *  changes how finely the existing pattern is sampled — not its layout,
 *  colors, or composition. */
const FORGE_SOURCE_SIZE = (typeof navigator !== "undefined" && (navigator.hardwareConcurrency || 4) <= 4) ? 384 : 512;

/**
 * Heuristic default audio map for any unmapped param. When the mic is on,
 * EVERY layer breathes — no manual wiring required. Users can still override
 * per-param via the "~" tilde control to set explicit `audioMaps`.
 */
type DefaultMap = { source: "bass" | "mid" | "treble" | "overall" | "beat"; amount: number; smoothing: number };
function defaultAudioMap(key: string): DefaultMap {
  const k = key.toLowerCase();
  // Punchy / kick-driven params
  if (/(amount|intensity|strength|power|drive|gain|mix)/.test(k))
    return { source: "bass", amount: 0.55, smoothing: 0.25 };
  // Beat-snappy structural shifts
  if (/(scale|size|zoom|radius|thick|width|count|density|stripes|cells|blocks|tiles|grid|repeat)/.test(k))
    return { source: "beat", amount: 0.35, smoothing: 0.05 };
  // Color / hue → treble shimmer
  if (/(hue|color|tint|saturat|chroma|rainbow|spectrum|prism)/.test(k))
    return { source: "treble", amount: 0.45, smoothing: 0.4 };
  // Spatial distortion → mid energy
  if (/(shift|offset|displace|warp|distort|skew|twist|swirl|wave|wobble|bend|pinch|spread|split|spacing|angle)/.test(k))
    return { source: "mid", amount: 0.4, smoothing: 0.3 };
  // Time / motion / speed → overall envelope
  if (/(speed|rate|time|phase|frequency|tempo|flow|drift)/.test(k))
    return { source: "overall", amount: 0.3, smoothing: 0.5 };
  // Threshold / cutoff / detail → bass
  if (/(threshold|cutoff|edge|detail|noise|grain)/.test(k))
    return { source: "bass", amount: 0.4, smoothing: 0.3 };
  // Default — gentle overall pulse so nothing is ever fully static
  return { source: "overall", amount: 0.25, smoothing: 0.5 };
}


export function GlCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MoshRenderer | null>(null);
  // Bumped to force the renderer (and everything that configures it) to
  // rebuild after a WebGL context loss/restore cycle.
  const [rendererGeneration, setRendererGeneration] = useState(0);
  const beatRef = useRef(new BeatClock());
  const micRef = useRef(new MicAnalyzer());
  const proceduralRef = useRef<ProceduralSource | null>(null);
  const layersRef = useRef(useStore.getState().layers);
  const showBeforeAfterRef = useRef(useStore.getState().showBeforeAfter);
  /** Global reactivity multiplier (Sensitivity hot trigger) — 1 = no-op. */
  const sensitivityRef = useRef(useStore.getState().sensitivity);
  const isVideoSourceRef = useRef(!!useStore.getState().videoElement);
  const sourceModeRef = useRef(useStore.getState().sourceMode);
  const forgeRef = useRef(useStore.getState().forge);
  /** Forge's own small source canvas — repainted every frame, independent of
   *  the ambient ProceduralSource used when there's simply no source yet. */
  const forgeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const forgeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const forgeRuntimeRef = useRef<ForgeRuntime | null>(null);
  const forgeAudioWindowRef = useRef(new AudioWindow());
  // .features() does per-call array allocation + a tempo sort over the whole
  // rolling window — cheap once, not free at requestAnimationFrame cadence.
  // Journey's own director recomputes at a 110ms interval (~9Hz), not per
  // frame; Forge mirrors that cadence instead of paying render-loop cost for
  // a value that doesn't change frame-to-frame anyway.
  const forgeAudioFeaturesRef = useRef<AudioFeatures>(SILENT_FEATURES);
  const forgeAudioFeaturesAtRef = useRef(0);
  const vrFrameRef = useRef<(() => void) | null>(null);
  // Read once from the URL — overlay is a deployment mode, not a live setting.
  const overlayRef = useRef(overlayFromUrl());

  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const sourceMode = useStore(s => s.sourceMode);
  const forgeSeamless = useStore(s => s.forge.seamless);
  const randomiseForge = useStore(s => s.randomiseForge);
  const cameraFacing = useStore(s => s.cameraFacing);
  const showBeforeAfter = useStore(s => s.showBeforeAfter);
  const beforeAfterSplit = useStore(s => s.beforeAfterSplit);
  const bpm = useStore(s => s.bpm);
  const beatEnabled = useStore(s => s.beatEnabled);
  const micEnabled = useStore(s => s.micEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const micSensitivity = useStore(s => s.micSensitivity);
  const audioInputDeviceId = useStore(s => s.audioInputDeviceId);
  const audioInputDeviceLabel = useStore(s => s.audioInputDeviceLabel);
  const audioInputChannel = useStore(s => s.audioInputChannel);
  const lastAppliedBpmAtRef = useRef(0);
  const audioSmoothRef = useRef<Map<string, number>>(new Map());
  const isPerformanceMode = useStore(s => s.isPerformanceMode);
  const showMetersInPerformance = useStore(s => s.showMetersInPerformance);
  const tileMode = useStore(s => s.tileMode);
  const tileUniforms = useStore(s => s.tileUniforms);

  // Init renderer — re-runs on rendererGeneration bumps, which is how a lost
  // WebGL context gets a fresh renderer instead of a permanently dead canvas.
  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      rendererRef.current = new MoshRenderer(canvasRef.current);
      useStore.getState().setGlCanvas(canvasRef.current);
    } catch (err) {
      console.error("WebGL init failed:", err);
      toast.error("WebGL unavailable — try closing other tabs or refreshing.");
    }
    return () => {
      useStore.getState().setGlCanvas(null);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [rendererGeneration]);

  // WebGL context loss recovery. Without this the canvas just freezes/goes
  // black forever on GPU reset or driver reclaim (common on mobile after
  // backgrounding) — preventDefault on "lost" is what tells the browser to
  // actually attempt restoration rather than losing the context permanently.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = (e: Event) => {
      e.preventDefault();
      console.error("[webgl] context lost");
      toast.error("Graphics reset — reconnecting…", { id: "webgl-context" });
    };
    const onRestored = () => {
      console.warn("[webgl] context restored — recreating renderer");
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setRendererGeneration(g => g + 1);
      toast.success("Reconnected", { id: "webgl-context" });
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, []);

  // Ambient touch/click mosh — window-level and capture-phase so it fires
  // for every press anywhere (canvas drag AND any hot-trigger/menu tap),
  // regardless of what the target element does with the event afterward.
  // Deliberately independent of Pro Mode / idle-lockdown / hideUI: this is
  // feedback for the touch itself, not a menu interaction. Keyed by
  // pointerId, which is exactly how the platform already distinguishes
  // simultaneous touches — multitouch falls out for free.
  useEffect(() => {
    const toUv = (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 1 || rect.height < 1) return null;
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
      return { x, y };
    };
    const onDown = (e: PointerEvent) => {
      const uv = toUv(e.clientX, e.clientY);
      if (!uv) return;
      cursorFx.spawnAmbient(`ptr-${e.pointerId}`, uv.x, uv.y);
    };
    const onMove = (e: PointerEvent) => {
      const uv = toUv(e.clientX, e.clientY);
      if (!uv) return;
      cursorFx.moveAmbient(`ptr-${e.pointerId}`, uv.x, uv.y);
    };
    const onUp = (e: PointerEvent) => cursorFx.release(`ptr-${e.pointerId}`);
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerup", onUp, { capture: true, passive: true });
    window.addEventListener("pointercancel", onUp, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
    };
  }, []);

  // Mirror front-facing camera — re-runs whenever the facing changes (e.g. flip button).
  useEffect(() => {
    rendererRef.current?.setSourceMirror(cameraFacing === 'user');
  }, [cameraFacing, rendererGeneration]);

  // Source — priority: live video > still image > forge pattern > procedural
  // ambient. Reset up front rather than per-branch: every mode transition
  // starts from a clean wrap-mode state, and only the forge branch re-enables
  // repeat sampling.
  useEffect(() => {
    if (!rendererRef.current) return;
    rendererRef.current.setTileableSampling(sourceMode === "forge" || sourceMode === "motif" ? forgeSeamless : false);
    if (videoElement) {
      proceduralRef.current?.stop();
      let cancelled = false;
      const r = containerRef.current?.getBoundingClientRect();
      const applyVideo = () => {
        if (cancelled || !rendererRef.current) return;
        rendererRef.current.setSourceVideo(videoElement);
        rendererRef.current.setSourceMirror(useStore.getState().cameraFacing === 'user');
        rendererRef.current.refreshSourceAspect();
        if (r) rendererRef.current.resize(r.width, r.height);
      };
      const refresh = () => rendererRef.current?.refreshSourceAspect();
      const tryPlay = () => { videoElement.play().catch(() => {}); };
      const hasPixels = () => videoElement.videoWidth > 0 && videoElement.videoHeight > 0 && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;

      videoElement.addEventListener("loadedmetadata", refresh);
      videoElement.addEventListener("resize", refresh);
      videoElement.addEventListener("canplay", applyVideo, { once: true });
      videoElement.addEventListener("playing", applyVideo, { once: true });
      tryPlay();
      if (hasPixels()) applyVideo();

      const fallback = window.setTimeout(applyVideo, 700);
      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
        videoElement.removeEventListener("loadedmetadata", refresh);
        videoElement.removeEventListener("resize", refresh);
        videoElement.removeEventListener("canplay", applyVideo);
        videoElement.removeEventListener("playing", applyVideo);
      };
    }
    if (imageElement) {
      proceduralRef.current?.stop();
      rendererRef.current.setSourceImage(imageElement);
    } else if (sourceMode === "forge" || sourceMode === "motif") {
      proceduralRef.current?.stop();
      if (!forgeCanvasRef.current) {
        const c = document.createElement("canvas");
        c.width = FORGE_SOURCE_SIZE; c.height = FORGE_SOURCE_SIZE;
        forgeCanvasRef.current = c;
        forgeCtxRef.current = c.getContext("2d");
      }
      rendererRef.current.setSourceCanvas(forgeCanvasRef.current);
    } else {
      if (!proceduralRef.current) proceduralRef.current = new ProceduralSource(1024);
      proceduralRef.current.start();
      rendererRef.current.setSourceCanvas(proceduralRef.current.canvas);
    }
    const r = containerRef.current?.getBoundingClientRect();
    if (r) rendererRef.current.resize(r.width, r.height);
  }, [imageElement, videoElement, sourceMode, forgeSeamless, rendererGeneration]);

  // Cleanup procedural on unmount
  useEffect(() => () => { proceduralRef.current?.dispose(); proceduralRef.current = null; }, []);

  // Cleanup forge's Volumetric Bloom WebGL context on unmount — browsers cap
  // concurrent contexts, so this must be released explicitly, not left to GC.
  useEffect(() => () => {
    if (forgeRuntimeRef.current) disposeForgeRuntime(forgeRuntimeRef.current);
    forgeRuntimeRef.current = null;
  }, []);

  // Auto-resume AudioContext on tab refocus
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const m = micRef.current;
      if (!m.enabled) return;
      if (m.isSuspended()) {
        m.resume();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      rendererRef.current?.resize(r.width, r.height);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Beat sync settings
  useEffect(() => { beatRef.current.setBpm(bpm); }, [bpm]);
  useEffect(() => { beatRef.current.enabled = beatEnabled; }, [beatEnabled]);

  // Seamless tile pass
  useEffect(() => {
    rendererRef.current?.setTile(tileMode, tileUniforms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileMode, rendererGeneration]);
  useEffect(() => {
    if (tileMode === "none") return;
    rendererRef.current?.updateTileUniforms(tileUniforms);
  }, [tileMode, tileUniforms, rendererGeneration]);

  // Microphone sensitivity passthrough — scaled by the global Sensitivity
  // hot trigger (1 = no-op, matches behavior before that control existed).
  const sensitivity = useStore(s => s.sensitivity);
  useEffect(() => { micRef.current.sensitivity = micSensitivity * sensitivity; }, [micSensitivity, sensitivity]);
  useEffect(() => { micRef.current.setInputChannel(audioInputChannel); }, [audioInputChannel]);

  // Lightweight singleton analyzer mirrored off the system-audio stream.
  useEffect(() => {
    if (systemAudioEnabled) {
      const stream = (window as any).__aegisPendingSystemStream as MediaStream | undefined
        ?? (window as any).__aegisActiveSystemStream as MediaStream | undefined;
      if (stream) {
        (window as any).__aegisActiveSystemStream = stream;
        try { startAnalyzer(stream); } catch (e) { console.warn("[audioAnalyzer]", e); }
      }
    } else {
      stopAnalyzer();
      (window as any).__aegisActiveSystemStream = undefined;
    }
  }, [systemAudioEnabled]);

  // Mic / system audio enable/disable lifecycle (mutually exclusive).
  useEffect(() => {
    const mic = micRef.current;
    const wantSource: "mic" | "system" | null = micEnabled ? "mic" : systemAudioEnabled ? "system" : null;
    mic.stop();
    if (!wantSource) return;
    if (wantSource === "mic" && !mic.isSupported()) {
      toast.error("Microphone not supported in this browser");
      useStore.getState().setMicEnabled(false);
      return;
    }
    (window as any).__aegisSystemAudioEnded = () => {
      useStore.getState().setSystemAudioEnabled(false);
    };
    let presetStream: MediaStream | undefined;
    if (wantSource === "system") {
      presetStream = (window as any).__aegisPendingSystemStream as MediaStream | undefined;
      (window as any).__aegisPendingSystemStream = undefined;
      if (!presetStream) {
        toast.error("Click the device-audio button again to share a tab");
        useStore.getState().setSystemAudioEnabled(false);
        return;
      }
    }
    const currentAudioInputChannel = useStore.getState().audioInputChannel;
    mic.start(wantSource, presetStream, {
      input: {
        deviceId: audioInputDeviceId,
        label: audioInputDeviceLabel,
        channel: currentAudioInputChannel,
      },
      onInputEnded: () => {
        if (!useStore.getState().micEnabled) return;
        useStore.getState().setMicEnabled(false);
        toast.error("Audio input disconnected — reconnect it, then choose it again");
      },
    }).then((result) => {
      if (wantSource === "mic") window.dispatchEvent(new Event("mosh:audio-input-ready"));
      if (wantSource === "mic" && !result.requestedDeviceFound) {
        toast.error("Saved audio interface wasn't available — using the default input");
      }
      toast.success(wantSource === "system"
        ? "Routing device audio — every layer reacts"
        : `Listening to ${result.label} — every layer is sound-reactive`);
    }).catch((err) => {
      if (err?.name === "AbortError") return;
      console.error("[audio] capture failed:", err);
      const isSystem = wantSource === "system";
      const errorName = err?.name;
      const msg = errorName === "NotAllowedError"
        ? `${isSystem ? "Screen share" : "Microphone"} permission denied`
        : !isSystem && (errorName === "NotReadableError" || errorName === "TrackStartError")
          ? "Audio interface is busy — close other audio apps or enable shared/multi-client mode"
          : !isSystem && (errorName === "NotFoundError" || errorName === "DevicesNotFoundError")
            ? "Audio input disconnected or unavailable"
            : (err?.message || (isSystem ? "Couldn't capture system audio" : "Microphone unavailable"));
      if (isSystem) {
        useStore.getState().setSystemAudioEnabled(false);
        toast.error(`${msg} — falling back to microphone`);
        if (mic.isSupported() && !useStore.getState().micEnabled) {
          useStore.getState().setMicEnabled(true);
        }
      } else {
        toast.error(msg);
        useStore.getState().setMicEnabled(false);
      }
    });
    // Release the capture on unmount too — without this, navigating away
    // from the editor while mic/system-audio is enabled leaves the
    // getUserMedia/getDisplayMedia stream and its AudioContext running
    // indefinitely (the browser's recording indicator stays lit).
    return () => { mic.stop(); };
  }, [micEnabled, systemAudioEnabled, audioInputDeviceId, audioInputDeviceLabel]);

  // Auto-resume the AudioContext if iOS suspends it, and — the important
  // direction — fully release the mic/device-audio capture when the tab is
  // backgrounded. Without this, switching away to (say) YouTube leaves the
  // getUserMedia stream open in the background, which keeps holding the
  // Bluetooth audio route (or the OS audio focus) and blocks playback
  // elsewhere until the tab is closed. Mirrors useCamera's stop-on-hide.
  useEffect(() => {
    const mic = micRef.current;
    const onVis = () => {
      if (document.hidden) {
        const s = useStore.getState();
        if (s.micEnabled) s.setMicEnabled(false);
        if (s.systemAudioEnabled) s.setSystemAudioEnabled(false);
      } else {
        mic.resume();
      }
    };
    const onTouch = () => mic.resume();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("touchend", onTouch, { passive: true });
    window.addEventListener("pointerup", onTouch);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("touchend", onTouch);
      window.removeEventListener("pointerup", onTouch);
    };
  }, []);

  useEffect(() => () => micRef.current.stop(), []);

  useEffect(() => useStore.subscribe((state) => {
    layersRef.current = state.layers;
    showBeforeAfterRef.current = state.showBeforeAfter;
    sensitivityRef.current = state.sensitivity;
    isVideoSourceRef.current = !!state.videoElement;
    sourceModeRef.current = state.sourceMode;
    forgeRef.current = state.forge;
  }), []);

  // Render loop with adaptive resolution
  useEffect(() => {
    let raf = 0;
    const samples: number[] = [];
    let last = performance.now();
    // Camera sources start at a higher quality baseline for true-to-life look.
    const isMobile = window.innerWidth < 768;
    let scale = isMobile ? 0.68 : 0.78;
    rendererRef.current?.setRenderScale(scale);

    const renderOnce = () => {
      const now = performance.now();
      const dt = now - last; last = now;
      samples.push(dt);
      if (samples.length > 30) samples.shift();
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      const fps = 1000 / avg;
      (window as any).__aegisFps = fps;

      // Adaptive scale — camera allows up to 1.0 (full res), still image caps at 0.9.
      const isVid = isVideoSourceRef.current;
      const scaleCeil = isVid ? 1.0 : 0.9;
      const scaleFloor = isVid ? 0.52 : 0.45;
      if (fps < 42 && scale > scaleFloor) {
        scale = Math.max(scaleFloor, scale - 0.1);
        rendererRef.current?.setRenderScale(scale);
      } else if (fps > 58 && scale < scaleCeil) {
        scale = Math.min(scaleCeil, scale + 0.04);
        rendererRef.current?.setRenderScale(scale);
      }

      const t = timeController.tick();
      const beatPulse = beatRef.current.pulse(now);
      // Theme track and mic are mutually exclusive at the store level — read
      // whichever is actually active. trackPlayer mirrors MicAnalyzer's full
      // public surface, so nothing downstream needs to know which one it got.
      const mic = trackPlayer.enabled ? trackPlayer : micRef.current;
      const micPulse = mic.level();
      (window as any).__aegisMicLevel = micPulse;
      (window as any).__aegisAudioBands = mic.bands;
      /* The analyser itself, for directors that need the raw bands and the
         onset timestamp rather than the derived `sources` map. Published rather
         than passed because the mic is owned here, inside the render loop that
         drives it — handing the instance up through props would invite a second
         caller into `level()`, which is not a getter and would steal beats. */
      (window as any).__aegisMic = mic;
      // Forge's richer audio features reuse the exact same rolling-window
      // analysis Journey already relies on — the mic object published above
      // already satisfies JourneyMic, so no adaptation is needed.
      forgeAudioWindowRef.current.sample(mic, now);
      const sources: Record<string, number> = {
        bass: mic.bassLevel,
        sub: mic.subLevel,
        kick: mic.kickLevel,
        lowMid: mic.lowMidLevel,
        mid: mic.midLevel,
        highMid: mic.highMidLevel,
        treble: mic.trebleLevel,
        presence: mic.presenceLevel,
        overall: mic.overallLevel,
        energy: mic.energyLevel,
        centroid: mic.centroidLevel,
        beat: 0,
      };
      if (mic.consumeBeat()) {
        (window as any).__aegisLastBeatAt = now;
        sources.beat = 1;
        window.dispatchEvent(new Event("aegis:beat"));
      } else {
        const lastBeat = (window as any).__aegisLastBeatAt as number | undefined;
        if (lastBeat) {
          const since = now - lastBeat;
          sources.beat = since < 240 ? Math.pow(1 - since / 240, 2) : 0;
        }
      }
      (window as any).__aegisAudioSources = sources;

      const detectedAt = mic.detectedBpmAt;
      const detectedBpm = mic.detectedBpm;
      if (detectedBpm && detectedAt && detectedAt !== lastAppliedBpmAtRef.current) {
        lastAppliedBpmAtRef.current = detectedAt;
        const store = useStore.getState();
        if (Math.abs(store.bpm - detectedBpm) >= 1) {
          store.setBpm(detectedBpm);
          (window as any).__aegisDetectedBpm = detectedBpm;
          window.dispatchEvent(new CustomEvent("aegis:bpm-detected", { detail: { bpm: detectedBpm } }));
        }
      }
      const rippleUntil = (window as any).__aegisRippleUntil as number | undefined;
      let ripplePulse = 0;
      if (rippleUntil && now < rippleUntil) {
        const remaining = (rippleUntil - now) / 800;
        ripplePulse = Math.max(0, Math.min(1, remaining));
      }

      const kaossLevel = Math.max(0, Math.min(1, (window as any).__aegisKaossLevel ?? 0));
      const kaossPalette = (window as any).__aegisKaossPalette as
        | { bass: number; mid: number; treble: number; overall: number; beat: number }
        | undefined;
      if (kaossLevel > 0.001 && kaossPalette) {
        sources.bass    = Math.min(1, sources.bass    + kaossLevel * kaossPalette.bass);
        sources.mid     = Math.min(1, sources.mid     + kaossLevel * kaossPalette.mid);
        sources.treble  = Math.min(1, sources.treble  + kaossLevel * kaossPalette.treble);
        sources.overall = Math.min(1, sources.overall + kaossLevel * kaossPalette.overall);
        sources.beat    = Math.min(1, sources.beat    + kaossLevel * kaossPalette.beat);
      }
      const kaossActive = kaossLevel > 0.01;

      const sysBeat = useStore.getState().systemAudioEnabled ? getAudioData().beat : 0;
      const pulse = Math.max(beatPulse, micPulse, ripplePulse, kaossLevel, sysBeat);

      // Forge mode paints its own source every frame — nothing to read a
      // camera or image element for, the "photo" is generated on the spot.
      if ((sourceModeRef.current === "forge" || sourceModeRef.current === "motif") && forgeCanvasRef.current && forgeCtxRef.current) {
        const fc = forgeCanvasRef.current;
        if (!forgeRuntimeRef.current) forgeRuntimeRef.current = createForgeRuntime();
        if (now - forgeAudioFeaturesAtRef.current >= FORGE_AUDIO_FEATURES_INTERVAL_MS) {
          forgeAudioFeaturesRef.current = forgeAudioWindowRef.current.features(mic, now);
          forgeAudioFeaturesAtRef.current = now;
        }
        const forgeAudioFeatures = forgeAudioFeaturesRef.current;
        const sourceTime = sourceModeRef.current === "motif" ? (forgeRef.current.seed % 100000) / 997 : t;
        paintForgeSource(forgeCtxRef.current, fc.width, fc.height, sourceTime, forgeRef.current, {
          treble: sources.treble ?? 0,
          beat: sources.beat ?? 0,
          bpm: forgeAudioFeatures.bpm,
          regularity: forgeAudioFeatures.regularity,
          density: forgeAudioFeatures.density,
          brightness: forgeAudioFeatures.brightness,
          weight: forgeAudioFeatures.weight,
          dynamics: forgeAudioFeatures.dynamics,
          energy: forgeAudioFeatures.energy,
        }, forgeRuntimeRef.current);
      }

      const audioSmooth = audioSmoothRef.current;
      const reactiveOn = mic.enabled || kaossActive;
      const renderLayers: RenderLayer[] = layersRef.current.map(l => {
        const params: Record<string, number> = {};
        const def = EFFECTS_BY_ID[l.effectId];
        for (const k of Object.keys(l.params)) {
          let v = l.params[k];
          const mod = l.mods[k];
          if (mod) v = v + evalModulator(mod.type, t, mod.speed, mod.depth, mod.offset, pulse);
          const am = l.audioMaps?.[k];
          const pdef = def?.params.find(p => p.key === k);
          const range = pdef ? (pdef.max - pdef.min) : 1;
          if (am && reactiveOn) {
            const target = sources[am.source] ?? 0;
            const smKey = `${l.id}:${k}`;
            const prev = audioSmooth.get(smKey) ?? 0;
            const alpha = Math.max(0.02, 1 - am.smoothing * 0.98);
            const sm = prev + (target - prev) * alpha;
            audioSmooth.set(smKey, sm);
            v = v + sm * am.amount * range * sensitivityRef.current;
          } else if (reactiveOn && !am) {
            const dm = defaultAudioMap(k);
            const target = sources[dm.source] ?? 0;
            const smKey = `${l.id}:${k}:def`;
            const prev = audioSmooth.get(smKey) ?? 0;
            const alpha = Math.max(0.02, 1 - dm.smoothing * 0.98);
            const sm = prev + (target - prev) * alpha;
            audioSmooth.set(smKey, sm);
            v = v + sm * dm.amount * range * sensitivityRef.current;
          }
          params[k] = v;
        }
        let opacity = l.opacity;
        if (showBeforeAfterRef.current) opacity = 0;
        return {
          id: l.id,
          effectId: l.effectId,
          hidden: l.hidden,
          opacity,
          blend: l.blend,
          params,
          region: l.region ?? null,
        };
      });

      // Live touch/click distortion — appended last so it warps whatever the
      // stack above already produced, "no matter what it may be". Empty
      // whenever nothing is actively pressed, so this costs nothing at rest.
      if (cursorFx.hasActive()) renderLayers.push(...cursorFx.getActiveLayers(now));

      // Mosh intensity score: 0 = bare camera / no effects, 1 = fully cranked.
      // Drives the adaptive HDR finisher (pure passthrough at 0, ACES filmic at 1).
      const activeLayers = renderLayers.filter(l => !l.hidden && l.opacity > 0.02);
      let moshScore = Math.min(1.0, activeLayers.reduce((s, l) => s + l.opacity, 0) / 3.0);
      // Forge's generative output is the whole point of the mode, not a
      // camera/photo waiting for effects to be stacked on — a bare Forge
      // pattern with zero layers otherwise leaves this finisher fully
      // passthrough (moshScore≈0), so the pattern itself never gets the
      // ACES filmic tonemap + local-contrast lift the pipeline already
      // does for everything else. A floor here only changes tone-mapping
      // intensity, not what Forge draws.
      if (sourceModeRef.current === "forge" || sourceModeRef.current === "motif") moshScore = Math.max(moshScore, 0.55);
      rendererRef.current?.setHdrIntensity(moshScore);
      rendererRef.current?.setHdr(moshScore);
      // Re-applied per frame rather than once at setup: the renderer is
      // recreated on context loss, and a silently un-keyed overlay paints a
      // black rectangle over the user's whole scene.
      if (overlayRef.current.mode !== "off") {
        rendererRef.current?.setOverlayMode(
          overlayRef.current.mode,
          { gate: overlayRef.current.gate, soft: overlayRef.current.soft },
        );
      }

      rendererRef.current?.render(renderLayers, pulse);
    };

    vrFrameRef.current = renderOnce;

    const tick = () => {
      // Schedule the next frame FIRST. A single generator/shader exception must
      // never be able to kill Forge's animation clock and strand the user on
      // the first rendered stack.
      raf = requestAnimationFrame(tick);
      if (vrMode.active) return;
      try {
        renderOnce();
      } catch (error) {
        console.error("[forge/render] frame failed; continuing render loop", error);
        // If a Forge generator/runtime is the culprit, discard only its
        // mutable runtime. The next frame recreates it cleanly while the main
        // renderer, source mode and controls stay alive.
        if (sourceModeRef.current === "forge" || sourceModeRef.current === "motif") {
          if (forgeRuntimeRef.current) disposeForgeRuntime(forgeRuntimeRef.current);
          forgeRuntimeRef.current = null;
          // Escape a poisoned in-flight generator transition as well. Re-roll
          // to a fresh, known-valid source instead of retrying the same broken
          // frame forever.
          useStore.getState().randomiseForge();
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); vrFrameRef.current = null; };
  }, []);

  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  useEffect(() => {
    const compute = () => {
      if (!isPerformanceMode) { setFitMode("contain"); return; }
      const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
      if (!isMobile || !imageElement) { setFitMode("contain"); return; }
      const iw = imageElement.naturalWidth || imageElement.width;
      const ih = imageElement.naturalHeight || imageElement.height;
      if (!iw || !ih) { setFitMode("contain"); return; }
      const imgAspect = iw / ih;
      const devAspect = window.innerWidth / Math.max(1, window.innerHeight);
      const imgLandscape = imgAspect > 1.05;
      const devLandscape = devAspect > 1.05;
      setFitMode(imgLandscape === devLandscape ? "contain" : "cover");
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [isPerformanceMode, imageElement]);

  const coverFill = isPerformanceMode && fitMode === "cover";

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        data-mosh-canvas
        className={`relative z-10 block h-full w-full ${["forge", "motif"].includes(sourceMode) ? "cursor-pointer" : ""}`}
        style={{ imageRendering: "auto", objectFit: "cover" }}
        // Generated modes do not mount QuadrantSurface. Bind the same full
        // Art Director shuffle used by Space directly to their canvas. Binding
        // it to the canvas itself, not the
        // container, means it only fires when the click actually lands on the
        // visible pixels — any overlay drawn above it (HotTriggers etc.) is a
        // separate element that receives the click first.
        onClick={["forge", "motif"].includes(sourceMode)
          ? () => crossfadeLayers(() => useStore.getState().mosh(), MOSH_FADE_MS)
          : undefined}
      />

      <IsolationOverlay />
      <StickerCapture />
      <VrButton getRenderer={() => rendererRef.current} getFrame={() => vrFrameRef.current} />


      <BeatBorder />
      <FrequencyStrip hidden={isPerformanceMode && !showMetersInPerformance} />

      {showBeforeAfter && imageElement && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-20"
        >
          <div
            className="relative overflow-hidden"
            style={{ width: "100%", height: "100%" }}
          >
            <img
              src={imageElement.src}
              alt=""
              className="absolute left-0 top-1/2 -translate-y-1/2 h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${(1 - beforeAfterSplit) * 100}% 0 0)` }}
            />
            <div
              className="absolute top-0 h-full w-px bg-primary shadow-[0_0_12px_hsl(var(--primary))]"
              style={{ left: `${beforeAfterSplit * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * MirrorWings — fills the letterboxed gutters in fullscreen with mirrored
 * copies of the main GL canvas.
 */
function MirrorWings({
  canvasRef, containerRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const main = canvasRef.current;
      const cont = containerRef.current;
      const left = leftRef.current;
      const right = rightRef.current;
      if (!main || !cont || !left || !right) return;
      if (main.width === 0 || main.height === 0) return;

      const cRect = cont.getBoundingClientRect();
      const mRect = main.getBoundingClientRect();
      const gutter = Math.max(0, Math.floor((cRect.width - mRect.width) / 2));
      if (gutter <= 1) {
        left.style.display = "none";
        right.style.display = "none";
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssH = Math.floor(mRect.height);
      const wingPxW = Math.max(1, Math.floor(gutter * dpr));
      const wingPxH = Math.max(1, Math.floor(cssH * dpr));

      for (const w of [left, right]) {
        if (w.width !== wingPxW || w.height !== wingPxH) {
          w.width = wingPxW; w.height = wingPxH;
        }
        w.style.display = "block";
        w.style.width = `${gutter}px`;
        w.style.height = `${cssH}px`;
      }

      const lctx = left.getContext("2d");
      const rctx = right.getContext("2d");
      if (!lctx || !rctx) return;

      const sliceW = Math.min(main.width, Math.floor((gutter / mRect.height) * main.height));

      rctx.save();
      rctx.setTransform(-1, 0, 0, 1, wingPxW, 0);
      rctx.drawImage(
        main,
        main.width - sliceW, 0, sliceW, main.height,
        0, 0, wingPxW, wingPxH,
      );
      rctx.restore();

      lctx.save();
      lctx.setTransform(-1, 0, 0, 1, wingPxW, 0);
      lctx.drawImage(
        main,
        0, 0, sliceW, main.height,
        0, 0, wingPxW, wingPxH,
      );
      lctx.restore();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, containerRef]);

  return (
    <>
      <canvas
        ref={leftRef}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none"
        style={{ imageRendering: "pixelated" }}
      />
      <canvas
        ref={rightRef}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-0 pointer-events-none"
        style={{ imageRendering: "pixelated" }}
      />
    </>
  );
}
