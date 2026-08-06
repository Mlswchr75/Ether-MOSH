import * as THREE from "three";
(window as any).THREE = THREE;
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Download, Layers, Sparkles, Sliders, Music, Eye, Undo2, Redo2, Maximize2, Minimize2, Circle, Mic, MicOff, MonitorSpeaker, Snowflake, Rewind, Repeat, Keyboard, X } from "lucide-react";
import { useStore } from "@/store/useStore";
import { GlCanvas } from "@/components/editor/GlCanvas";

import { LayerStack } from "@/components/editor/LayerStack";
import { FxPicker } from "@/components/editor/FxPicker";
import { ShufflePanel } from "@/components/editor/ShufflePanel";
import { ParamDock } from "@/components/editor/ParamDock";
import { BeatPanel } from "@/components/editor/BeatPanel";
import { exportCanvas, downloadBlob, remasterCanvas } from "@/engine/export";
import { captureBestFrame } from "@/engine/bestFrame";
import { captureLoopingGif } from "@/engine/gifCapture";
import { CanvasRecorder } from "@/engine/recorder";
import { timeController } from "@/engine/timefx";
import { PerformanceOverlay, PerformanceTooltip } from "@/components/editor/PerformanceMode";
import { CommandPalette } from "@/components/editor/CommandPalette";
import { ShortcutsOverlay } from "@/components/editor/ShortcutsOverlay";
import { SlotIndicator } from "@/components/editor/SlotIndicator";

import { OnboardingPrompts, shouldShowOnboarding, markOnboardingSeen } from "@/components/editor/OnboardingPrompts";
import { HintPulse, isHintDismissed, dismissHint } from "@/components/editor/HintPulse";
import { SourceTransition } from "@/components/editor/SourceTransition";
import { RippleLayer } from "@/components/editor/Ripple";
import { enterFullscreen, exitFullscreen, hasSeenPerfMode, markPerfModeSeen, useFullscreenSync } from "@/hooks/usePerformanceMode";
import { toast } from "sonner";
import { shareApp, shareBlob, shareOrDownload, canNativeShare } from "@/lib/share";
import { presetFromUrl, PRESET_PARAM } from "@/engine/presetUrl";
import { KaossSurface } from "@/components/editor/KaossSurface";
import { QuadrantSurface } from "@/components/editor/QuadrantSurface";
import { TrackpadGestures } from "@/components/editor/TrackpadGestures";
import { toggleSystemAudio } from "@/engine/systemAudio";
import { loadImageFile, loadImageFromClipboard } from "@/lib/sourceLoader";
import { SystemAudioHud } from "@/components/editor/SystemAudioHud";


import { AboutTrigger } from "@/components/AboutOverlay";
import { CameraMenu } from "@/components/editor/CameraMenu";

import { StartCameraOverlay } from "@/components/editor/StartCameraOverlay";
import { HotTriggers } from "@/components/editor/HotTriggers";
import { AccountChip } from "@/components/AccountChip";
import { usePaywall } from "@/hooks/usePaywall";
import { useCloudFavorites } from "@/hooks/useCloudFavorites";
import { SmartDirector } from "@/engine/smartDirector";
import { StormDirector } from "@/engine/stormDirector";
import { useIdleHide } from "@/hooks/useIdleHide";

// Unified one-screen control rack — no tabs.

export default function Editor() {
  const navigate = useNavigate();
  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const hasSource = imageElement || videoElement;
  const seed = useStore(s => s.seed);
  const showBeforeAfter = useStore(s => s.showBeforeAfter);
  const setBeforeAfter = useStore(s => s.setBeforeAfter);
  const beforeAfterSplit = useStore(s => s.beforeAfterSplit);
  const setBeforeAfterSplit = useStore(s => s.setBeforeAfterSplit);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const mosh = useStore(s => s.mosh);
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const isPerformanceMode = useStore(s => s.isPerformanceMode);
  const setPerformanceMode = useStore(s => s.setPerformanceMode);
  const saveSlot = useStore(s => s.saveSlot);
  const loadSlot = useStore(s => s.loadSlot);
  const rerollSeed = useStore(s => s.rerollSeed);
  const layers = useStore(s => s.layers);
  const sourceName = useStore(s => s.sourceName);
  const flashSlot = useStore(s => s.flashSlot);
  const tileMode = useStore(s => s.tileMode);
  const videoStream = useStore(s => s.videoStream);
  const isCameraLive = !!videoStream;

  
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hideUI, setHideUI] = useState(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const [shortcutsHint, setShortcutsHint] = useState(false);
  const [slotShake, setSlotShake] = useState<number | null>(null);
  const isFullscreen = isPerformanceMode;
  const [isRecording, setIsRecording] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const [micFlash, setMicFlash] = useState<null | { on: boolean; key: number }>(null);
  const [bpmFlash, setBpmFlash] = useState<null | { bpm: number; key: number }>(null);
  const [iconFlash, setIconFlash] = useState<null | { icon: "freeze" | "reverse" | "loop"; label: string; key: number }>(null);
  const [reverseOn, setReverseOn] = useState(false);
  const [loopSec, setLoopSec] = useState(0);
  const [freezeOn, setFreezeOn] = useState(false);
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const recCapRef = useRef<number | null>(null);
  const paywall = usePaywall();
  useCloudFavorites();
  const recStartRef = useRef(0);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const shellRef = useRef<HTMLElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [showFirstTip, setShowFirstTip] = useState(false);
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [showMicHint, setShowMicHint] = useState(false);
  const [showPerfHint, setShowPerfHint] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);
  const prevImageRef = useRef<HTMLImageElement | null>(null);

  useFullscreenSync();

  const idleHidden = useIdleHide(5000);
  const loadDroppedImage = useCallback(async (file: File) => {
    const ok = await loadImageFile(file);
    if (ok) toast.success("Image loaded — moshing…");
  }, []);

  /* A preset arriving on the URL.
     This is what makes a look shareable, bookmarkable as a VJ cue, and usable
     as an OBS browser source. Applied once on mount and then stripped from the
     address bar, so a later mosh doesn't leave a stale link behind that no
     longer describes what is on screen. */
  useEffect(() => {
    const payload = presetFromUrl();
    if (!payload) return;
    if (useStore.getState().applyPreset(payload)) {
      toast.success(`Preset loaded — ${payload.layers.length} layers`);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete(PRESET_PARAM);
        window.history.replaceState({}, "", url.toString());
      } catch {}
    }
  }, []);

  const copyPresetLink = useCallback(async () => {
    if (!useStore.getState().layers.length) {
      toast.error("Nothing to share yet — mosh something first");
      return;
    }
    const link = useStore.getState().presetLink();
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Preset link copied", { description: "Opens this exact look anywhere" });
    } catch {
      // Clipboard is permission-gated and blocked outright in some embeds;
      // showing the link still lets the user copy it by hand.
      toast.message("Preset link", { description: link, duration: 12000 });
    }
  }, []);

  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      if (await loadImageFromClipboard(e)) {
        e.preventDefault();
        toast.success("Pasted image — moshing…");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);


  // Plain browser fullscreen (kills the Chrome chrome) — independent of
  // Performance Mode so the mosh icons stay visible.
  const [isBrowserFs, setIsBrowserFs] = useState<boolean>(
    typeof document !== "undefined" && !!(document.fullscreenElement || (document as any).webkitFullscreenElement)
  );
  useEffect(() => {
    const on = () => setIsBrowserFs(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on as any);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on as any);
    };
  }, []);
  const toggleFullscreen = useCallback(async () => {
    const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
    try {
      if (fsEl) await exitFullscreen();
      else await enterFullscreen(document.documentElement);
    } catch {}
  }, []);


  const getCanvas = () =>
    (canvasContainerRef.current?.querySelector("canvas") ?? null) as HTMLCanvasElement | null;

  const exportBestStill = useCallback(async () => {
    if (exportBusy) return;
    const c = getCanvas();
    if (!c) return;
    setExportBusy(true);
    setExportProgress(0.01);
    try {
      const best = await captureBestFrame(c, {
        durationMs: tileMode === "none" ? 1200 : 3600,
        intervalMs: 80,
        sampleSize: 128,
        preferSeamless: tileMode !== "none",
        onProgress: setExportProgress,
      });
      setExportProgress(1);
      const remastered = await remasterCanvas(best, tileMode === "none" ? 2 : 3);
      const blob = await exportCanvas(remastered, { format: "png", scale: 1, aspect: null });
      const filename = `mosh-${Date.now()}_${tileMode === "none" ? "still" : "tileable-remaster"}.png`;
      shareOrDownload(blob, filename);
      toast.success(tileMode === "none" ? "Still ready" : "Best seamless frame ready", {
        description: canNativeShare() ? "Share sheet opening…" : "Saved to downloads",
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setExportBusy(false);
      setExportProgress(0);
    }
  }, [exportBusy, tileMode]);

  // Enter/exit perf mode side effects
  const enterPerf = async () => {
    setPerformanceMode(true);
    await enterFullscreen(shellRef.current);
  };
  const exitPerf = async () => {
    setPerformanceMode(false);
    await exitFullscreen();
  };
  const togglePerf = () => {
    if (useStore.getState().isPerformanceMode) exitPerf(); else enterPerf();
  };

  // First-time tooltip
  useEffect(() => {
    if (!hasSource) return;
    if (hasSeenPerfMode()) return;
    const id = window.setTimeout(() => setShowFirstTip(true), 1500);
    return () => window.clearTimeout(id);
  }, [hasSource]);

  // Source-load film cut transition + onboarding abort
  useEffect(() => {
    if (hasSource && (imageElement ?? videoElement) !== prevImageRef.current) {
      setTransitionKey(k => k + 1);
      setOnboardingActive(false);
    }
    prevImageRef.current = (imageElement ?? videoElement) as any;
  }, [imageElement, videoElement, hasSource]);

  // Onboarding (first session, no image yet)
  useEffect(() => {
    if (hasSource) return;
    if (!shouldShowOnboarding()) return;
    setOnboardingActive(true);
  }, [hasSource]);

  // Page title
  useEffect(() => {
    const base = "ETHER-MOSH!";
    document.title = isPerformanceMode
      ? "●"
      : sourceName ? `${sourceName} – ${base}` : base;
    return () => { document.title = base; };
  }, [isPerformanceMode, sourceName]);

  // beforeunload guard when there's unsaved work
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = useStore.getState().layers.length > 0;
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "You have an unsaved session. Leave anyway?";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // 30s feature-discovery hints
  useEffect(() => {
    const micT = window.setTimeout(() => {
      if (!useStore.getState().micEnabled && !isHintDismissed("cathedral_hint_mic")) {
        setShowMicHint(true);
        window.setTimeout(() => { setShowMicHint(false); dismissHint("cathedral_hint_mic"); }, 2200);
      }
    }, 30_000);
    const perfT = window.setTimeout(() => {
      if (!useStore.getState().isPerformanceMode && !isHintDismissed("cathedral_hint_perf")) {
        setShowPerfHint(true);
        window.setTimeout(() => { setShowPerfHint(false); dismissHint("cathedral_hint_perf"); }, 2200);
      }
    }, 30_000);
    return () => { window.clearTimeout(micT); window.clearTimeout(perfT); };
  }, []);

  // Dismiss hints when feature is used
  useEffect(() => { if (micEnabled) { setShowMicHint(false); dismissHint("cathedral_hint_mic"); } }, [micEnabled]);
  useEffect(() => { if (isPerformanceMode) { setShowPerfHint(false); dismissHint("cathedral_hint_perf"); } }, [isPerformanceMode]);

  // Recording elapsed timer
  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => {
      setRecElapsed((performance.now() - recStartRef.current) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [isRecording]);

  // Auto-shuffle driver — beat-locked when audio is active, timed otherwise.
  // Always mounted so the HotTriggers shuffle toggle keeps firing even when
  // the menu rack (and ShufflePanel) is hidden.
  const shuffleSec = useStore(s => s.shuffleSec);
  useEffect(() => {
    if (shuffleSec == null) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let beatsSinceMosh = 0;
    let targetBeats = 0;
    let lastMoshAt = performance.now();

    // Recompute target beats from the current tempo so shuffleSec maps to a
    // musically meaningful number of beats (min 1).
    const recomputeTargetBeats = () => {
      const bpm = useStore.getState().bpm || 120;
      targetBeats = Math.max(1, Math.round((shuffleSec * bpm) / 60));
    };
    recomputeTargetBeats();

    const isAudioActive = () => {
      const s = useStore.getState();
      return s.micEnabled || s.systemAudioEnabled;
    };

    const fire = () => {
      if (cancelled) return;
      useStore.getState().mosh();
      beatsSinceMosh = 0;
      lastMoshAt = performance.now();
      recomputeTargetBeats();
      scheduleFallback();
    };

    // Fallback so shuffle still fires when audio is silent, disabled, or
    // beats aren't landing. Uses 1.6× shuffleSec as a soft ceiling when
    // audio is present, or exactly shuffleSec when it isn't.
    const scheduleFallback = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      const factor = isAudioActive() ? 1.6 : 1.0;
      timeoutId = window.setTimeout(fire, shuffleSec * 1000 * factor);
    };

    const onBeat = () => {
      if (cancelled) return;
      if (!isAudioActive()) return; // let the fallback timer own timing
      // Ignore beats that fire suspiciously fast after a mosh (protects
      // against transient onset bursts right after a scene change).
      if (performance.now() - lastMoshAt < 120) return;
      beatsSinceMosh += 1;
      if (beatsSinceMosh >= targetBeats) fire();
    };

    window.addEventListener("aegis:beat", onBeat);
    scheduleFallback();
    return () => {
      cancelled = true;
      window.removeEventListener("aegis:beat", onBeat);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [shuffleSec]);

  // ── Smart AI director (supporter feature) ─────────────────────────────
  // Offline, no network. Reads camera motion + audio bands and picks
  // moshes that fit the current vibe. Turns off auto-shuffle while active.
  const [smartOn, setSmartOn] = useState(false);
  const [smartFlashKey, setSmartFlashKey] = useState(0);
  const smartRef = useRef<SmartDirector | null>(null);
  const smartPrevShuffleRef = useRef<number | null>(null);

  const toggleSmart = useCallback(() => {
    if (!paywall.isSupporter) {
      paywall.require("Smart AI director");
      return;
    }
    setSmartOn(v => !v);
  }, [paywall]);

  useEffect(() => {
    if (!smartOn) return;
    // Suspend auto-shuffle for the duration; restore on exit.
    smartPrevShuffleRef.current = useStore.getState().shuffleSec;
    if (smartPrevShuffleRef.current != null) useStore.getState().setShuffleSec(null);

    const director = new SmartDirector({
      getVideo: () => useStore.getState().videoElement,
      onMosh: (composed) => {
        useStore.getState().moshDirected(composed);
        setSmartFlashKey(performance.now());
      },
    });
    smartRef.current = director;
    director.start();

    return () => {
      director.stop();
      smartRef.current = null;
      // Restore prior auto-shuffle if it wasn't touched while smart mode ran.
      const cur = useStore.getState().shuffleSec;
      if (cur == null && smartPrevShuffleRef.current != null) {
        useStore.getState().setShuffleSec(smartPrevShuffleRef.current);
      }
      smartPrevShuffleRef.current = null;
    };
  }, [smartOn]);

  // If the user manually re-enables auto-shuffle, gracefully step out of smart mode.
  useEffect(() => {
    if (smartOn && shuffleSec != null) setSmartOn(false);
  }, [shuffleSec, smartOn]);

  // ── Reality Storm director (reactive AI warp) ─────────────────────────
  /**
   * Clear every effect and show the bare remastered source.
   *
   * Dropping the layers isn't enough on its own: auto-shuffle, the Smart
   * director and the Storm director each re-apply a mosh within seconds, so a
   * clear that doesn't stop them silently undoes itself.
   */
  const clearAllFx = useCallback(() => {
    useStore.getState().clearAllFx();   // layers + auto-shuffle
    setSmartOn(false);
    setStormOn(false);
    toast.message("FX cleared — remastered source only", { duration: 1800 });
  }, []);

  const [stormOn, setStormOn] = useState(false);
  const [stormFlashKey, setStormFlashKey] = useState(0);
  const stormRef = useRef<StormDirector | null>(null);

  const toggleStorm = useCallback(() => { setStormOn(v => !v); }, []);

  useEffect(() => {
    if (!stormOn) return;
    if (useStore.getState().shuffleSec != null) useStore.getState().setShuffleSec(null);
    setSmartOn(false);

    const storm = new StormDirector({
      getVideo: () => useStore.getState().videoElement,
      onStorm: (ids, o) => {
        useStore.getState().moshStorm(ids, { explosive: o.explosive, regions: o.regions });
        setStormFlashKey(performance.now());
      },
      onTimeWarp: () => { try { timeController.triggerFreeze(320); } catch {} },
    });
    stormRef.current = storm;
    storm.start();

    return () => { storm.stop(); stormRef.current = null; };
  }, [stormOn]);

  useEffect(() => {
    if (stormOn && (smartOn || shuffleSec != null)) setStormOn(false);
  }, [smartOn, shuffleSec, stormOn]);



  const takeScreenshot = async () => {
    const c = getCanvas();
    if (!c) return;
    try {
      // Free tier caps export at 720px on the long edge. Supporters get full res.
      const longEdge = Math.max(c.width, c.height);
      const scale = paywall.isSupporter ? 1 : Math.min(1, 720 / longEdge);
      const blob = await exportCanvas(c, { format: "png", scale, aspect: null });
      const filename = `mosh-${Date.now()}.png`;
      shareOrDownload(blob, filename);
      toast.success(paywall.isSupporter ? "Screenshot ready" : "Screenshot ready (720p · unlock for full res)", {
        description: canNativeShare() ? "Share sheet opening…" : "Saved to downloads",
      });
    } catch (e) {
      toast.error("Screenshot failed");
    }
  };

  const shareCurrent = useCallback(async () => {
    const c = getCanvas();
    if (!c) { shareApp(); return; }
    try {
      const longEdge = Math.max(c.width, c.height);
      const scale = Math.min(1, 1440 / longEdge);
      const blob = await exportCanvas(c, { format: "jpg", scale, aspect: null, quality: 0.9 });
      const shared = await shareBlob(blob, `mosh-${Date.now()}.jpg`, {
        title: "MOSH",
        text: "made with MOSH — brutalist webgl visualizer",
        url: window.location.origin,
      });
      if (!shared) {
        // Web Share with files unavailable — fall back to URL share.
        await shareApp();
      }
    } catch {
      await shareApp();
    }
  }, []);

  const captureGif = useCallback(async () => {
    if (gifBusy) return;
    if (!paywall.require("Seamless GIF loop")) return;
    const c = getCanvas();
    if (!c) { toast.error("No visualizer to capture"); return; }
    setGifBusy(true);
    setGifProgress(0);
    // Pause auto-shuffle so the mosh effect stays locked during the 7s window.
    const prevShuffle = useStore.getState().shuffleSec;
    if (prevShuffle != null) useStore.getState().setShuffleSec(null);
    const t = toast.loading("Locking mosh · capturing seamless GIF…", { duration: 20_000 });
    try {
      const result = await captureLoopingGif(c, {
        durationMs: 7000,
        fps: 12,
        maxWidth: 480,
        onProgress: (phase, p) => {
          // Weight capture as 0..0.7, encode as 0.7..1
          setGifProgress(phase === "capture" ? p * 0.7 : 0.7 + p * 0.3);
        },
      });
      downloadBlob(result.blob, `mosh-${Date.now()}_loop.gif`);
      const quality = result.loopScore > 0.85 ? "tight loop" : result.loopScore > 0.6 ? "clean loop" : "loop";
      toast.success(`GIF saved · ${result.frameCount}f · ${quality}`, { id: t });
    } catch (e) {
      toast.error("GIF capture failed", { id: t });
    } finally {
      if (prevShuffle != null) useStore.getState().setShuffleSec(prevShuffle);
      setGifBusy(false);
      setGifProgress(0);
    }
  }, [gifBusy, paywall]);


  const toggleRecord = async () => {
    const c = getCanvas();
    if (!c) return;
    if (!CanvasRecorder.isSupported()) {
      toast.error("Recording not supported in this browser");
      return;
    }
    if (!recorderRef.current) recorderRef.current = new CanvasRecorder();
    const rec = recorderRef.current;
    if (rec.state === "idle") {
      try {
        rec.start(c, 30);
        recStartRef.current = performance.now();
        setRecElapsed(0);
        setIsRecording(true);
        if (paywall.isSupporter) {
          toast.success("Recording started · Shift+R to stop");
        } else {
          toast.success("Recording started · 15s free cap · Shift+R to stop early");
          if (recCapRef.current) window.clearTimeout(recCapRef.current);
          recCapRef.current = window.setTimeout(() => {
            recCapRef.current = null;
            if (recorderRef.current?.state === "recording") {
              toast("15s free cap reached — unlock supporter for longer clips", {
                action: { label: "Unlock", onClick: () => paywall.purchase() },
              });
              toggleRecord();
            }
          }, 15_000);
        }
      } catch (e) {
        toast.error("Could not start recording");
      }
    } else {
      try {
        if (recCapRef.current) { window.clearTimeout(recCapRef.current); recCapRef.current = null; }
        const blob = await rec.stop();
        setIsRecording(false);
        const filename = `mosh-${Date.now()}.${rec.extension()}`;
        shareOrDownload(blob, filename);
        toast.success("Recording ready", {
          duration: 10000,
          description: canNativeShare()
            ? "Share sheet opening — post to TikTok, Instagram, Snapchat…"
            : "Saved to downloads",
        });
      } catch (e) {
        toast.error("Could not stop recording");
        setIsRecording(false);
      }
    }
  };


  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));

      // Cmd/Ctrl+K — palette (works even when palette open via toggle? we close instead)
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }

      // While in form fields, allow nothing else
      if (inField) return;

      // Modal-aware: when palette/shortcuts open, only allow Escape
      const paletteIsOpen = paletteOpen;
      const shortcutsIsOpen = shortcutsOpen;
      if (e.key === "Escape") {
        if (paletteIsOpen) { e.preventDefault(); setPaletteOpen(false); return; }
        if (shortcutsIsOpen) { e.preventDefault(); setShortcutsOpen(false); return; }
        if (useStore.getState().isPerformanceMode) { e.preventDefault(); exitPerf(); return; }
        return;
      }
      if (paletteIsOpen || shortcutsIsOpen) return;

      // ? => shortcuts overlay
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen(s => !s);
        return;
      }

      // Cmd/Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z" || e.key === "Z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (e.key === "y" || e.key === "Y") { e.preventDefault(); redo(); return; }
        if (e.key === "s" || e.key === "S") { e.preventDefault(); toast.message("Save preset — coming soon"); return; }
        if (e.key === "l" || e.key === "L") { e.preventDefault(); copyPresetLink(); return; }
        if (e.key === "e" || e.key === "E") { e.preventDefault(); exportBestStill(); return; }
        return; // don't override other browser shortcuts
      }

      // Slot save/recall on digits 1-9
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (e.shiftKey) {
          saveSlot(idx);
          toast.success(`Saved to slot ${idx + 1}`);
        } else {
          const ok = loadSlot(idx);
          if (!ok) {
            setSlotShake(idx);
            window.setTimeout(() => setSlotShake(null), 350);
          } else {
            flashSlot(idx);
            window.setTimeout(() => flashSlot(null), 1200);
          }
        }
        return;
      }

      // Single-key Space => reroll seed
      if (e.code === "Space" && !e.shiftKey) {
        e.preventDefault();
        rerollSeed();
        return;
      }

      // ————————————— Hot-trigger single-key shortcuts —————————————
      // Mnemonic mapping — matches the icon rack in the top-right corner.
      //   R = Record · M = Mic · A = Auto-shuffle · X = mosh (eXplode)
      //   S = Save favorite · Shift+S = open favorites list
      //   Z = freeZe · C = Capture (screenshot) · P/F = Perf · H = Hide UI

      // M => mic toggle
      if (!e.shiftKey && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        const next = !useStore.getState().micEnabled;
        setMicEnabled(next);
        setMicFlash({ on: next, key: performance.now() });
        return;
      }
      // R => recording
      if (!e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        toggleRecord();
        return;
      }
      // A => auto-shuffle toggle (default 5s)
      if (!e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        const cur = useStore.getState().shuffleSec;
        useStore.getState().setShuffleSec(cur == null ? 5 : null);
        return;
      }
      // X => mosh / randomize
      if (!e.shiftKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        mosh();
        return;
      }
      // S => save current mosh as favorite
      if (!e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        useStore.getState().saveFavorite();
        return;
      }
      // Z => freeze / slow-mo
      if (!e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        timeController.triggerFreeze(1400);
        setFreezeOn(true);
        window.setTimeout(() => setFreezeOn(false), 1400);
        setIconFlash({ icon: "freeze", label: "Freeze", key: performance.now() });
        return;
      }
      // C => capture screenshot
      if (!e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        takeScreenshot();
        return;
      }
      // G => GIF loop capture (7s seamless)
      if (!e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        captureGif();
        return;
      }
      // I => Smart AI director (supporter unlock)
      if (!e.shiftKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleSmart();
        return;
      }

      // P / F => toggle Performance Mode
      if (!e.shiftKey && (e.key === "p" || e.key === "P" || e.key === "f" || e.key === "F")) {
        e.preventDefault();
        togglePerf();
        return;
      }

      // H => toggle UI hide / peek
      if (!e.shiftKey && (e.key === "h" || e.key === "H")) {
        if (!useStore.getState().isPerformanceMode) {
          e.preventDefault();
          setHideUI(v => !v);
        }
        return;
      }

      // ————————————— Shift combos —————————————
      if (e.shiftKey && (e.key === "M" || e.key === "m")) { e.preventDefault(); mosh(); return; }
      if (e.shiftKey && (e.key === "I" || e.key === "i")) {
        e.preventDefault();
        const next = !useStore.getState().micEnabled;
        setMicEnabled(next);
        setMicFlash({ on: next, key: performance.now() });
        return;
      }
      if (e.shiftKey && (e.key === "V" || e.key === "v")) { e.preventDefault(); toggleRecord(); return; }
      if (e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); takeScreenshot(); return; }
      if (e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mosh:toggle-favorites"));
        return;
      }
      if (e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mosh:cycle-shuffle"));
        return;
      }
      if (e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        timeController.triggerFreeze(1400);
        setFreezeOn(true);
        window.setTimeout(() => setFreezeOn(false), 1400);
        setIconFlash({ icon: "freeze", label: "Freeze", key: performance.now() });
        return;
      }
      if (e.shiftKey && (e.key === "R" || e.key === "r")) {
        e.preventDefault();
        const on = timeController.toggleReverse();
        setReverseOn(on);
        setIconFlash({ icon: "reverse", label: on ? "Reverse" : "Forward", key: performance.now() });
        return;
      }
      if (e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        const on = timeController.toggleLoop(8);
        setLoopSec(on ? 8 : 0);
        setIconFlash({ icon: "loop", label: on ? "Loop · 8s" : "Loop Off", key: performance.now() });
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mosh, undo, redo, setMicEnabled, paletteOpen, shortcutsOpen, saveSlot, loadSlot, rerollSeed, flashSlot, exportBestStill, captureGif]);

  // First-load shortcuts hint (3s)
  useEffect(() => {
    try {
      if (localStorage.getItem("cathedral_seen_shortcuts_hint") === "1") return;
      setShortcutsHint(true);
      const id = window.setTimeout(() => {
        setShortcutsHint(false);
        try { localStorage.setItem("cathedral_seen_shortcuts_hint", "1"); } catch {}
      }, 3000);
      return () => window.clearTimeout(id);
    } catch {}
  }, []);

  // Auto-hide icon flash
  useEffect(() => {
    if (!iconFlash) return;
    const id = window.setTimeout(() => setIconFlash(null), 700);
    return () => window.clearTimeout(id);
  }, [iconFlash]);

  // Auto-hide mic flash after 500ms
  useEffect(() => {
    if (!micFlash) return;
    const id = window.setTimeout(() => setMicFlash(null), 500);
    return () => window.clearTimeout(id);
  }, [micFlash]);

  // Listen for auto-detected BPM and surface a brief toast/flash
  useEffect(() => {
    const onBpm = (e: Event) => {
      const detail = (e as CustomEvent<{ bpm: number }>).detail;
      if (!detail) return;
      setBpmFlash({ bpm: detail.bpm, key: performance.now() });
    };
    window.addEventListener("aegis:bpm-detected", onBpm);
    return () => window.removeEventListener("aegis:bpm-detected", onBpm);
  }, []);

  // Mobile gesture: swipe-up requests UI hide toggle
  useEffect(() => {
    const onToggleUI = () => setHideUI(v => !v);
    window.addEventListener("aegis:toggle-ui", onToggleUI);
    return () => window.removeEventListener("aegis:toggle-ui", onToggleUI);
  }, []);

  // Long-press (1.5s) anywhere on the visualizer toggles the menu rack.
  // Listens on window after pointerdown so iOS/Safari can't drop move/up events
  // even when overlays (MobileGestures, Kaoss) capture the pointer.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    let timer: number | null = null;
    let raf = 0;
    let startedAt = 0;
    let startX = 0, startY = 0;
    let activeId: number | null = null;
    const HOLD_MS = 750;

    const detachWindow = () => {
      window.removeEventListener("pointermove", onMoveWin);
      window.removeEventListener("pointerup", onEndWin);
      window.removeEventListener("pointercancel", onEndWin);
    };
    const cancel = () => {
      if (timer) { window.clearTimeout(timer); timer = null; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      activeId = null;
      detachWindow();
      setHoldProgress(0);
    };
    const tick = () => {
      const p = Math.min(1, (performance.now() - startedAt) / HOLD_MS);
      setHoldProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const onMoveWin = (e: PointerEvent) => {
      if (activeId !== null && e.pointerId !== activeId) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (dx * dx + dy * dy > 18 * 18) cancel();
    };
    const onEndWin = (e: PointerEvent) => {
      if (activeId !== null && e.pointerId !== activeId) return;
      cancel();
    };
    const onDown = (e: PointerEvent) => {
      if (timer) return; // already tracking
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("button, a, input, textarea, [role='slider'], [data-no-longpress]")) return;
      activeId = e.pointerId;
      startedAt = performance.now();
      startX = e.clientX; startY = e.clientY;
      setHoldProgress(0.001);
      raf = requestAnimationFrame(tick);
      timer = window.setTimeout(() => {
        setHideUI(v => !v);
        try { if ("vibrate" in navigator) (navigator as any).vibrate?.(12); } catch {}
        cancel();
      }, HOLD_MS);
      window.addEventListener("pointermove", onMoveWin, { passive: true });
      window.addEventListener("pointerup", onEndWin, { passive: true });
      window.addEventListener("pointercancel", onEndWin, { passive: true });
    };
    el.addEventListener("pointerdown", onDown);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", onDown);
    };
  }, []);

  // First mic-enable: auto-map a few obvious effect params so the user instantly
  // sees audio→visual linkage.
  useEffect(() => {
    if (!micEnabled) return;
    try {
      if (localStorage.getItem("cathedral_seen_audio_defaults") === "1") return;
    } catch {}
    const state = useStore.getState();
    const setAudioMap = state.setAudioMap;
    const layers = state.layers;
    const defaults: Array<{ effect: string; param: string; map: { source: "bass"|"mid"|"treble"|"overall"|"beat"; amount: number; smoothing: number } }> = [
      { effect: "pixelSort",  param: "amount",    map: { source: "bass",   amount: 0.6, smoothing: 0.3 } },
      { effect: "pixelSort",  param: "threshold", map: { source: "bass",   amount: 0.6, smoothing: 0.3 } },
      { effect: "datamosh",   param: "amount",    map: { source: "beat",   amount: 0.8, smoothing: 0.0 } },
      { effect: "datamosh",   param: "scale",     map: { source: "beat",   amount: 0.8, smoothing: 0.0 } },
      { effect: "hueRotate",  param: "amount",    map: { source: "treble", amount: 0.4, smoothing: 0.5 } },
      { effect: "rgbShift",   param: "amount",    map: { source: "treble", amount: 0.4, smoothing: 0.5 } },
      { effect: "rainbowMap", param: "amount",    map: { source: "treble", amount: 0.4, smoothing: 0.5 } },
      { effect: "duotone",    param: "amount",    map: { source: "treble", amount: 0.4, smoothing: 0.5 } },
      { effect: "vhsBleed",   param: "amount",    map: { source: "treble", amount: 0.4, smoothing: 0.5 } },
    ];
    let count = 0;
    const seen = new Set<string>();
    for (const l of layers) {
      for (const d of defaults) {
        if (l.effectId !== d.effect) continue;
        if (l.params[d.param] === undefined) continue;
        if (seen.has(l.effectId)) continue;
        seen.add(l.effectId);
        setAudioMap(l.id, d.param, d.map);
        count++;
        break;
      }
    }
    try { localStorage.setItem("cathedral_seen_audio_defaults", "1"); } catch {}
  }, [micEnabled]);

  useEffect(() => {
    if (!bpmFlash) return;
    const id = window.setTimeout(() => setBpmFlash(null), 1800);
    return () => window.clearTimeout(id);
  }, [bpmFlash]);

  // Editor renders even with no source — GlCanvas falls back to procedural ambient.

  return (
    <main
      ref={shellRef}
      className={`editor-shell bg-background text-foreground ${
        isPerformanceMode
          ? "fixed inset-0 z-[9999] flex flex-col overflow-hidden"
          : "min-h-screen flex flex-col"
      }`}
    >
      <Helmet>
        <title>Editor — MOSH</title>
        <meta name="description" content="Stack GPU effects, map audio to parameters, and perform live in the MOSH visual editor." />
        <link rel="canonical" href="https://ether-mosh.lovable.app/edit" />
        <meta property="og:title" content="MOSH Editor — Real-time visual instrument" />
        <meta property="og:description" content="Stack 59 GPU effects, sync to audio, export stills and video." />
        <meta property="og:url" content="https://ether-mosh.lovable.app/edit" />
      </Helmet>
      <h1 className="sr-only">MOSH Editor</h1>
      {/* Canvas — fills the viewport by default. All menu UI lives below the fold. */}
      <div
        ref={canvasContainerRef}
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          e.preventDefault();
          loadDroppedImage(file);
        }}
        onPointerDown={(e) => {
          // Cmd/Ctrl-click → ripple (Performance Mode only)
          if (useStore.getState().isPerformanceMode && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            (window as any).__aegisRippleUntil = performance.now() + 800;
            window.dispatchEvent(new CustomEvent("aegis:ripple", { detail: { x, y } }));
            return;
          }
          // Shift+drag → intensity boost (Performance Mode only)
          if (useStore.getState().isPerformanceMode && e.shiftKey) {
            e.preventDefault();
            const startY = e.clientY;
            const state = useStore.getState();
            const top = [...state.layers].reverse().find(l => !l.hidden);
            if (!top) return;
            const param = top.params["amount"] !== undefined ? "amount" : Object.keys(top.params)[0];
            if (!param) return;
            const baseline = top.params[param];
            const onMove = (ev: PointerEvent) => {
              const dy = startY - ev.clientY;
              const rect2 = (canvasContainerRef.current as HTMLElement).getBoundingClientRect();
              const frac = Math.max(-1, Math.min(1, dy / Math.max(1, rect2.height * 0.5)));
              useStore.getState().setParam(top.id, param, baseline + frac);
            };
            const onUp = () => {
              useStore.getState().setParam(top.id, param, baseline);
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            return;
          }
          if (e.shiftKey) { e.preventDefault(); mosh(); }
        }}
        className={`relative bg-background select-none w-full h-[100dvh] shrink-0 no-touch-scroll ${isCameraLive ? "live-ring" : ""}`}

        title="Shift+Click to MOSH"
      >
        <div data-tap-fade-target className="absolute inset-0 opacity-100">
          <GlCanvas />
        </div>
        {!hasSource && <StartCameraOverlay />}
        <SystemAudioHud visible={systemAudioEnabled} />
        {hasSource && (
          <QuadrantSurface onTogglePerf={togglePerf} />
        )}
        <TrackpadGestures
          targetRef={canvasContainerRef}
          onTogglePerf={togglePerf}
          onMicFlash={(on) => setMicFlash({ on, key: performance.now() })}
        />
        <KaossSurface />
        <RippleLayer />
        <SourceTransition trigger={transitionKey} />
        
        {/* TapToBegin removed — StartCameraOverlay is the live-first empty state and TapToBegin's centered button used to intercept clicks meant for "go live". */} 
        {!isPerformanceMode && (
          <HotTriggers
            isRecording={isRecording}
            onToggleRecord={toggleRecord}
            onScreenshot={takeScreenshot}
            onGif={captureGif}
            onShare={shareCurrent}
            onSupport={() => navigate("/pricing")}
            gifBusy={gifBusy}
            gifProgress={gifProgress}
            onFreeze={() => {
              timeController.triggerFreeze(1400);
              setFreezeOn(true);
              window.setTimeout(() => setFreezeOn(false), 1400);
              setIconFlash({ icon: "freeze", label: "Freeze", key: performance.now() });
            }}
            onMicFlash={(on) => setMicFlash({ on, key: performance.now() })}
            smartOn={smartOn}
            smartLocked={!paywall.isSupporter}
            onToggleSmart={toggleSmart}
            stormOn={stormOn}
            onToggleStorm={toggleStorm}
            isFullscreen={isBrowserFs}
            onToggleFullscreen={toggleFullscreen}
            onClearFx={clearAllFx}
            hasFx={layers.length > 0 || shuffleSec != null || smartOn || stormOn}
            onHome={() => {
              if (isRecording) { try { toggleRecord(); } catch {} }
              try { useStore.getState().reset(); } catch {}
              try { useStore.getState().clearVideoSource(); } catch {}
              try { useStore.getState().clearImage(); } catch {}
              navigate("/");
            }}
            dimmed={idleHidden}
          />
        )}
        {stormOn && (
          <div
            key={stormFlashKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 animate-[smartFlash_420ms_ease-out_forwards]"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(var(--accent) / 0.16), transparent 60%)",
              mixBlendMode: "screen",
            }}
          />
        )}
        {!isPerformanceMode && !hideUI && (
          <div className={`absolute top-3 right-3 z-40 pointer-events-auto transition-opacity duration-500 ${idleHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
            <AccountChip />
          </div>
        )}
        {onboardingActive && !hasSource && (
          <OnboardingPrompts onComplete={() => { setOnboardingActive(false); markOnboardingSeen(); }} />
        )}
        {showBeforeAfter && (
          <input
            type="range" min={0} max={1} step={0.001} value={beforeAfterSplit}
            onChange={(e) => setBeforeAfterSplit(+e.target.value)}
            className="absolute left-1/2 -translate-x-1/2 bottom-6 w-2/3 accent-primary z-30"
          />
        )}
        {isPerformanceMode && (
          <PerformanceOverlay isRecording={isRecording} onExit={exitPerf} />
        )}
        {showFirstTip && !isPerformanceMode && (
          <PerformanceTooltip onDismiss={() => { setShowFirstTip(false); markPerfModeSeen(); }} />
        )}

        {/* Long-press affordance — appears while finger is held, fills as a ring */}
        {holdProgress > 0 && !isPerformanceMode && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex flex-col items-center gap-2.5 motion-reduce:animate-none"
            style={{
              animation: "holdRingIn 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both",
              opacity: 0.4 + holdProgress * 0.6,
            }}
          >
            <div
              className="relative grid place-items-center rounded-full"
              style={{
                width: 56,
                height: 56,
                background: "radial-gradient(circle, hsl(var(--surface-1) / 0.85) 0%, hsl(var(--surface-1) / 0.55) 60%, transparent 100%)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                boxShadow: holdProgress > 0.6
                  ? `0 0 ${12 + holdProgress * 18}px hsl(var(--primary) / ${0.25 + holdProgress * 0.35})`
                  : "none",
                transform: `scale(${0.92 + holdProgress * 0.12})`,
                transition: "box-shadow 80ms linear",
              }}
            >
              <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="hsl(var(--border-default))"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
                <circle
                  cx="18" cy="18" r="15.5"
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 15.5}
                  strokeDashoffset={(1 - holdProgress) * 2 * Math.PI * 15.5}
                  style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.7))" }}
                />
              </svg>
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: "hsl(var(--primary))",
                  opacity: 0.5 + holdProgress * 0.5,
                  boxShadow: `0 0 ${4 + holdProgress * 8}px hsl(var(--primary))`,
                }}
              />
            </div>
            <div
              className="font-mono text-[10px] uppercase tracking-[0.32em]"
              style={{
                color: "hsl(var(--text-secondary))",
                textShadow: "0 1px 6px rgba(0,0,0,0.65)",
              }}
            >
              {hideUI ? "hold to reveal controls" : "hold to hide controls"}
            </div>
            <style>{`
              @keyframes holdRingIn {
                from { opacity: 0; transform: translateY(6px); }
                to   { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>
        )}
        {/* (idle "hold for controls" hint removed per design — discovery is implicit) */}

      </div>

      {/* Unified menu rack — utility bar + tabs + panel. Lives below the fold. */}
      {!isFullscreen && !hideUI && (
        <div className="relative z-10 flex flex-col border-t border-[hsl(var(--border-default))] bg-[hsl(var(--surface-1)/0.92)] backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
          {/* Thin utility bar */}
          <div className="flex h-10 items-center justify-between gap-2 border-b border-[hsl(var(--border-default))] px-2">
            <div className="flex items-center gap-1">
              <button onClick={() => navigate("/")} className="btn-icon h-7 w-7" aria-label="back" title="Back">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <div className="ml-1 hidden truncate font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--text-secondary))] sm:block">
                seed · <span className="text-[hsl(var(--text-primary))]">{seed}</span>
              </div>
              <div className="ml-2 hidden sm:block">
                <SlotIndicator onLoad={(i) => loadSlot(i)} />
              </div>
              <div className="ml-1">
                <CameraMenu />
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="btn-icon h-7 w-7 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="undo"
                aria-disabled={!canUndo}
                title="Undo (⌘Z)"
              >
                <Undo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="btn-icon h-7 w-7 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="redo"
                aria-disabled={!canRedo}
                title="Redo (⌘Y)"
              >
                <Redo2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button
                onMouseDown={() => setBeforeAfter(true)}
                onMouseUp={() => setBeforeAfter(false)}
                onMouseLeave={() => setBeforeAfter(false)}
                onTouchStart={() => setBeforeAfter(true)}
                onTouchEnd={() => setBeforeAfter(false)}
                className="btn-icon h-7 w-7"
                data-active={showBeforeAfter}
                aria-label="before/after"
                title="Hold for before/after"
              >
                <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <div className="mx-1 h-5 w-px bg-[hsl(var(--border-default))]" />
              <div className="relative">
                <button
                  onClick={() => {
                    const next = !useStore.getState().micEnabled;
                    setMicEnabled(next);
                    setMicFlash({ on: next, key: performance.now() });
                  }}
                  className="btn-icon h-7 w-7"
                  data-active={micEnabled}
                  aria-label="listen mode"
                  title="Listen Mode (Shift+I)"
                >
                  {micEnabled ? <Mic className="h-3.5 w-3.5" strokeWidth={1.5} /> : <MicOff className="h-3.5 w-3.5" strokeWidth={1.5} />}
                </button>
                {showMicHint && <HintPulse storageKey="cathedral_hint_mic" />}
              </div>
              <button
                onClick={() => {
                  const wasOff = !useStore.getState().systemAudioEnabled;
                  toggleSystemAudio();
                  if (wasOff) setMicFlash({ on: true, key: performance.now() });
                }}
                className="btn-icon h-7 w-7"
                data-active={systemAudioEnabled}
                aria-label="route device audio"
                title="Route device audio (tab / system)"
                style={systemAudioEnabled ? {
                  boxShadow: "0 0 0 2px #00ffff, 0 0 12px rgba(0,255,255,0.6)",
                  borderRadius: 6,
                } : undefined}
              >
                <MonitorSpeaker className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <div className="mx-1 h-5 w-px bg-[hsl(var(--border-default))]" />
              <button
                onClick={() => setShortcutsOpen(s => !s)}
                className="btn-icon h-7 w-7"
                data-active={shortcutsOpen}
                aria-label="keyboard shortcuts"
                title="Keyboard shortcuts (?)"
              >
                <Keyboard className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <div className="relative">
                <button
                  onClick={enterPerf}
                  className="btn-icon h-7 w-7"
                  aria-label="performance mode"
                  title="Performance Mode (P)"
                  data-perf-trigger
                >
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                {showPerfHint && <HintPulse storageKey="cathedral_hint_perf" />}
              </div>
              <div className="mx-1 h-5 w-px bg-[hsl(var(--border-default))]" />
              {/* Improved Export — gradient, glow, distinct shape */}
              <button
                onClick={exportBestStill}
                disabled={exportBusy}
                className="group relative ml-1 inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-sm border border-primary/60 bg-gradient-to-r from-primary/90 via-primary to-primary-glow px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.45)] transition hover:shadow-[0_0_28px_hsl(var(--primary)/0.7)] active:scale-95"
                title="Export (⌘E)"
              >
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{exportBusy ? `${Math.round(exportProgress * 100)}%` : "Export"}</span>
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </button>
            </div>
          </div>

          {/* Unified one-screen control stack — every section visible, no tabs. */}
          <div className="divide-y divide-[hsl(var(--border-subtle))]">
            <section>
              <div className="section-header">
                <h2>Layers</h2><div className="rule" />
                <span className="badge">{layers.length} active</span>
              </div>
              <LayerStack />
            </section>
            <section>
              <div className="section-header">
                <h2>FX</h2><div className="rule" />
                <span className="badge">tap to add</span>
              </div>
              <ShufflePanel />
              <FxPicker />
            </section>
            <section>
              <div className="section-header">
                <h2>Tune</h2><div className="rule" />
                <span className="badge">arrows · ←↑↓→</span>
              </div>
              <ParamDock />
            </section>
            <section>
              <div className="section-header">
                <h2>Beat &amp; Audio</h2><div className="rule" />
                <span className="badge">listen</span>
              </div>
              <BeatPanel />
            </section>
          </div>
        </div>
      )}


      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}

      <AboutTrigger hidden={hideUI || isPerformanceMode} />


      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onTogglePerf={togglePerf}
        onToggleUI={() => setHideUI(v => !v)}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onExport={exportBestStill}
        onCopyPresetLink={copyPresetLink}
        onSavePreset={() => toast.message("Save preset — coming soon")}
        onLoadPreset={() => toast.message("Load preset — coming soon")}
        onLoadImage={() => navigate("/")}
      />

      {shortcutsHint && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-sm border border-[hsl(var(--border-default))] bg-black/70 px-3 py-1.5 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-secondary))]">
            Press <kbd className="mx-1 rounded-sm border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-2))] px-1 text-[hsl(var(--text-primary))]">?</kbd> for shortcuts · <kbd className="mx-1 rounded-sm border border-[hsl(var(--border-default))] bg-[hsl(var(--surface-2))] px-1 text-[hsl(var(--text-primary))]">⌘K</kbd> for palette
          </span>
        </div>
      )}

      {slotShake !== null && (
        <div className="pointer-events-none fixed bottom-16 left-1/2 z-40 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-[hsl(var(--text-tertiary))]">
          Slot {slotShake + 1} empty
        </div>
      )}

    </main>
  );
}

