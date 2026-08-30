import * as THREE from "three";
(window as any).THREE = THREE;
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Download, Layers, Sparkles, Sliders, Music, Eye, Undo2, Redo2, Maximize2, Minimize2, Circle, Mic, MicOff, MonitorSpeaker, Snowflake, Rewind, Repeat, Keyboard, X, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "@/store/useStore";
import { crossfadeLayers, cancelLayerCrossfade, MOSH_FADE_MS, DIRECTED_FADE_MS, JOURNEY_DISRUPT_FADE_MS } from "@/engine/layerCrossfade";

import { LayerStack } from "@/components/editor/LayerStack";
import { FxPicker } from "@/components/editor/FxPicker";
import { ShufflePanel } from "@/components/editor/ShufflePanel";
import { ParamDock } from "@/components/editor/ParamDock";
import { BeatPanel } from "@/components/editor/BeatPanel";
import { downloadCanvasPngNow, exportCanvas, downloadBlob, remasterCanvas } from "@/engine/export";
import { exportPrintReady, type PrintFormat } from "@/engine/printExport";
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
import { InteractionFeedback } from "@/components/editor/InteractionFeedback";
import { enterFullscreen, exitFullscreen, hasSeenPerfMode, markPerfModeSeen, useFullscreenSync } from "@/hooks/usePerformanceMode";
import { toast } from "sonner";
import { shareApp, shareBlob, shareOrDownload, shareUrl, canNativeShare } from "@/lib/share";
import { presetFromUrl, PRESET_PARAM } from "@/engine/presetUrl";
import { applyOverlayClass, overlayFromUrl } from "@/lib/overlayMode";
import { DELIVERABLES_BY_ID } from "@/engine/deliverables";
import { captureDeliverable } from "@/engine/captureDeliverable";
import { cueFromUrl, setlistFilename } from "@/engine/setlist";
import { KaossSurface } from "@/components/editor/KaossSurface";
import { MoshStickerLayer } from "@/components/editor/MoshStickerLayer";
import { useMoshStickerStore } from "@/store/moshStickerStore";
import { QuadrantSurface } from "@/components/editor/QuadrantSurface";
import { TrackpadGestures } from "@/components/editor/TrackpadGestures";
import { toggleSystemAudio } from "@/engine/systemAudio";
import { trackPlayer } from "@/engine/trackPlayer";
import { runTrackAction } from "@/engine/trackActions";
import { loadImageFile, loadImageFromClipboard } from "@/lib/sourceLoader";
import { SystemAudioHud } from "@/components/editor/SystemAudioHud";


import { AboutTrigger } from "@/components/AboutOverlay";
import { CameraMenu } from "@/components/editor/CameraMenu";

import { StartCameraOverlay } from "@/components/editor/StartCameraOverlay";
import { ForgeTapHint } from "@/components/editor/ForgeTapHint";
import { SourceModeToggle } from "@/components/editor/SourceModeToggle";
import { HotTriggers } from "@/components/editor/HotTriggers";
import { MicNudgeToast } from "@/components/editor/MicNudgeToast";
import { ActionConfirmation } from "@/components/editor/ActionConfirmation";
import { showExportSuccessToast } from "@/components/editor/ExportShareToast";
import { notifyExportStarted } from "@/components/editor/ExportRegisteredToast";
import { AccountChip } from "@/components/AccountChip";
import { usePaywall } from "@/hooks/usePaywall";
import { useCloudFavorites } from "@/hooks/useCloudFavorites";
import { JourneyDirector, type JourneyDirectorState } from "@/engine/journeyDirector";
import type { JourneyMic } from "@/engine/journeyCore";
import { PUBLIC_EFFECTS } from "@/engine/effects";
import { useIdleFade, markUiActive, isMoshOnlyActivity } from "@/hooks/useIdleFade";
import { captureQuickThumb } from "@/engine/quickThumb";
import {
  FORGE_JOURNEY_STORAGE_KEY,
  FORGE_JOURNEY_WARNING_MS,
  formatForgeJourneyRemaining,
  readForgeJourneyPreview,
  remainingForgeJourneyMs,
  startForgeJourneyPreview,
  stopForgeJourneyPreview,
  type ForgeJourneyPreview,
} from "@/engine/forgeJourneyPreview";

// Three/WebGL and the renderer are the heaviest part of MOSH. Keeping them
// behind this editor-local boundary lets the surrounding shell, controls, and
// source chooser become interactive before the GPU pipeline finishes loading.
const GlCanvas = lazy(async () => {
  const module = await import("@/components/editor/GlCanvas");
  return { default: module.GlCanvas };
});
import { CastStageButton } from "@/components/editor/CastStageButton";

const LEGACY_HOT_TRIGGERS_KEY = "cathedral_legacy_hot_triggers_launchpad_v1";

/** Paints the high-resolution frame selected by Smart Freeze above the live
 * renderer, without changing its source or interrupting camera playback. */
function FrozenFrame({ frame }: { frame: HTMLCanvasElement }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    target.width = frame.width;
    target.height = frame.height;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);
  }, [frame]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-30 h-full w-full" />;
}

// Unified one-screen control rack — no tabs.

export default function Editor() {
  const navigate = useNavigate();
  const imageElement = useStore(s => s.imageElement);
  const videoElement = useStore(s => s.videoElement);
  const sourceMode = useStore(s => s.sourceMode);
  // Forge generates its own source, so once it's picked there's always
  // something on screen — the empty-state "go live" hero has nothing to do.
  const hasSource = imageElement || videoElement || sourceMode === "forge" || sourceMode === "motif";
  const isForge = sourceMode === "forge";
  const isMotif = sourceMode === "motif";
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
  const exportSettings = useStore(s => s.exportSettings);
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const trackEnabled = useStore(s => s.trackEnabled);
  const isPerformanceMode = useStore(s => s.isPerformanceMode);
  const setPerformanceMode = useStore(s => s.setPerformanceMode);
  const proModeEnabled = useStore(s => s.proModeEnabled);
  const helpModeEnabled = useStore(s => s.helpModeEnabled);
  const [helpCaption, setHelpCaption] = useState<{ text: string; x: number; y: number } | null>(null);
  const saveSlot = useStore(s => s.saveSlot);
  const loadSlot = useStore(s => s.loadSlot);
  const layers = useStore(s => s.layers);
  const sourceName = useStore(s => s.sourceName);
  const flashSlot = useStore(s => s.flashSlot);
  const tileMode = useStore(s => s.tileMode);
  const videoStream = useStore(s => s.videoStream);
  const isCameraLive = !!videoStream;

  
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Starts visible. Nothing auto-reveals this on mount or on a fresh source
  // load — H-key / long-press / Shift-hold only ever *toggle* it — so a
  // `true` default here means the hot-trigger rail, the mode-switch icons,
  // and the bottom menu rack (all gated on `!hideUI`) never mount for
  // anyone who hasn't already discovered one of those gestures. Idle-fade
  // (`.ui-chrome` + `idleStage`, a separate mechanism) is what actually
  // makes the chrome disappear after 1.7s of inactivity — this flag is only
  // the manual full-hide, so it should start open.
  const [hideUI, setHideUI] = useState(false);
  const [legacyHotTriggers, setLegacyHotTriggers] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem(LEGACY_HOT_TRIGGERS_KEY) === "1"; } catch { return false; }
  });
  // Persistent reveal pin — the always-visible top-right toggle that keeps
  // the hot-trigger rail and menu rack on screen regardless of idle-fade or
  // Pro Mode's hold-Shift gesture, for anyone who wouldn't otherwise
  // discover either. Pinning reveals immediately; unpinning folds away
  // immediately — a plain on/off, not just "stop protecting from the next
  // auto-hide."
  const [chromePinned, setChromePinned] = useState(false);
  const [shortcutsHint, setShortcutsHint] = useState(false);
  const [slotShake, setSlotShake] = useState<number | null>(null);
  const isFullscreen = isPerformanceMode;
  const [isRecording, setIsRecording] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [printExportOpen, setPrintExportOpen] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [micFlash, setMicFlash] = useState<null | { on: boolean; key: number }>(null);
  const [bpmFlash, setBpmFlash] = useState<null | { bpm: number; key: number }>(null);
  const [iconFlash, setIconFlash] = useState<null | { icon: "freeze" | "reverse" | "loop"; label: string; key: number }>(null);
  const [reverseOn, setReverseOn] = useState(false);
  const [loopSec, setLoopSec] = useState(0);
  const [freezeOn, setFreezeOn] = useState(false);
  // A captured final render, rather than merely a paused shader clock. This
  // lets a quality freeze hold a crisp video/Forge frame too.
  const [freezeFrame, setFreezeFrame] = useState<HTMLCanvasElement | null>(null);
  const freezeTimerRef = useRef<number | null>(null);
  const freezeBusyRef = useRef(false);
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const recCapRef = useRef<number | null>(null);
  /** Set only when toggleRecord captured its own device-audio stream (the
   *  user didn't already have "device audio" reactivity on) — stopped when
   *  the recording ends. A borrowed reference to the reactive system-audio
   *  stream is never stored here; that one's lifecycle belongs to GlCanvas. */
  const recordAudioStreamRef = useRef<MediaStream | null>(null);
  const paywall = usePaywall();
  const forgePreviewRef = useRef<ForgeJourneyPreview>(
    typeof window === "undefined"
      ? { usedMs: 0, startedAt: null }
      : readForgeJourneyPreview(window.sessionStorage.getItem(FORGE_JOURNEY_STORAGE_KEY)),
  );
  const [forgePreviewRemainingMs, setForgePreviewRemainingMs] = useState(() =>
    remainingForgeJourneyMs(forgePreviewRef.current),
  );
  const forgePreviewWarningRef = useRef(false);
  useCloudFavorites();
  const recStartRef = useRef(0);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifProgress, setGifProgress] = useState(0);
  const [actionConfirm, setActionConfirm] = useState<{
    type: "gif" | "record";
    onConfirm: () => void;
  } | null>(null);
  const shellRef = useRef<HTMLElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [showFirstTip, setShowFirstTip] = useState(false);
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [showMicHint, setShowMicHint] = useState(false);
  const [showMicNudge, setShowMicNudge] = useState(false);
  const micNudgeShownRef = useRef(false);
  const [showTrackNudge, setShowTrackNudge] = useState(false);
  const trackNudgeShownRef = useRef(false);
  const [showPerfHint, setShowPerfHint] = useState(false);
  const [transitionKey, setTransitionKey] = useState(0);
  const prevImageRef = useRef<HTMLImageElement | null>(null);

  useFullscreenSync();

  // Entering the editor with the track already playing should feel like a
  // fresh drop-in, not a loop of wherever it happened to be.
  useEffect(() => { trackPlayer.noteModeEntry(); }, []);

  // UI chrome (and the cursor, see index.css) fades to fully invisible
  // after 1.7s of inactivity.
  const idleStage = useIdleFade(1_700, isMoshOnlyActivity);
  // Pinning bypasses idle-fade entirely — real inactivity no longer fades
  // .ui-chrome while pinned, independent of hideUI (a separate mechanism;
  // see chromePinned's declaration for how the two combine).
  const effectiveIdleStage = chromePinned ? "active" : idleStage;

  // Once idle, the page has to stop offering anything the browser itself
  // would interrupt the visual with: no right-click "Save image as…" menu,
  // no accidental text-selection (and the mobile copy/share bubble that
  // comes with it). Native `title`-attribute tooltips don't need separate
  // handling — the chrome they'd hover over already goes pointer-events:none
  // at the same idle mark (see .ui-chrome in index.css), so they can't be
  // triggered at all once hidden. Same 1.7s mark as everything else fading,
  // deliberately — a second, slightly different timer here would just
  // desync from the fade and read as a bug.
  useEffect(() => {
    const idle = effectiveIdleStage === "hidden";
    document.body.classList.toggle("idle-locked", idle);
    if (!idle) return;
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [effectiveIdleStage]);

  // Help Mode (hold the Pro Mode trigger to reach it): a single delegated
  // listener rather than touching every button's own JSX — every hot
  // trigger and menu control already carries a real aria-label/title, this
  // just surfaces that text immediately instead of waiting on the browser's
  // slow native tooltip delay (and gives touch a path at all, since touch
  // has no hover state for native tooltips to ever trigger from).
  useEffect(() => {
    if (!helpModeEnabled) { setHelpCaption(null); return; }
    const describe = (start: EventTarget | null): string | null => {
      let el = start as HTMLElement | null;
      while (el) {
        const label = el.getAttribute?.("aria-label") || el.getAttribute?.("title");
        if (label) return label;
        el = el.parentElement;
      }
      return null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const text = describe(e.target);
      setHelpCaption(text ? { text, x: e.clientX, y: e.clientY } : null);
    };
    let holdTimer: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const target = e.target;
      const x = e.clientX, y = e.clientY;
      holdTimer = window.setTimeout(() => {
        const text = describe(target);
        if (text) {
          setHelpCaption({ text, x, y });
          try { if ("vibrate" in navigator) (navigator as any).vibrate?.(8); } catch {}
        }
      }, 380);
    };
    const onUp = () => {
      if (holdTimer) { window.clearTimeout(holdTimer); holdTimer = null; }
      setHelpCaption(null);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (holdTimer) window.clearTimeout(holdTimer);
    };
  }, [helpModeEnabled]);

  // Pro Mode: flipping it on hides everything immediately; flipping it off
  // brings it back. While it's on, the ambient single-finger long-press and
  // plain H-key hideUI toggles are suspended (see their own effects below) —
  // the deliberate hold+second-tap / hold-Shift gestures become the only way
  // back in, so the menu can never surface by accident mid-performance.
  // Skips its own first run — this only reacts to an actual toggle, never to
  // mounting with proModeEnabled already false, which would otherwise stomp
  // on the ordinary hideUI-starts-true-until-revealed default for everyone
  // who has never touched Pro Mode at all.
  const proModeMounted = useRef(false);
  useEffect(() => {
    if (!proModeMounted.current) { proModeMounted.current = true; return; }
    if (chromePinned) return; // the reveal pin outranks Pro Mode's auto-hide-on-enable
    setHideUI(proModeEnabled);
  }, [proModeEnabled, chromePinned]);
  const focusTune = useCallback((layerId: string) => {
    useStore.getState().selectLayer(layerId);
    setHideUI(false);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-tune-panel]")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);
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

  /* Cue deep link: ?cue=1..9 recalls a saved slot on load.
     This is what makes a rig scriptable — a Stream Deck button, a venue kiosk
     shortcut, or a browser bookmark can each address one cue directly. Runs
     after the preset effect so an explicit ?p= wins if both are present. */
  useEffect(() => {
    const idx = cueFromUrl();
    if (idx === null) return;
    const t = window.setTimeout(() => {
      if (useStore.getState().loadSlot(idx)) toast.success(`Cue ${idx + 1}`);
      else toast.error(`Cue ${idx + 1} is empty`);
    }, 80);
    return () => window.clearTimeout(t);
  }, []);

  const saveSetlist = useCallback(() => {
    const json = useStore.getState().exportSetlistJson("MOSH set");
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = setlistFilename("MOSH set");
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success("Setlist saved", { description: "Carry it to any machine" });
  }, []);

  const loadSetlist = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const res = useStore.getState().importSetlistJson(await file.text());
      if (!res) { toast.error("That doesn't look like a MOSH setlist"); return; }
      toast.success(`Loaded "${res.name}"`, { description: `${res.count} cues ready` });
    };
    input.click();
  }, []);

  /* Overlay mode: MOSH as a layer inside someone else's compositor.
     Read from the URL and applied to <html> so CSS can strip every opaque
     surface. Chrome is force-hidden too — a browser source bakes whatever the
     page paints into the stream, so a stray panel becomes permanent furniture
     in the broadcast. */
  const overlayRef = useRef(overlayFromUrl());
  const isOverlay = overlayRef.current.mode !== "off";
  useEffect(() => {
    applyOverlayClass(isOverlay);
    if (isOverlay) setHideUI(true);
    return () => applyOverlayClass(false);
  }, [isOverlay]);

  /* Platform deliverables.
     Records the live canvas into a fixed-shape file and checks it against the
     platform's rules before the user takes it to an upload form. The check
     runs on what MediaRecorder actually produced rather than what it was
     asked for, because browsers substitute codecs silently and the mismatch
     is otherwise discovered at the rejection. */
  const exportDeliverable = useCallback(async (specId: string) => {
    if (isForge && !paywall.isSupporter) {
      paywall.require("Forge deliverable export");
      return;
    }
    const spec = DELIVERABLES_BY_ID[specId];
    const canvas = useStore.getState().glCanvas;
    if (!spec || !canvas) { toast.error("Nothing to export yet"); return; }
    if (exportBusy) return;
    setExportBusy(true);
    setExportProgress(0);
    const t = toast.loading(`Recording ${spec.name} — ${spec.defaultSec}s…`);
    try {
      const res = await captureDeliverable(canvas, spec, {
        onProgress: (p) => setExportProgress(p),
      });
      await shareOrDownload(res.blob, res.filename);
      toast.dismiss(t);
      if (res.ok) {
        toast.success(`${spec.name} ready`, {
          description: `${res.seconds.toFixed(1)}s · ${spec.width}x${spec.height}`,
        });
      } else {
        // Deliver the file anyway — it is still usable, and often only needs a
        // format conversion. Saying nothing would be worse than saying "this
        // will be refused and here is why".
        const fatal = res.issues.filter(i => i.fatal).map(i => i.message).join(" ");
        toast.warning(`${spec.name} saved, but needs a fix`, { description: fatal, duration: 12000 });
      }
    } catch (err) {
      toast.dismiss(t);
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportBusy(false);
      setExportProgress(0);
    }
  }, [exportBusy, isForge, paywall]);

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

  const clearSmartFreeze = useCallback(() => {
    if (freezeTimerRef.current) {
      window.clearTimeout(freezeTimerRef.current);
      freezeTimerRef.current = null;
    }
    timeController.cancelFreeze();
    setFreezeFrame(null);
    setFreezeOn(false);
  }, []);

  /** Scan briefly for the cleanest rendered frame, then freeze that exact
   * output. A second invocation releases it immediately. */
  const toggleSmartFreeze = useCallback(async () => {
    if (freezeFrame) {
      clearSmartFreeze();
      setIconFlash({ icon: "freeze", label: "Unfreeze", key: performance.now() });
      return;
    }
    if (freezeBusyRef.current) return;
    const canvas = getCanvas();
    if (!canvas) return;

    freezeBusyRef.current = true;
    const notice = toast.loading("Finding the cleanest freeze…", { duration: 1500 });
    try {
      const frame = await captureBestFrame(canvas, {
        durationMs: 1000,
        intervalMs: 80,
        sampleSize: 128,
        preferSeamless: tileMode !== "none",
      });
      setFreezeFrame(frame);
      setFreezeOn(true);
      timeController.triggerFreeze(1600);
      setIconFlash({ icon: "freeze", label: "Freeze", key: performance.now() });
      freezeTimerRef.current = window.setTimeout(clearSmartFreeze, 1600);
      toast.success("Freeze locked", { id: notice, duration: 1100 });
    } catch {
      toast.error("Could not lock a frame", { id: notice });
      clearSmartFreeze();
    } finally {
      freezeBusyRef.current = false;
    }
  }, [clearSmartFreeze, freezeFrame, tileMode]);

  useEffect(() => () => clearSmartFreeze(), [clearSmartFreeze]);

  const exportBestStill = useCallback(async () => {
    if (isForge && !paywall.isSupporter) {
      paywall.require("Forge still export");
      return;
    }
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
      showExportSuccessToast({
        message: tileMode === "none" ? "Still ready" : "Best seamless frame ready",
        description: canNativeShare() ? "Share sheet opening…" : "Saved to downloads",
        blob,
        filename,
      });
    } catch {
      toast.error("Export failed");
    } finally {
      setExportBusy(false);
      setExportProgress(0);
    }
  }, [exportBusy, isForge, paywall, tileMode]);

  const exportPrintStill = useCallback(async (longEdge: 5000 | 8000, format: PrintFormat = "jpg") => {
    if (isForge && !paywall.isSupporter) {
      paywall.require("Forge print-ready export");
      return;
    }
    if (exportBusy) return;
    const canvas = getCanvas();
    if (!canvas) return;
    setPrintExportOpen(false);
    setExportBusy(true);
    setExportProgress(0.05);
    notifyExportStarted("print");
    const notice = toast.loading(`Building ${longEdge / 1000}K · ${exportSettings.printDpi} DPI print file…`, { duration: 60_000 });
    try {
      const state = useStore.getState();
      const effects = state.layers.filter(layer => !layer.hidden).slice(0, 3).map(layer => layer.effectId);
      const subject = effects.length ? effects.join("-") : (isForge ? `forge-${state.forge.seed.toString(16)}` : "visual");
      const result = await exportPrintReady(canvas, {
        longEdge,
        format,
        dpi: exportSettings.printDpi,
        quality: 1,
        baseName: `ether-mosh-${subject}`,
      });
      setExportProgress(1);
      await shareOrDownload(result.blob, result.filename);
      showExportSuccessToast({
        id: notice,
        message: `${result.width}×${result.height} · ${result.dpi} DPI ready`,
        description: format === "jpg" ? "Maximum-quality print JPG" : "Lossless print PNG",
        blob: result.blob,
        filename: result.filename,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Print export failed", { id: notice });
    } finally {
      setExportBusy(false);
      setExportProgress(0);
    }
  }, [exportBusy, isForge, paywall, exportSettings.printDpi]);

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

  // First real content this session, in whichever mode got there first
  // (upload, camera, or forge) — nudge toward the mic once, if nothing's
  // already listening. Session-scoped (a ref, not localStorage) so it can
  // nudge again next visit, per-session rather than per-browser-forever.
  useEffect(() => {
    if (!hasSource) return;
    if (micNudgeShownRef.current) return;
    if (micEnabled || systemAudioEnabled) return;
    micNudgeShownRef.current = true;
    setShowMicNudge(true);
  }, [hasSource, micEnabled, systemAudioEnabled]);

  // If someone has been looking at an active visual for a full minute with
  // no audio source at all, point them to the music trigger. This is a
  // consentful prompt, not autoplay: the actual start remains a user click.
  useEffect(() => {
    if (!hasSource || micEnabled || systemAudioEnabled || trackEnabled || trackNudgeShownRef.current) return;
    const timer = window.setTimeout(() => {
      trackNudgeShownRef.current = true;
      setShowTrackNudge(true);
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [hasSource, micEnabled, systemAudioEnabled, trackEnabled]);

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
      crossfadeLayers(() => useStore.getState().mosh(), MOSH_FADE_MS);
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

  // ── Journey director (five-minute Forge preview, then supporter) ─────
  /* Smart and Storm, combined. Offline, no network.

     They were halves of one idea. Smart read the room well but then left the
     arrangement completely untouched until its next switch, so between switches
     the screen was static. Storm never chose well — it drew from three
     hand-listed pools — but it never let the frame sit still, because it was
     re-rolling every parameter twelve times a second. That constant re-roll,
     under a stack whose effect identity held for 5–60 seconds, is why Storm
     looked better than anything else in the app.

     Journey runs Smart's judgement on the slow clock and Storm's interference
     on the fast one, and the fast one is bounded so nothing is ever left alone
     for more than ten seconds. */
  const [journeyOn, setJourneyOn] = useState(false);
  const [journeyFlashKey, setJourneyFlashKey] = useState(0);
  const [journeyState, setJourneyState] = useState<JourneyDirectorState | null>(null);
  const journeyRef = useRef<JourneyDirector | null>(null);
  const journeyPrevShuffleRef = useRef<number | null>(null);

  const persistForgePreview = useCallback((preview: ForgeJourneyPreview) => {
    forgePreviewRef.current = preview;
    setForgePreviewRemainingMs(remainingForgeJourneyMs(preview));
    try {
      window.sessionStorage.setItem(FORGE_JOURNEY_STORAGE_KEY, JSON.stringify(preview));
    } catch {
      // Private browsing can deny storage; the current in-memory session still works.
    }
  }, []);

  const crossfadeToComposition = useCallback((directed: import("@/engine/compose").DirectedLayer[]) => {
    crossfadeLayers(() => useStore.getState().moshDirected(directed), DIRECTED_FADE_MS);
  }, []);

  const toggleJourney = useCallback(() => {
    if (journeyOn) {
      setJourneyOn(false);
      return;
    }
    if (paywall.isSupporter) {
      setJourneyOn(true);
      return;
    }
    if (!isForge) {
      paywall.require("Journey mode");
      return;
    }
    if (remainingForgeJourneyMs(forgePreviewRef.current) === 0) {
      paywall.require("Forge Journey beyond the free preview");
      return;
    }
    setJourneyOn(true);
  }, [isForge, journeyOn, paywall]);

  // Forge gets one five-minute, session-persistent Journey preview. The clock
  // follows active Journey time and is paused as soon as the director stops.
  useEffect(() => {
    if (!journeyOn || !isForge || paywall.isSupporter) return;

    persistForgePreview(startForgeJourneyPreview(forgePreviewRef.current));
    const tick = () => {
      const remaining = remainingForgeJourneyMs(forgePreviewRef.current);
      setForgePreviewRemainingMs(remaining);
      if (remaining <= FORGE_JOURNEY_WARNING_MS && !forgePreviewWarningRef.current) {
        forgePreviewWarningRef.current = true;
        toast.message("One minute left in your Forge Journey preview", {
          description: "Support MOSH to keep the ambient wall running and export it.",
          action: { label: "Support", onClick: () => navigate("/pricing?unlock=1") },
          duration: 10_000,
        });
      }
      if (remaining === 0) {
        persistForgePreview(stopForgeJourneyPreview(forgePreviewRef.current));
        setJourneyOn(false);
        toast.message("Forge Journey preview complete", {
          description: "Support MOSH for uninterrupted ambient walls and clean output.",
          action: { label: "Support", onClick: () => navigate("/pricing?unlock=1") },
          duration: 12_000,
        });
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearInterval(timer);
      persistForgePreview(stopForgeJourneyPreview(forgePreviewRef.current));
    };
  }, [isForge, journeyOn, navigate, paywall.isSupporter, persistForgePreview]);

  useEffect(() => {
    if (!journeyOn) { setJourneyState(null); return; }
    // Suspend auto-shuffle for the duration; restore on exit.
    journeyPrevShuffleRef.current = useStore.getState().shuffleSec;
    if (journeyPrevShuffleRef.current != null) useStore.getState().setShuffleSec(null);

    const director = new JourneyDirector({
      // Forge keeps its ambient-wall character while beginning every full
      // composition handoff by 8.5s. Everywhere else stays more volatile.
      pace: isForge ? "forge" : "performance",
      getVideo: () => useStore.getState().videoElement,
      getMic: () => {
        // Published by GlCanvas, which owns the analyser and drives it from the
        // render loop. Only handed over when live — a stopped analyser reads as
        // zeroes, which the director would confidently report as silence.
        const m = (window as any).__aegisMic as JourneyMic | undefined;
        return m && m.enabled ? m : null;
      },
      onCompose: (layers) => {
        crossfadeToComposition(layers);
        setJourneyFlashKey(performance.now());
      },
      onDisrupt: (d) => {
        /* A swap needs an effect to drop in, and the director deliberately
           doesn't know the registry — it decides *that* something should
           change, not *what*. Picking here keeps the two concerns apart. */
        if (d.kind === "swap") {
          const pick = PUBLIC_EFFECTS[Math.floor(Math.random() * PUBLIC_EFFECTS.length)];
          crossfadeLayers(
            () => useStore.getState().disrupt({ kind: "swap", violence: d.violence, effectId: pick?.id }),
            JOURNEY_DISRUPT_FADE_MS,
          );
          return;
        }
        if (d.kind === "surge") return; // the burst arrives as churn ticks
        useStore.getState().disrupt({ kind: d.kind, violence: d.violence });
      },
      onState: setJourneyState,
    });
    journeyRef.current = director;
    director.start();

    return () => {
      director.stop();
      journeyRef.current = null;
      // Don't leave an in-flight crossfade writing to the store after
      // Journey's been turned off — it'd stomp on whatever comes next.
      cancelLayerCrossfade();
      // Restore prior auto-shuffle if it wasn't touched while journey ran.
      const cur = useStore.getState().shuffleSec;
      if (cur == null && journeyPrevShuffleRef.current != null) {
        useStore.getState().setShuffleSec(journeyPrevShuffleRef.current);
      }
      journeyPrevShuffleRef.current = null;
    };
  }, [journeyOn, isForge, crossfadeToComposition]);

  // If the user manually re-enables auto-shuffle, gracefully step out.
  useEffect(() => {
    if (journeyOn && shuffleSec != null) setJourneyOn(false);
  }, [shuffleSec, journeyOn]);

  // The free preview is specifically Forge Journey. A Supporter can still
  // direct uploaded artwork and camera input with Journey as before.
  useEffect(() => {
    if (journeyOn && !paywall.isSupporter && sourceMode !== "forge") setJourneyOn(false);
  }, [journeyOn, paywall.isSupporter, sourceMode]);

  const clearAllFx = useCallback(() => {
    useStore.getState().clearAllFx();   // layers + auto-shuffle
    setJourneyOn(false);
    toast.message("FX cleared — remastered source only", { duration: 1800 });
  }, []);

  /**
   * Grabs a thumbnail off the live canvas (instant — no scan) and saves the
   * current stack. The favorite carries its own shareable link, generated
   * once here, so it keeps working even if this exact route changes later.
   */
  const saveFavoriteNow = useCallback(() => {
    const c = getCanvas();
    const thumb = c ? captureQuickThumb(c) : undefined;
    const fav = useStore.getState().saveFavorite(thumb);
    toast.success(`Saved "${fav.name}"`, {
      description: fav.link ? "Tap to copy its instant-replay link" : undefined,
      action: fav.link ? { label: "Copy link", onClick: () => shareUrl(fav.link!) } : undefined,
    });
  }, []);

  const takeScreenshot = () => {
    if (isForge && !paywall.isSupporter) {
      paywall.require("Forge screenshot export");
      return;
    }
    const c = getCanvas();
    if (!c) return;
    try {
      notifyExportStarted("screenshot");
      // This must remain synchronous with the camera-button/key/touch event:
      // phones regularly block a download that starts after a best-frame scan.
      // The dedicated Still export retains that slower scan/remaster workflow.
      const longEdge = Math.max(c.width, c.height);
      const scale = paywall.isSupporter ? 1 : Math.min(1, 720 / longEdge);
      downloadCanvasPngNow(c, `mosh-${Date.now()}.png`, scale);
      toast.success(paywall.isSupporter ? "Screenshot saving" : "Screenshot saving (720p · unlock for full res)", {
        description: "Saved to this device's downloads/photos flow · C or three-finger tap to capture",
        duration: 3200,
      });
    } catch {
      toast.error("Screenshot failed");
    } finally {
      markUiActive();
    }
  };

  const shareCurrent = useCallback(async () => {
    if (isForge && !paywall.isSupporter) {
      paywall.require("Forge sharing");
      return;
    }
    const c = getCanvas();
    if (!c) { shareApp(); return; }
    try {
      notifyExportStarted("share");
      const longEdge = Math.max(c.width, c.height);
      const scale = Math.min(1, 1440 / longEdge);
      const blob = await exportCanvas(c, { format: "jpg", scale, aspect: null, quality: exportSettings.shareQuality });
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
  }, [isForge, paywall, exportSettings.shareQuality]);

  /** Seconds the GIF button captures on a plain tap. Long-press picks another. */
  const captureGif = useCallback(async (seconds?: number) => {
    if (gifBusy) return;
    if (!paywall.require("Seamless GIF loop")) return;
    const c = getCanvas();
    if (!c) { toast.error("No visualizer to capture"); return; }

    const dur = seconds ?? exportSettings.gifDefaultSeconds;
    setActionConfirm({
      type: "gif",
      onConfirm: async () => {
        setActionConfirm(null);
        notifyExportStarted("gif");
        setGifBusy(true);
        setGifProgress(0);
        // Pause auto-shuffle so the mosh effect stays locked for the whole window.
        const prevShuffle = useStore.getState().shuffleSec;
        if (prevShuffle != null) useStore.getState().setShuffleSec(null);
        const t = toast.loading(`Locking mosh · capturing ${dur}s seamless GIF…`, { duration: 30_000 });
        try {
          const result = await captureLoopingGif(c, {
            durationMs: Math.round(dur * 1000),
            fps: exportSettings.gifFps,
            maxWidth: exportSettings.gifMaxWidth,
            onProgress: (phase, p) => {
              // Weight capture as 0..0.7, encode as 0.7..1
              setGifProgress(phase === "capture" ? p * 0.7 : 0.7 + p * 0.3);
            },
          });
          const filename = `mosh-${Date.now()}_${dur}s_loop.gif`;
          downloadBlob(result.blob, filename);
          const quality = result.loopScore > 0.85 ? "tight loop" : result.loopScore > 0.6 ? "clean loop" : "loop";
          showExportSuccessToast({
            message: `${dur}s GIF saved · ${result.frameCount}f · ${quality}`,
            blob: result.blob,
            filename,
            id: t,
          });
        } catch (e) {
          toast.error("GIF capture failed", { id: t });
        } finally {
          if (prevShuffle != null) useStore.getState().setShuffleSec(prevShuffle);
          setGifBusy(false);
          setGifProgress(0);
          markUiActive();
        }
      },
    });
  }, [gifBusy, paywall, exportSettings.gifDefaultSeconds, exportSettings.gifFps, exportSettings.gifMaxWidth]);


  /** Stops and clears the audio stream toggleRecord captured for itself, if
   *  any — never touches the reactive system-audio stream, which GlCanvas
   *  owns and stops independently via the "device audio" toggle. */
  const stopOwnRecordAudioStream = () => {
    recordAudioStreamRef.current?.getTracks().forEach(t => t.stop());
    recordAudioStreamRef.current = null;
  };

  const toggleRecord = async () => {
    if (!isRecording && isForge && !paywall.isSupporter) {
      paywall.require("Forge recording export");
      return;
    }
    const c = getCanvas();
    if (!c) return;
    if (!CanvasRecorder.isSupported()) {
      toast.error("Recording not supported in this browser");
      return;
    }
    if (!recorderRef.current) recorderRef.current = new CanvasRecorder();
    const rec = recorderRef.current;
    if (rec.state === "idle") {
      setActionConfirm({
        type: "record",
        onConfirm: async () => {
          setActionConfirm(null);
          try {
            // Already-reactive device audio (the existing "device audio"
            // toggle) is included for free, no extra prompt. Otherwise, try
            // to capture it fresh right here — this is the only place left
            // in the confirm flow with anything resembling a user gesture,
            // so a browser that's strict about it may reject the request;
            // that's caught below and just falls back to a silent
            // recording rather than blocking the record action entirely.
            let audioStream: MediaStream | null = null;
            const activeSystemStream = (window as any).__aegisActiveSystemStream as MediaStream | undefined;
            if (useStore.getState().systemAudioEnabled && activeSystemStream?.getAudioTracks().length) {
              audioStream = activeSystemStream;
            } else {
              const md = navigator.mediaDevices as any;
              if (md?.getDisplayMedia) {
                try {
                  const captured: MediaStream = await md.getDisplayMedia({ video: true, audio: true });
                  if (captured.getAudioTracks().length > 0) {
                    audioStream = captured;
                    recordAudioStreamRef.current = captured;
                  } else {
                    captured.getTracks().forEach(t => t.stop());
                  }
                } catch {
                  // Declined the share picker, or no permission — record
                  // silent rather than failing the whole action.
                }
              }
            }
            rec.start(c, exportSettings.videoFps, { audioStream, preferMp4: exportSettings.videoFormat === "mp4" });
            notifyExportStarted("video");
            recStartRef.current = performance.now();
            setRecElapsed(0);
            setIsRecording(true);
            const audioNote = audioStream ? " · with device audio" : "";
            if (paywall.isSupporter) {
              toast.success(`Recording started${audioNote} · Shift+R to stop`);
            } else {
              toast.success(`Recording started${audioNote} · 15s free cap · Shift+R to stop early`);
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
            stopOwnRecordAudioStream();
          }
        },
      });
    } else {
      try {
        if (recCapRef.current) { window.clearTimeout(recCapRef.current); recCapRef.current = null; }
        const blob = await rec.stop();
        setIsRecording(false);
        const filename = `mosh-${Date.now()}.${rec.extension()}`;
        shareOrDownload(blob, filename);
        showExportSuccessToast({
          message: "Recording ready",
          duration: 10000,
          description: canNativeShare()
            ? "Share sheet opening — post to TikTok, Instagram, Snapchat…"
            : "Saved to downloads",
          blob,
          filename,
        });
      } catch (e) {
        toast.error("Could not stop recording");
        setIsRecording(false);
      } finally {
        stopOwnRecordAudioStream();
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

      // Sticker/Lottie controls contain checkboxes and selects. Space must
      // remain the universal MOSH action even immediately after one of those
      // controls was focused.
      if (e.code === "Space" && useStore.getState().stickerMode) {
        e.preventDefault();
        if (e.repeat) return;
        if (e.shiftKey) undo();
        else crossfadeLayers(mosh, MOSH_FADE_MS);
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
        if (e.key === "s" || e.key === "S") { e.preventDefault(); saveFavoriteNow(); return; }
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

      // Space is the keyboard equivalent of the MOSH button. Shift+Space
      // walks one step back through the same visual history.
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (e.shiftKey) undo();
        else crossfadeLayers(mosh, MOSH_FADE_MS);
        return;
      }

      // ————————————— Hot-trigger single-key shortcuts —————————————
      // Mnemonic mapping — matches the icon rack in the top-right corner.
      //   R = Record · M = Mic · A = Auto-shuffle · X = mosh (eXplode)
      //   S = Save favorite · Shift+S = open favorites list · Shift+X = clear FX
      //   Z = freeZe · C = Capture (screenshot) · P/F = Perf · Shift+P = fullscreen
      //   G = GIF 7s · Alt+G = GIF 5s · Shift+G = GIF 3s
      //   U/L/Y = source mode (Upload/Live camera/forge — Y has no better letter free)
      //   V = share current frame · I = Journey · H = Hide UI

      // K => Make Sticker from the selected overlay or current rendered mode.
      // The listener lives in the always-mounted OverlayStage, so scissors
      // mode does not need to be opened first.
      if (!e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (e.repeat) return;
        window.dispatchEvent(new CustomEvent("mosh:make-sticker"));
        return;
      }
      // Shift+K => jump straight into Lottie Sticker Mode and capture,
      // without needing scissors mode open or the Lottie checkbox already
      // ticked first. Opens the sticker panel (so the preview/checkbox are
      // visibly on) via the store directly, then hands off to
      // StickerCapture's own listener (always-mounted, same event-bridge
      // pattern as "mosh:make-sticker" above) for the actual capture.
      if (e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (e.repeat) return;
        useStore.getState().setStickerMode(true);
        window.dispatchEvent(new CustomEvent("mosh:capture-lottie-sticker"));
        return;
      }

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
        crossfadeLayers(mosh, MOSH_FADE_MS);
        return;
      }
      // S => save current mosh as favorite
      if (!e.shiftKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveFavoriteNow();
        return;
      }
      // Z => freeze / slow-mo
      if (!e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        toggleSmartFreeze();
        return;
      }
      // C => capture screenshot
      if (!e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        takeScreenshot();
        return;
      }
      // Alt+G => GIF loop capture, 5s (checked by e.code — Option composes
      // e.key into an accented character on Mac layouts, e.code doesn't).
      if (e.altKey && !e.shiftKey && e.code === "KeyG") {
        e.preventDefault();
        captureGif(5);
        return;
      }
      // G => GIF loop capture (7s seamless) · Shift+G => 3s (below)
      if (!e.shiftKey && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        captureGif();
        return;
      }
      // I => Journey director (supporter unlock)
      if (!e.shiftKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleJourney();
        return;
      }
      // U / L / Y => switch source mode (upload / live camera / forge) —
      // mirrors the top-left mode switcher, which idle-fades like everything
      // else, so these are the reliable way in once it's faded out.
      if (!e.shiftKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "upload" }));
        return;
      }
      if (!e.shiftKey && (e.key === "l" || e.key === "L")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "camera" }));
        return;
      }
      if (!e.shiftKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "forge" }));
        return;
      }
      // V => share current frame
      if (!e.shiftKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        shareCurrent();
        return;
      }

      // P / F => toggle Performance Mode · Shift+P => plain browser fullscreen (below)
      if (!e.shiftKey && (e.key === "p" || e.key === "P" || e.key === "f" || e.key === "F")) {
        e.preventDefault();
        togglePerf();
        return;
      }

      // H => toggle UI hide / peek. Suspended in Pro Mode — hold-Shift is
      // the only way back in there (see the dedicated Pro Mode effect).
      if (!e.shiftKey && (e.key === "h" || e.key === "H")) {
        if (!useStore.getState().isPerformanceMode && !useStore.getState().proModeEnabled) {
          e.preventDefault();
          setHideUI(v => !v);
        }
        return;
      }

      // Theme-track transport — [ previous, ] next, \ shuffle. Every letter
      // (bare and Shift-combo) is already spoken for elsewhere in this map,
      // so this borrows the standard media-player bracket convention
      // instead. Works regardless of whether the track panel is open, and
      // always ends up playing (matching an ordinary "next" button), so
      // these work as a real transport control, not just a picker shortcut.
      if (!e.shiftKey && e.key === "[") { e.preventDefault(); runTrackAction(() => trackPlayer.prevShowcaseTrack()); return; }
      if (!e.shiftKey && e.key === "]") { e.preventDefault(); runTrackAction(() => trackPlayer.nextShowcaseTrack()); return; }
      if (!e.shiftKey && e.key === "\\") { e.preventDefault(); runTrackAction(() => trackPlayer.shuffleShowcaseTrack()); return; }

      // ————————————— Shift combos —————————————
      if (e.shiftKey && (e.key === "M" || e.key === "m")) { e.preventDefault(); crossfadeLayers(mosh, MOSH_FADE_MS); return; }
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
        toggleSmartFreeze();
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
      if (e.shiftKey && (e.key === "G" || e.key === "g")) { e.preventDefault(); captureGif(3); return; }
      if (e.shiftKey && (e.key === "P" || e.key === "p")) { e.preventDefault(); toggleFullscreen(); return; }
      if (e.shiftKey && (e.key === "X" || e.key === "x")) { e.preventDefault(); clearAllFx(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mosh, undo, redo, setMicEnabled, paletteOpen, shortcutsOpen, saveSlot, loadSlot, flashSlot, exportBestStill, captureGif, saveFavoriteNow, toggleFullscreen, shareCurrent, clearAllFx, toggleJourney, sourceMode, toggleSmartFreeze]);

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

  // Mobile gesture: swipe-up requests UI hide toggle. Suspended in Pro
  // Mode — same reasoning as the H key above.
  useEffect(() => {
    const onToggleUI = () => {
      if (useStore.getState().proModeEnabled) return;
      setHideUI(v => !v);
    };
    window.addEventListener("aegis:toggle-ui", onToggleUI);
    return () => window.removeEventListener("aegis:toggle-ui", onToggleUI);
  }, []);

  // Three-finger tap on the visualizer is the touch counterpart to C. It is
  // intentionally scoped to the canvas and ignores UI controls so it cannot
  // steal ordinary multi-touch interactions from the editor chrome.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const activeTouches = new Set<number>();
    let fired = false;
    const isCanvasTap = (target: EventTarget | null) =>
      !(target instanceof HTMLElement) || !target.closest("button, a, input, textarea, [role='slider'], [data-no-longpress]");
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !isCanvasTap(e.target)) return;
      activeTouches.add(e.pointerId);
      if (activeTouches.size !== 3 || fired) return;
      fired = true;
      e.preventDefault();
      try { (navigator as any).vibrate?.(10); } catch {}
      takeScreenshot();
    };
    const onEnd = (e: PointerEvent) => {
      activeTouches.delete(e.pointerId);
      if (activeTouches.size === 0) fired = false;
    };
    el.addEventListener("pointerdown", onDown, { passive: false });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [takeScreenshot]);

  // Touch-first performance navigation. One-finger horizontal swipes walk the
  // undo/redo timeline; two-finger tap still toggles Smart Freeze. At the
  // newest point, swiping forward creates a fresh Mosh instead of going dead.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    type Point = { x: number; y: number };
    const points = new Map<number, Point>();
    let start: Point[] = [];
    let startedAt = 0;
    let maxTravel = 0;
    let invalid = false;
    let handled = false;
    const isCanvasTouch = (target: EventTarget | null) =>
      !(target instanceof HTMLElement) || !target.closest("button, a, input, textarea, [role='slider'], [data-no-longpress]");
    const average = (items: Point[]) => items.reduce((sum, p) => ({ x: sum.x + p.x, y: sum.y + p.y }), { x: 0, y: 0 });
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !isCanvasTouch(e.target)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 1 || points.size === 2) {
        start = [...points.values()].map(p => ({ ...p }));
        startedAt = performance.now();
        maxTravel = 0;
        invalid = false;
        handled = false;
      } else if (points.size > 2) {
        // Three fingers belong to screenshot capture, never to this gesture.
        invalid = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = points.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!start.length || start.length !== points.size) return;
      const now = [...points.values()];
      for (let i = 0; i < now.length; i++) {
        maxTravel = Math.max(maxTravel, Math.hypot(now[i].x - start[i].x, now[i].y - start[i].y));
      }
    };
    const onEnd = (e: PointerEvent) => {
      const point = points.get(e.pointerId);
      if (!point) return;
      point.x = e.clientX;
      point.y = e.clientY;
      if (!handled && !invalid && (points.size === 1 || points.size === 2) && start.length === points.size) {
        handled = true;
        const from = average(start);
        const to = average([...points.values()]);
        const count = points.size;
        const dx = to.x / count - from.x / count;
        const dy = to.y / count - from.y / count;
        const elapsed = performance.now() - startedAt;
        if (Math.abs(dx) >= 72 && Math.abs(dx) > Math.abs(dy) * 1.35) {
          try { (navigator as any).vibrate?.(10); } catch {}
          const state = useStore.getState();
          if (dx < 0) {
            if (state.future.length) state.redo();
            else crossfadeLayers(() => useStore.getState().mosh(), MOSH_FADE_MS);
          } else if (state.past.length) {
            state.undo();
          }
        } else if (count === 2 && elapsed <= 420 && maxTravel <= 20) {
          try { (navigator as any).vibrate?.(10); } catch {}
          toggleSmartFreeze();
        }
      }
      points.delete(e.pointerId);
      if (points.size === 0) {
        start = [];
        invalid = false;
        handled = false;
      }
    };
    el.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [toggleSmartFreeze]);

  // Pro Mode, desktop: holding bare Shift (no other key, no modifiers)
  // shows the menu instantly; releasing it hides it instantly. A true hold,
  // not a toggle-with-timer, so it's as fast to flash and dismiss as
  // physically possible. Forces the UI back to hidden on blur/visibility
  // change too, so alt-tabbing away mid-hold can never strand it open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!useStore.getState().proModeEnabled) return;
      if (e.key !== "Shift" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setHideUI(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!useStore.getState().proModeEnabled) return;
      if (e.key !== "Shift") return;
      if (chromePinned) return; // pin overrides the release-to-hide gesture
      setHideUI(true);
    };
    const forceHidden = () => {
      if (chromePinned) return;
      if (useStore.getState().proModeEnabled) setHideUI(true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", forceHidden);
    document.addEventListener("visibilitychange", forceHidden);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", forceHidden);
      document.removeEventListener("visibilitychange", forceHidden);
    };
  }, [chromePinned]);

  // Pro Mode, touch: hold one finger down, tap with a second while the
  // first is still held — toggles the menu. No timer on the first finger;
  // "holding" just means it hasn't lifted yet when the second one lands.
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const activeTouches = new Set<number>();
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (!useStore.getState().proModeEnabled) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest("button, a, input, textarea, [role='slider'], [data-no-longpress]")) return;
      if (activeTouches.size >= 1) {
        setHideUI(v => !v);
        try { if ("vibrate" in navigator) (navigator as any).vibrate?.(15); } catch {}
      }
      activeTouches.add(e.pointerId);
    };
    const onUp = (e: PointerEvent) => { activeTouches.delete(e.pointerId); };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
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
      // Drives the two-stage fade of everything carrying `.ui-chrome`.
      data-idle={effectiveIdleStage}
      className={`editor-shell ${!isOverlay ? "tactile-cursor" : ""} bg-background text-foreground ${
        isPerformanceMode
          ? "fixed inset-0 z-[9999] flex flex-col overflow-hidden"
          : "min-h-screen flex flex-col"
      }`}
    >
      <Helmet>
        <title>Editor — MOSH</title>
        <meta name="description" content="Stack GPU effects, map audio to parameters, and perform live in the MOSH visual editor." />
        <link rel="canonical" href="https://ether-mosh.online/edit" />
        <meta property="og:title" content="MOSH Editor — Real-time visual instrument" />
        <meta property="og:description" content="Stack 107 GPU effects, sync to audio, export stills and video." />
        <meta property="og:url" content="https://ether-mosh.online/edit" />
      </Helmet>
      <h1 className="sr-only">MOSH Editor</h1>
      {/* Canvas — fills the viewport by default. All menu UI lives below the fold. */}
      <div
        ref={canvasContainerRef}
        data-mosh-surface
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
          if (e.shiftKey) { e.preventDefault(); crossfadeLayers(mosh, MOSH_FADE_MS); }
        }}
        className={`relative bg-background select-none w-full h-[100dvh] shrink-0 no-touch-scroll ${isCameraLive ? "live-ring" : ""}`}
      >
        <div data-tap-fade-target className="absolute inset-0 opacity-100">
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                className="flex h-full items-center justify-center bg-background font-mono text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--text-tertiary))]"
              >
                warming the visual engine…
              </div>
            }
          >
            <GlCanvas />
          </Suspense>
        </div>
        {freezeFrame && <FrozenFrame frame={freezeFrame} />}
        {!hasSource && !isOverlay && <StartCameraOverlay />}
        <SystemAudioHud visible={systemAudioEnabled && !isOverlay} />
        {hasSource && !isForge && !isMotif && !isOverlay && (
          <QuadrantSurface onTogglePerf={togglePerf} onTune={focusTune} />
        )}
        {/* Forge has no photo to assign roles on — GlCanvas binds a plain
            click-to-shuffle directly to its own canvas instead. */}
        {isForge && !isOverlay && <ForgeTapHint />}
        {/* Always visible, never idle-faded — unlike HotTriggers' effect
            triggers, this is how you get OUT of whichever mode you're in,
            and idle-fade would have hidden it by the exact moment you
            reach for it. */}
        {!isPerformanceMode && !isOverlay && <div className="desktop-visualizer-chrome"><SourceModeToggle hidden={hideUI} /></div>}
        <TrackpadGestures
          targetRef={canvasContainerRef}
          onTogglePerf={togglePerf}
          onMicFlash={(on) => setMicFlash({ on, key: performance.now() })}
        />
        <KaossSurface />
        <MoshStickerLayer />
        <RippleLayer />
        {!isOverlay && <InteractionFeedback />}
        <SourceTransition trigger={transitionKey} />
        
        {/* TapToBegin removed — StartCameraOverlay is the live-first empty state and TapToBegin's centered button used to intercept clicks meant for "go live". */} 
        {!isOverlay && (
          <HotTriggers
            visualizerRef={canvasContainerRef}
            hidden={hideUI || isPerformanceMode}
            showLegacyLaunchpad={legacyHotTriggers}
            isRecording={isRecording}
            onToggleRecord={toggleRecord}
            onScreenshot={takeScreenshot}
            onGif={captureGif}
            onSaveFavorite={saveFavoriteNow}
            onShare={shareCurrent}
            onSupport={() => navigate("/pricing")}
            onAccount={() => navigate("/account")}
            gifBusy={gifBusy}
            gifProgress={gifProgress}
            onFreeze={toggleSmartFreeze}
            onMicFlash={(on) => setMicFlash({ on, key: performance.now() })}
            showTrackNudge={showTrackNudge}
            onTrackNudgeDismiss={() => setShowTrackNudge(false)}
            journeyOn={journeyOn}
            journeyLocked={!paywall.isSupporter && !isForge}
            journeyPreview={isForge && !paywall.isSupporter}
            onToggleJourney={toggleJourney}
            isFullscreen={isBrowserFs}
            onToggleFullscreen={toggleFullscreen}
            onClearFx={clearAllFx}
            hasFx={layers.length > 0 || shuffleSec != null || journeyOn}
            onHome={() => {
              if (isRecording) { try { toggleRecord(); } catch {} }
              try { useStore.getState().reset(); } catch {}
              try { useStore.getState().clearVideoSource(); } catch {}
              try { useStore.getState().clearImage(); } catch {}
              try { useMoshStickerStore.getState().disposeAll(); } catch {}
              navigate("/");
            }}
          />
        )}
        {/* Standalone, not nested inside HotTriggers — the hot-trigger rail
            now lives inside a press-and-hold radial wheel that's hidden by
            default, which buried this prompt along with it and made it show
            up unreliably. This has to stay reachable regardless of whether
            that wheel (or idle-fade chrome) is open. */}
        {!isPerformanceMode && !isOverlay && showMicNudge && (
          <MicNudgeToast
            onYes={() => { setMicEnabled(true); setMicFlash({ on: true, key: performance.now() }); setShowMicNudge(false); }}
            onNo={() => setShowMicNudge(false)}
          />
        )}
        {journeyOn && (
          <div
            key={journeyFlashKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 animate-[smartFlash_420ms_ease-out_forwards]"
            style={{
              background: "radial-gradient(circle at 50% 50%, hsl(var(--accent) / 0.16), transparent 60%)",
              mixBlendMode: "screen",
            }}
          />
        )}

        {/* Journey readout. Hidden in performance mode — a projector wall is
            not the place for telemetry — but otherwise present, because an
            unattended director that never says what it is doing is
            indistinguishable from a broken one. */}
        {journeyOn && journeyState && !isPerformanceMode && !hideUI && (
          <div className="ui-chrome pointer-events-none absolute bottom-3 left-3 z-30 max-w-[min(22rem,60vw)] rounded-sm border border-[hsl(var(--border-subtle))] bg-black/40 px-3 py-2 backdrop-blur-md">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[hsl(var(--accent))]">
              journey · {journeyState.section}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed text-white/70">
              {micEnabled ? journeyState.reading.label : "no audio — pacing from motion alone"}
            </p>
            <p className="mt-1 font-mono text-[9px] leading-relaxed text-white/40">
              {journeyState.lastDisruption?.reason ?? "settling"}
              {` · next ${(journeyState.nextDisruptMs / 1000).toFixed(1)}s`}
            </p>
            {isForge && !paywall.isSupporter && (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[hsl(var(--accent))]">
                free preview · {formatForgeJourneyRemaining(forgePreviewRemainingMs)} remaining
              </p>
            )}
          </div>
        )}
        {!isPerformanceMode && !hideUI && (
          <div className="ui-chrome desktop-visualizer-chrome absolute top-3 right-3 z-40 pointer-events-auto">
            <AccountChip />
          </div>
        )}
        {/* Persistent reveal pin — deliberately NOT wrapped in .ui-chrome
            and NOT gated on !hideUI, since its entire job is to be the one
            thing that's always reachable when everything else is hidden
            (idle-fade, or Pro Mode's hold-Shift, which not everyone knows
            about). Subtle by default (low opacity, brightens on hover/when
            pinned) so it doesn't compete with the chrome it's rescuing. */}
        {!isPerformanceMode && !isOverlay && (
          <button
            type="button"
            onClick={() => {
              const next = !chromePinned;
              setChromePinned(next);
              setHideUI(!next); // pin -> reveal now; unpin -> fold away now
            }}
            aria-label={chromePinned ? "Unpin controls (fold away)" : "Pin controls (keep on screen)"}
            aria-pressed={chromePinned}
            title={chromePinned ? "Controls pinned — click to fold away" : "Keep controls on screen"}
            className={`desktop-visualizer-chrome absolute top-3 right-14 z-40 flex h-6 w-6 items-center justify-center rounded-full border transition pointer-events-auto ${
              chromePinned
                ? "border-[hsl(var(--accent))]/60 bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]"
                : "border-white/15 text-white/35 hover:border-white/35 hover:text-white/70"
            }`}
          >
            {chromePinned ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />}
          </button>
        )}
        {onboardingActive && !hasSource && (
          <OnboardingPrompts onComplete={() => { setOnboardingActive(false); markOnboardingSeen(); }} />
        )}
        {showBeforeAfter && (
          <input
            type="range" min={0} max={1} step={0.001} value={beforeAfterSplit}
            onChange={(e) => setBeforeAfterSplit(+e.target.value)}
            className="ui-chrome absolute left-1/2 -translate-x-1/2 bottom-6 w-2/3 accent-primary z-30"
          />
        )}
        {isPerformanceMode && (
          <PerformanceOverlay isRecording={isRecording} onExit={exitPerf} />
        )}
        {showFirstTip && !isPerformanceMode && (
          <PerformanceTooltip onDismiss={() => { setShowFirstTip(false); markPerfModeSeen(); }} />
        )}

      </div>

      {/* Unified menu rack — utility bar + tabs + panel. Lives below the fold.
          ui-chrome idle-fades it on inactivity, same as everything else;
          hideUI (H key / long-press) is the separate manual full-hide. */}
      {!isFullscreen && !hideUI && (
        <div data-cursor-zone="controls" className="ui-chrome relative z-10 flex flex-col border-t border-[hsl(var(--border-default))] bg-[hsl(var(--surface-1)/0.92)] backdrop-blur-md animate-in slide-in-from-bottom-4 duration-200">
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
              <CastStageButton />
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
              <div className="relative ml-1 flex">
                <button
                  onClick={exportBestStill}
                  disabled={exportBusy}
                  className="group relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-l-sm border border-r-0 border-primary/60 bg-gradient-to-r from-primary/90 via-primary to-primary-glow px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.45)] transition hover:shadow-[0_0_28px_hsl(var(--primary)/0.7)] active:scale-95"
                  title="Quick still export (⌘E)"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={2} />
                  <span>{exportBusy ? `${Math.round(exportProgress * 100)}%` : "Export"}</span>
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                </button>
                <button
                  type="button"
                  disabled={exportBusy}
                  aria-label="Print-ready export options"
                  aria-expanded={printExportOpen}
                  onClick={() => setPrintExportOpen(open => !open)}
                  className="flex h-8 w-7 items-center justify-center rounded-r-sm border border-primary/60 bg-primary text-primary-foreground"
                  title="Print-ready 5K / 8K · 300 DPI"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${printExportOpen ? "rotate-180" : ""}`} />
                </button>
                {printExportOpen && (
                  <div className="absolute right-0 top-10 z-[10020] w-56 rounded-sm border border-[hsl(var(--border-default))] bg-black/95 p-1.5 shadow-2xl backdrop-blur-md">
                    <p className="px-2 py-1 font-mono text-[8px] uppercase tracking-[0.2em] text-white/45">Print ready · actual pixels · 300 DPI</p>
                    {([5000, 8000] as const).map(size => (
                      <button key={size} type="button" onClick={() => void exportPrintStill(size, "jpg")} className="flex w-full items-center justify-between rounded-sm px-2 py-2 font-mono text-[10px] uppercase text-white/85 hover:bg-white/10">
                        <span>{size / 1000}K maximum-quality JPG</span><span className="text-primary">300</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => void exportPrintStill(5000, "png")} className="flex w-full items-center justify-between rounded-sm px-2 py-2 font-mono text-[10px] uppercase text-white/85 hover:bg-white/10">
                      <span>5K lossless PNG</span><span className="text-primary">300</span>
                    </button>
                  </div>
                )}
              </div>
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
            <section data-tune-panel>
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
            <section>
              <div className="section-header">
                <h2>MOSH &amp; Older Settings</h2><div className="rule" />
                <span className="badge">legacy</span>
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-4">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[hsl(var(--text-primary))]">
                    Legacy hot triggers launchpad
                  </div>
                  <p className="mt-1 max-w-[34rem] font-mono text-[9px] leading-relaxed text-[hsl(var(--text-secondary))]">
                    Restores the older right-side trigger strip. The radial wheel stays active.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={legacyHotTriggers}
                  aria-label="Legacy hot triggers launchpad"
                  onClick={() => {
                    setLegacyHotTriggers(current => {
                      const next = !current;
                      try { window.localStorage.setItem(LEGACY_HOT_TRIGGERS_KEY, next ? "1" : "0"); } catch {}
                      return next;
                    });
                  }}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${legacyHotTriggers ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent)/0.28)]" : "border-[hsl(var(--border-default))] bg-black/30"}`}
                >
                  <span className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all ${legacyHotTriggers ? "left-[23px] bg-[hsl(var(--accent))] shadow-[0_0_10px_hsl(var(--accent)/0.7)]" : "left-[3px] bg-[hsl(var(--text-tertiary))]"}`} />
                </button>
              </div>
            </section>
          </div>
        </div>
      )}


      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}

      <AboutTrigger hidden={hideUI || isPerformanceMode || isOverlay || effectiveIdleStage === "hidden"} />

      {helpCaption && (
        <div
          className="pointer-events-none fixed z-[10001] max-w-[220px] rounded-sm border border-[hsl(var(--accent))]/50 bg-black/85 px-2 py-1 font-mono text-[10px] leading-snug text-white/90 backdrop-blur-md"
          style={{ left: Math.min(helpCaption.x + 16, window.innerWidth - 232), top: helpCaption.y + 16 }}
        >
          {helpCaption.text}
        </div>
      )}


      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onTogglePerf={togglePerf}
        onToggleUI={() => setHideUI(v => !v)}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onExport={exportBestStill}
        onCopyPresetLink={copyPresetLink}
        onExportDeliverable={exportDeliverable}
        onSaveSetlist={saveSetlist}
        onLoadSetlist={loadSetlist}
        onSavePreset={saveFavoriteNow}
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

      {/* Action confirmation bubble */}
      {actionConfirm && (
        <ActionConfirmation
          title={
            actionConfirm.type === "gif"
              ? "Capture 7s GIF?"
              : "Start recording?"
          }
          subtitle={
            actionConfirm.type === "gif"
              ? "7 seconds · creates seamless loop"
              : undefined
          }
          autoConfirmMs={0}
          onConfirm={actionConfirm.onConfirm}
          onCancel={() => setActionConfirm(null)}
        />
      )}

    </main>
  );
}
