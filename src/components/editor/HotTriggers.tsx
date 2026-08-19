import { Mic, MicOff, Circle, Square, Sparkles, Scissors, Snowflake, Camera, Shuffle, Star, Play, Pencil, Trash2, X, Film, Lock, Share2, Compass, Maximize2, Minimize2, Gem, Home, SwitchCamera, Crosshair, Eraser, Link2, Upload, Music, Music2, Shuffle as ShuffleIcon, Undo2, Redo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { trackPlayer, DEFAULT_TRACK_TITLE } from "@/engine/trackPlayer";
import { requestCameraStream, type CameraFacing } from "@/hooks/useCamera";
import { IsolationPanel } from "./IsolationPanel";
import { AudioSourcePicker } from "./AudioSourcePicker";
import { shareUrl } from "@/lib/share";
import { toast } from "sonner";



type Props = {
  isRecording: boolean;
  onToggleRecord: () => void;
  onScreenshot: () => void;
  onFreeze: () => void;
  onGif: (seconds?: number) => void;
  onShare?: () => void;
  onSupport?: () => void;
  gifBusy?: boolean;
  gifProgress?: number; // 0..1
  onMicFlash?: (on: boolean) => void;
  journeyOn?: boolean;
  onToggleJourney?: () => void;
  journeyLocked?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onHome?: () => void;
  /** Drop every effect and show the bare remastered source. */
  onClearFx?: () => void;
  /** True when something is actually on — the button dims when there isn't. */
  hasFx?: boolean;
  /** Captures a thumbnail + shareable link, then saves. Falls back to the
   *  store's bare saveFavorite() (no thumb/link) if not provided. */
  onSaveFavorite?: () => void;
};

const SHUFFLE_TIMINGS = [5, 15, 30, 60, 120] as const;
const DEFAULT_SHUFFLE_SEC = 5;

/**
 * Stable, module-scoped button. Defining this inside HotTriggers made React
 * remount every button on every render — clicks landing during a remount were
 * dropped (record button appeared "stuck").
 *
 * `tint` gives the idle icon its own identity color — an "H S% L%" triple
 * (or a `var(--token)` reference) fed to `--ht-tint` in index.css — so the
 * rail reads as a legend of distinct functions instead of a wall of
 * identical gray glyphs. Active state still converges on the shared
 * magenta glow (`[data-active]`), kept as the one unambiguous "this is on"
 * signal across every trigger regardless of its resting color.
 */
function HotBtn({
  label, active, onClick, children, delay, tint, disabled,
}: {
  label: string;
  active?: boolean;
  delay: number;
  onClick: () => void;
  children: ReactNode;
  tint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ? true : undefined}
      aria-disabled={disabled || undefined}
      title={label}
      data-active={active || undefined}
      data-tint={tint ? "" : undefined}
      data-no-longpress
      className="hot-trigger"
      style={{ animationDelay: `${delay}ms`, ...(tint ? { ["--ht-tint" as string]: tint } : {}) }}
    >
      <span className="hot-trigger__glitch" aria-hidden>{children}</span>
      <span className="hot-trigger__ico">{children}</span>
    </button>
  );
}

/**
 * Theme-track hot-trigger: tap toggles play/pause, the small caret opens a
 * compact panel (now-playing title, load-your-own file, new drop-in point,
 * clear audio). Lives in the same `.hot-trigger` row and inherits whatever
 * idle/inactivity fade the row it's mounted in already has — no separate
 * timeout logic here.
 */
function TrackTrigger({ delay }: { delay: number }) {
  const trackEnabled = useStore(s => s.trackEnabled);
  const trackTitle = useStore(s => s.trackTitle);
  const setTrackEnabled = useStore(s => s.setTrackEnabled);
  const setTrackMeta = useStore(s => s.setTrackMeta);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative" data-shuffle-picker>
      <button
        type="button"
        aria-label={trackEnabled ? `Pause ${trackTitle}` : "Play theme track"}
        aria-pressed={trackEnabled}
        title={trackEnabled ? `Pause · ${trackTitle}` : "Play theme track"}
        data-active={trackEnabled || undefined}
        data-tint=""
        data-no-longpress
        className="hot-trigger"
        style={{ animationDelay: `${delay}ms`, ["--ht-tint" as string]: "262 68% 72%" }}
        onClick={() => setTrackEnabled(!trackEnabled)}
      >
        <span className="hot-trigger__glitch" aria-hidden>
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
        <span className="hot-trigger__ico">
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
      </button>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(o => !o)}
        aria-label="Track options"
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        data-no-longpress
        className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/70 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--accent))]"
        title="Track options"
      >
        <ShuffleIcon className="h-2 w-2" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="panel-in-3d absolute right-full top-0 z-50 mr-2 w-52 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2.5 backdrop-blur-md"
          role="menu"
          aria-label="Track options"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
            now playing
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-[hsl(var(--text-primary))]" title={trackTitle}>
            {trackTitle}
          </div>

          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => { trackPlayer.seekToRandomSensiblePoint(); setOpen(false); }}
            className="mt-2 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <ShuffleIcon className="h-3 w-3" /> new drop-in point
          </button>

          <button
            type="button"
            role="menuitem"
            data-no-longpress
            onClick={() => fileRef.current?.click()}
            className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
          >
            <Upload className="h-3 w-3" /> browse file
          </button>

          {trackEnabled && (
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              onClick={() => { trackPlayer.dispose(); setTrackEnabled(false); setTrackMeta(DEFAULT_TRACK_TITLE, ""); setOpen(false); }}
              className="mt-1 flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] transition hover:border-destructive hover:text-destructive"
            >
              <X className="h-3 w-3" /> clear all audio
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const url = URL.createObjectURL(f);
              const name = f.name.replace(/\.[^.]+$/, "");
              try {
                await trackPlayer.setSource(url, name, "");
                setTrackMeta(name, "");
                setTrackEnabled(true);
                setOpen(false);
              } catch (err) {
                console.error("[track] failed to load audio file:", err);
                URL.revokeObjectURL(url);
                toast.error("Couldn't load that audio file");
              }
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Floating cluster of "moshing" cute icons over the visualizer.
 * The DOM overlay is outside <canvas>, so canvas.captureStream() never records these.
 */
export function HotTriggers({ isRecording, onToggleRecord, onScreenshot, onFreeze, onGif, onShare, onSupport, gifBusy, gifProgress, onMicFlash, journeyOn, onToggleJourney, journeyLocked, isFullscreen, onToggleFullscreen, onHome, onClearFx, hasFx, onSaveFavorite }: Props) {
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const mosh = useStore(s => s.mosh);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const favorites = useStore(s => s.favorites);
  const saveFavorite = useStore(s => s.saveFavorite);
  const applyFavorite = useStore(s => s.applyFavorite);
  const removeFavorite = useStore(s => s.removeFavorite);
  const renameFavorite = useStore(s => s.renameFavorite);
  const heldRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const favHeldRef = useRef(false);
  const favHoldTimerRef = useRef<number | null>(null);

  // Switch-camera — only shown on touch devices when a live camera stream is active
  const [isTouchScreen, setIsTouchScreen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchScreen(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const videoStream = useStore(s => s.videoStream);
  const cameraFacing = useStore(s => s.cameraFacing);
  const setVideoSource = useStore(s => s.setVideoSource);
  const clearVideoSource = useStore(s => s.clearVideoSource);
  const [flipBusy, setFlipBusy] = useState(false);

  const isolationMode = useStore(s => s.isolationMode);
  const stickerMode = useStore(s => s.stickerMode);
  const setStickerMode = useStore(s => s.setStickerMode);
  const [isoOpen, setIsoOpen] = useState(false);

  useEffect(() => {
    if (!isoOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-iso-panel]")) return;
      setIsoOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [isoOpen]);


  const flipCamera = async () => {
    if (flipBusy || !videoStream) return;
    setFlipBusy(true);
    // Determine next facing from store (reliable) instead of track.getSettings() (unreliable on iOS)
    const next: CameraFacing = cameraFacing === "user" ? "environment" : "user";
    try {
      // Stop current tracks — iOS requires them fully stopped before a new getUserMedia
      videoStream.getTracks().forEach(t => t.stop());
      // Give iOS 150 ms to release the hardware (Promise.resolve / microtask is too short)
      await new Promise<void>(r => setTimeout(r, 150));
      const stream = await requestCameraStream({ facing: next });
      setVideoSource(stream, next === "user" ? "front camera" : "rear camera");
    } catch {
      // Flip failed — clear the dead stream so the user can re-open the camera from the menu
      clearVideoSource();
      toast.error("Couldn't switch camera. Tap the camera button to reconnect.");
    } finally {
      setFlipBusy(false);
    }
  };

  // Close the mic/device-audio source picker on outside tap
  useEffect(() => {
    if (!audioPickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-audio-source-picker]")) return;
      setAudioPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [audioPickerOpen]);

  // Close picker on outside tap
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-shuffle-picker]")) return;
      setPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [pickerOpen]);

  // Close favorites panel on outside tap
  useEffect(() => {
    if (!favOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-fav-panel]")) return;
      setFavOpen(false);
      setRenameId(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [favOpen]);

  // Keyboard-driven openers (Shift+S opens favorites list; Shift+A cycles shuffle timing)
  useEffect(() => {
    const openFav = () => setFavOpen(v => !v);
    const cycleShuffle = () => {
      const ladder = [null, 5, 15, 30, 60, 120] as const;
      const cur = useStore.getState().shuffleSec;
      const idx = ladder.findIndex(v => v === cur);
      const next = ladder[(idx + 1) % ladder.length];
      useStore.getState().setShuffleSec(next);
    };
    window.addEventListener("mosh:toggle-favorites", openFav);
    window.addEventListener("mosh:cycle-shuffle", cycleShuffle);
    return () => {
      window.removeEventListener("mosh:toggle-favorites", openFav);
      window.removeEventListener("mosh:cycle-shuffle", cycleShuffle);
    };
  }, []);


  const startHold = () => {
    heldRef.current = false;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      setPickerOpen(true);
      try { (navigator as any).vibrate?.(10); } catch {}
    }, 420);
  };
  const endHold = () => {
    if (holdTimerRef.current) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };
  const toggleShuffle = () => {
    if (heldRef.current) return;
    setShuffleSec(shuffleSec == null ? DEFAULT_SHUFFLE_SEC : null);
  };

  const startFavHold = () => {
    favHeldRef.current = false;
    if (favHoldTimerRef.current) window.clearTimeout(favHoldTimerRef.current);
    favHoldTimerRef.current = window.setTimeout(() => {
      favHeldRef.current = true;
      // Long-press = quick save without opening the panel (power-user shortcut).
      (onSaveFavorite ?? saveFavorite)();
      try { (navigator as any).vibrate?.(15); } catch {}
    }, 480);
  };
  const endFavHold = () => {
    if (favHoldTimerRef.current) { window.clearTimeout(favHoldTimerRef.current); favHoldTimerRef.current = null; }
  };
  const onFavTap = () => {
    if (favHeldRef.current) return; // long-press already saved
    // Tap = open the favorites panel (obvious entry point). The panel itself
    // has a prominent "+ save current mosh" button.
    setFavOpen(v => !v);
  };

  return (
    /* top-14 keeps the rail clear of the account chip pinned at top-3/right-3
       (z-40), which would otherwise sit on top of the first trigger. */
    <div
      className="ui-chrome hot-triggers pointer-events-none absolute right-3 top-14 z-30 flex flex-col items-end gap-1 safe-top safe-right"
    >
      {/* Auto-wrapping rail: fills a column, then starts a second one inward.
          No overflow clipping, so left-opening panels stay visible. */}
      <div
        className="hot-trigger-rail pointer-events-auto"
      >
        {onHome && (
          <HotBtn delay={0} label="Back to start" onClick={onHome} tint="220 12% 80%">
            <Home className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}

        <HotBtn delay={0} label="Undo" onClick={undo} disabled={!canUndo} tint="210 10% 75%">
          <Undo2 className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
        <HotBtn delay={0} label="Redo" onClick={redo} disabled={!canRedo} tint="210 10% 75%">
          <Redo2 className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        {onToggleFullscreen && (
          <HotBtn
            delay={0}
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            active={isFullscreen}
            onClick={onToggleFullscreen}
            tint="184 90% 60%"
          >
            {isFullscreen
              ? <Minimize2 className="h-4 w-4" strokeWidth={1.5} />
              : <Maximize2 className="h-4 w-4" strokeWidth={1.5} />}
          </HotBtn>
        )}
        {isTouchScreen && videoStream && (
          <HotBtn delay={0} label="Switch camera" onClick={flipCamera} active={flipBusy} tint="212 80% 70%">
            <SwitchCamera className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}

        <HotBtn
          delay={0}
          label={isRecording ? "Stop recording" : "One-tap record"}
          active={isRecording}
          onClick={onToggleRecord}
          tint="var(--signal-live)"
        >
          {isRecording
            ? <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
            : <Circle className="h-4 w-4" strokeWidth={1.5} />}
        </HotBtn>

        <div className="relative" data-audio-source-picker>
          <HotBtn
            delay={60}
            label={micEnabled ? "Mic on" : systemAudioEnabled ? "Device audio on" : "Listen mode"}
            active={micEnabled || systemAudioEnabled}
            tint="var(--signal-good)"
            onClick={() => {
              // Already listening — a tap just stops whichever source is active.
              if (micEnabled) { setMicEnabled(false); onMicFlash?.(false); return; }
              if (systemAudioEnabled) { setSystemAudioEnabled(false); onMicFlash?.(false); return; }
              // Nothing active yet — ask which source, since grabbing the
              // physical mic will interrupt Bluetooth/other playback.
              setAudioPickerOpen(v => !v);
            }}
          >
            {(micEnabled || systemAudioEnabled)
              ? <Mic className="h-4 w-4" strokeWidth={1.5} />
              : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
          </HotBtn>
          {audioPickerOpen && (
            <AudioSourcePicker
              className="absolute right-full mr-2 top-0 z-40"
              onClose={() => { setAudioPickerOpen(false); onMicFlash?.(true); }}
            />
          )}
        </div>

        <TrackTrigger delay={70} />

        {/* Auto-shuffle — dropdown opens LEFT */}
        <div className="relative" data-shuffle-picker>
          <button
            type="button"
            aria-label={shuffleSec ? `Auto-shuffle ${shuffleSec}s (hold for timing)` : "Auto-shuffle (hold for timing)"}
            aria-pressed={shuffleSec != null}
            title={shuffleSec ? `Shuffle every ${shuffleSec}s — hold for timing` : "Auto-shuffle — hold for timing"}
            data-active={shuffleSec != null || undefined}
            data-tint=""
            data-no-longpress
            className="hot-trigger"
            style={{ animationDelay: `120ms`, ["--ht-tint" as string]: "36 90% 60%" }}
            onClick={toggleShuffle}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => { e.preventDefault(); setPickerOpen(true); }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Shuffle className="h-4 w-4" strokeWidth={1.5} /></span>
            {shuffleSec != null && (
              <span className="absolute -bottom-1 -right-1 rounded-sm bg-[hsl(var(--accent))] px-1 font-mono text-[8px] leading-[10px] text-black">
                {shuffleSec}s
              </span>
            )}
          </button>
          {pickerOpen && (
            <div
              data-shuffle-picker
              className="absolute right-full mr-2 top-0 z-40 flex flex-col gap-0.5 rounded-md border border-white/10 bg-black/75 p-1 backdrop-blur-md panel-in-3d"
            >
              <button
                type="button"
                onClick={() => { setShuffleSec(null); setPickerOpen(false); }}
                data-active={shuffleSec == null || undefined}
                className="w-full rounded px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/10 hover:text-white data-[active]:text-[hsl(var(--accent))]"
              >
                off
              </button>
              {SHUFFLE_TIMINGS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setShuffleSec(s); setPickerOpen(false); }}
                  data-active={shuffleSec === s || undefined}
                  className="w-full rounded px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/10 hover:text-white data-[active]:text-[hsl(var(--accent))]"
                >
                  {s}s
                </button>
              ))}
            </div>
          )}
        </div>

        <HotBtn delay={180} label="Mosh" onClick={mosh} tint="12 90% 58%">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        {onClearFx && (
          <button
            type="button"
            onClick={onClearFx}
            disabled={!hasFx}
            aria-label="Clear all effects and show the remastered source"
            title="Clear all FX — show the remastered source only"
            data-tint=""
            data-no-longpress
            className="hot-trigger"
            style={{ animationDelay: `190ms`, ["--ht-tint" as string]: "0 0% 66%" }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Eraser className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Eraser className="h-4 w-4" strokeWidth={1.5} /></span>
          </button>
        )}

        {/* Journey — Smart and Storm combined into one director.

            They were two buttons doing halves of the same job: Smart chose what
            suited the moment but never touched it again until the next switch;
            Storm never chose well but never let the frame sit still. Journey
            runs Smart's judgement on a slow unpredictable clock and Storm's
            interference on a fast bounded one. */}
        {onToggleJourney && (
          <button
            type="button"
            onClick={onToggleJourney}
            aria-label={journeyLocked ? "Journey (supporter unlock)" : (journeyOn ? "Journey mode on" : "Journey mode off")}
            aria-pressed={journeyOn || undefined}
            title={journeyLocked
              ? "Journey · supporter unlock (I)"
              : (journeyOn ? "Journey on · directing itself from motion & sound (I)" : "Journey · sit back, it directs itself (I)")}
            data-active={journeyOn || undefined}
            data-tint=""
            data-no-longpress
            className="hot-trigger relative"
            style={{ animationDelay: `195ms`, ["--ht-tint" as string]: "248 70% 74%" }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Compass className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Compass className="h-4 w-4" strokeWidth={1.5} /></span>
            {journeyLocked && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 rounded-sm bg-black/70 p-[1px] text-[hsl(var(--accent))]">
                <Lock className="h-2 w-2" strokeWidth={2} />
              </span>
            )}
            {journeyOn && !journeyLocked && (
              <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
            )}
          </button>
        )}

        {/* AI Isolation — dropdown opens LEFT */}
        <div className="relative" data-iso-panel>
          <HotBtn
            delay={207}
            label="Isolation mode"
            active={isolationMode !== 'off'}
            onClick={() => setIsoOpen(v => !v)}
            tint="174 65% 55%"
          >
            <Crosshair className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
          {isolationMode !== 'off' && (
            <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
          )}
          {isoOpen && (
            <div className="absolute right-full mr-2 top-0 z-40">
              <IsolationPanel onClose={() => setIsoOpen(false)} />
            </div>
          )}
        </div>

        {/* Sticker Capture Mode */}
        <HotBtn
          delay={220}
          label="Sticker capture mode"
          active={stickerMode}
          onClick={() => setStickerMode(!stickerMode)}
          tint="96 55% 62%"
        >
          <Scissors className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        {/* Favorites — dropdown opens LEFT */}
        <div className="relative" data-fav-panel>
          <button
            type="button"
            aria-label={favOpen ? "Close favorites" : "Open favorites (hold to quick-save)"}
            title="Favorites — tap to open, hold to save current mosh"
            data-active={favOpen || undefined}
            data-tint=""
            data-no-longpress
            className="hot-trigger"
            style={{ animationDelay: `210ms`, ["--ht-tint" as string]: "var(--signal-warn)" }}
            onClick={onFavTap}
            onPointerDown={startFavHold}
            onPointerUp={endFavHold}
            onPointerLeave={endFavHold}
            onPointerCancel={endFavHold}
            onContextMenu={(e) => { e.preventDefault(); setFavOpen(true); }}
          >
            <span className="hot-trigger__glitch" aria-hidden><Star className="h-4 w-4" strokeWidth={1.5} /></span>
            <span className="hot-trigger__ico"><Star className="h-4 w-4" strokeWidth={1.5} /></span>
            {favorites.length > 0 && (
              <span className="absolute -bottom-1 -right-1 rounded-sm bg-[hsl(var(--accent))] px-1 font-mono text-[8px] leading-[10px] text-black">
                {favorites.length}
              </span>
            )}
          </button>
          {favOpen && (
            <div
              data-fav-panel
              className="absolute right-full mr-2 top-0 z-40 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md panel-in-3d"
            >
              <div className="flex items-center justify-between px-1 pb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">★ favorites</span>
                <div className="flex items-center gap-2">
                  <a
                    href="/favorites"
                    className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/50 hover:text-[hsl(var(--accent))]"
                  >
                    gallery →
                  </a>
                  <button
                    type="button"
                    onClick={() => { setFavOpen(false); setRenameId(null); }}
                    className="text-white/50 hover:text-white"
                    aria-label="close"
                  >
                    <X className="h-3 w-3" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { (onSaveFavorite ?? saveFavorite)(); }}
                className="mb-1.5 w-full rounded border border-dashed border-white/15 px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
              >
                + save current mosh
              </button>
              {favorites.length === 0 ? (
                <div className="px-1 py-3 text-center font-mono text-[9px] uppercase tracking-[0.15em] text-white/40">
                  no favorites yet
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {favorites.map((f) => {
                    const renaming = renameId === f.id;
                    return (
                      <li key={f.id} className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5">
                        {renaming ? (
                          <input
                            autoFocus
                            value={renameVal}
                            onChange={(e) => setRenameVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { renameFavorite(f.id, renameVal); setRenameId(null); }
                              if (e.key === "Escape") { setRenameId(null); }
                            }}
                            onBlur={() => { renameFavorite(f.id, renameVal); setRenameId(null); }}
                            className="flex-1 min-w-0 rounded-sm border border-[hsl(var(--accent))]/40 bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => { applyFavorite(f.id); setFavOpen(false); }}
                            className="flex-1 min-w-0 truncate text-left font-mono text-[10px] uppercase tracking-[0.12em] text-white/85 hover:text-[hsl(var(--accent))]"
                            title={`${f.layers.length} layers · ${f.createdAt ? new Date(f.createdAt).toLocaleString() : "saved preset"}`}
                          >
                            <span className="truncate">{f.name}</span>
                            <span className="ml-1 text-white/35">·{f.layers.length}L</span>
                          </button>
                        )}
                        {!renaming && (
                          <>
                            <button
                              type="button"
                              onClick={() => { applyFavorite(f.id); setFavOpen(false); }}
                              className="text-white/40 hover:text-[hsl(var(--accent))]"
                              aria-label="apply"
                              title="apply"
                            >
                              <Play className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                            {f.link && (
                              <button
                                type="button"
                                onClick={() => shareUrl(f.link!)}
                                className="text-white/40 hover:text-[hsl(var(--accent))] opacity-0 group-hover:opacity-100"
                                aria-label="copy link"
                                title="copy instant-replay link"
                              >
                                <Link2 className="h-3 w-3" strokeWidth={1.5} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}
                              className="text-white/40 hover:text-white opacity-0 group-hover:opacity-100"
                              aria-label="rename"
                              title="rename"
                            >
                              <Pencil className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFavorite(f.id)}
                              className="text-white/40 hover:text-red-400 opacity-0 group-hover:opacity-100"
                              aria-label="delete"
                              title="delete"
                            >
                              <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <HotBtn delay={240} label="Freeze" onClick={onFreeze} tint="200 80% 76%">
          <Snowflake className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
        <HotBtn delay={300} label="Screenshot" onClick={onScreenshot} tint="40 20% 84%">
          <Camera className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>

        <GifButton onGif={onGif} gifBusy={gifBusy} gifProgress={gifProgress} />

        {onShare && (
          <HotBtn delay={400} label="Share" onClick={onShare} tint="228 85% 72%">
            <Share2 className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}
        {onSupport && (
          <HotBtn delay={440} label="Support MOSH" onClick={onSupport} tint="280 70% 72%">
            <Gem className="h-4 w-4" strokeWidth={1.5} />
          </HotBtn>
        )}
      </div>

      {isRecording && (
        <div className="pointer-events-none flex items-center gap-1 rounded-sm bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-red-400 backdrop-blur-sm">
          <Circle className="h-1.5 w-1.5 fill-current animate-pulse" />
          REC
        </div>
      )}
    </div>
  );
}

/** Loop lengths offered when the GIF trigger is tapped. */
const GIF_LENGTHS = [3, 5, 7] as const;

/**
 * GIF trigger.
 *
 * A tap always opens the length menu; there is no default capture. Hiding the
 * choice behind a press-and-hold made it undiscoverable — the control looked
 * identical whether or not the options existed, so most people never found
 * them. Two taps that are both obvious beat one tap plus a hidden gesture.
 *
 * Dropping the hold also removes the timer, the held-flag, and the guard
 * against the click that follows a touch release firing a second capture.
 */
function GifButton({
  onGif, gifBusy, gifProgress,
}: { onGif: (seconds?: number) => void; gifBusy?: boolean; gifProgress?: number }) {
  const [open, setOpen] = useState(false);

  // Dismiss on any outside interaction, so the menu cannot strand itself open
  // over the canvas during a set.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Bubble on purpose: the trigger and menu stop pointerdown propagation so
    // an inside tap can finish as a click before the menu is unmounted. A
    // capture-phase listener runs first and used to delete the timing button
    // mid-gesture, so onGif was never called.
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  useEffect(() => { if (gifBusy) setOpen(false); }, [gifBusy]);

  return (
    <div className="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => { if (!gifBusy) setOpen(o => !o); }}
        aria-label={gifBusy ? "Capturing GIF loop…" : "Capture seamless GIF loop"}
        aria-pressed={gifBusy || undefined}
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        title="Seamless GIF loop — choose 3s / 5s / 7s (G)"
        data-active={(gifBusy || open) || undefined}
        data-tint=""
        data-no-longpress
        disabled={gifBusy}
        className="hot-trigger relative"
        style={{ animationDelay: `360ms`, ["--ht-tint" as string]: "300 70% 70%" }}
      >
        <span className="hot-trigger__glitch" aria-hidden><Film className="h-4 w-4" strokeWidth={1.5} /></span>
        <span className="hot-trigger__ico"><Film className="h-4 w-4" strokeWidth={1.5} /></span>
        {gifBusy && (
          <span
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-[hsl(var(--accent))] origin-left"
            style={{ transform: `scaleX(${Math.max(0.02, gifProgress ?? 0)})`, transition: "transform 80ms linear" }}
          />
        )}
      </button>

      {open && !gifBusy && (
        <div
          className="panel-in-3d absolute right-full top-0 z-50 mr-2 flex items-center gap-1 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-1 backdrop-blur-md"
          role="menu"
          aria-label="GIF loop length"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {GIF_LENGTHS.map((sec) => (
            <button
              key={sec}
              type="button"
              role="menuitem"
              data-no-longpress
              onClick={() => { setOpen(false); onGif(sec); }}
              className="min-w-[34px] rounded-sm border border-transparent px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--text-secondary))] hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] transition"
            >
              {sec}s
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
