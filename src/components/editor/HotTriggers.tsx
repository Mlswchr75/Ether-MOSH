import { Mic, MicOff, Circle, Square, Sparkles, Scissors, Snowflake, Camera, Shuffle, Star, Play, Pencil, Trash2, X, Film, Lock, Share2, Compass, Maximize2, Minimize2, Gem, Home, SwitchCamera, Crosshair, Eraser, Link2, Upload, Music, Music2, Shuffle as ShuffleIcon, Undo2, Redo2, Gauge, ChevronDown, MonitorSpeaker, Heart, GripVertical, RotateCcw, EyeOff, HelpCircle, SkipBack, SkipForward, Palette, Flame, UserCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/useStore";
import { trackPlayer, DEFAULT_TRACK_TITLE, SHOWCASE_TRACKS } from "@/engine/trackPlayer";
import { runTrackAction } from "@/engine/trackActions";
import { requestCameraStream, type CameraFacing } from "@/hooks/useCamera";
import { IsolationPanel } from "./IsolationPanel";
import { ForgePanel } from "./ForgePanel";
import { MoshStickerTrigger } from "./MoshStickerTrigger";
import { shareUrl } from "@/lib/share";
import { toggleSystemAudio } from "@/engine/systemAudio";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";
import { cursorFx } from "@/engine/cursorFx";
import { toast } from "sonner";
import { clampRadialPoint, defaultRadialPoint, nearestRadialId, type RadialLayout } from "@/lib/radialLayout";

/** Viewport-normalized UV for a client point — used for the one-shot "digital
 *  chaos" burst a hold-branch fires at. An approximation (viewport, not the
 *  canvas's own rect): these buttons sit visually over the canvas in every
 *  layout this app has, and the burst is a decorative one-shot, so the small
 *  error possible in a windowed, non-fullscreen layout is imperceptible. */
function clientToViewportUv(clientX: number, clientY: number) {
  return {
    x: Math.min(1, Math.max(0, clientX / Math.max(1, window.innerWidth))),
    y: Math.min(1, Math.max(0, 1 - clientY / Math.max(1, window.innerHeight))),
  };
}



type Props = {
  visualizerRef?: RefObject<HTMLElement>;
  hidden?: boolean;
  isRecording: boolean;
  onToggleRecord: () => void;
  onScreenshot: () => void;
  onFreeze: () => void;
  onGif: (seconds?: number) => void;
  onShare?: () => void;
  onSupport?: () => void;
  onAccount?: () => void;
  gifBusy?: boolean;
  gifProgress?: number; // 0..1
  onMicFlash?: (on: boolean) => void;
  journeyOn?: boolean;
  onToggleJourney?: () => void;
  journeyLocked?: boolean;
  journeyPreview?: boolean;
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
  /** First real content this session and nothing's listening yet — nudge
   *  toward turning the mic on, anchored to the audio trigger. */
  showMicNudge?: boolean;
  onMicNudgeYes?: () => void;
  onMicNudgeNo?: () => void;
  onMicNudgeExpire?: () => void;
  /** After a minute of silent play, invite the user to start a soundtrack. */
  showTrackNudge?: boolean;
  onTrackNudgeDismiss?: () => void;
};

const MOBILE_WHEEL_HOLD_MS = 500;
const MOBILE_WHEEL_FLICK_PX = 54;
const MOBILE_WHEEL_ROTATION_KEY = "cathedral_mobile_radial_rotation_v1";
const DESKTOP_WHEEL_HOLD_MS = 400;
const DESKTOP_WHEEL_LAYOUT_KEY = "cathedral_desktop_radial_layout_v1";

export function normalizeRadialDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function radialIndexForAngle(angle: number, count: number, rotation = 0) {
  if (count <= 0) return -1;
  const step = 360 / count;
  return Math.round(normalizeRadialDegrees(angle - rotation) / step) % count;
}

export function radialTriggerIndex(angle: number, distance: number, total: number, rotation = 0) {
  if (total <= 0) return -1;
  const outerCount = Math.min(14, total);
  const innerCount = Math.max(0, total - outerCount);
  const useInnerRing = innerCount > 0 && distance < 112;
  const ringIndex = radialIndexForAngle(angle, useInnerRing ? innerCount : outerCount, rotation);
  return useInnerRing ? outerCount + ringIndex : ringIndex;
}

/** Auto-Mosh / auto-shuffle interval options — the one list every surface
 *  that touches shuffleSec draws from (this rail, its keyboard cycle in
 *  Editor.tsx, and the bottom-panel ShufflePanel), so "5s here, 3s there"
 *  can't happen again. */
export const AUTO_MOSH_TIMINGS = [3, 15, 30, 60, 300, 600] as const;
const DEFAULT_AUTO_MOSH_SEC = 15;

/** Every trigger the rail can show, in the order a first-time visitor would
 *  most plausibly want to meet them: escape hatches and undo first, the two
 *  actions that actually make the image move (Mosh / Auto-Mosh) grouped with
 *  what tames them (Clear FX, Journey), then how it reacts to sound, then
 *  capture/export, then the deeper creative tools, then account-adjacent and
 *  situational stuff last. Not load-bearing for anything but the *default*
 *  order — "customize layout" lets anyone override it per-browser. */
const DEFAULT_ORDER = [
  "home", "source-upload", "source-camera", "source-forge", "account", "undo", "redo",
  "mosh", "auto-mosh", "clear-fx", "journey",
  "audio", "sensitivity",
  "freeze", "capture", "gif", "share",
  "mosh-sticker", "sticker-mode", "sticker-capture", "isolation", "theme-track",
  "forge-palette", "favorites", "fullscreen", "pro-mode", "switch-camera", "support",
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  home: "Back to start", undo: "Undo", redo: "Redo",
  "source-upload": "Upload source", "source-camera": "Live camera", "source-forge": "Forge source", account: "Account",
  mosh: "Mosh", "auto-mosh": "Auto-Mosh", "clear-fx": "Clear FX", journey: "Journey",
  audio: "Audio (mic / device / beat sync)", sensitivity: "Sensitivity",
  "pro-mode": "Pro Mode — hide all UI",
  freeze: "Freeze", capture: "Capture — tap for a still, hold to record", gif: "GIF loop", share: "Share",
  "mosh-sticker": "Mosh sticker", "sticker-mode": "Sticker capture", isolation: "AI isolation",
  "sticker-capture": "Capture sticker",
  "theme-track": "Theme track", favorites: "Favorites", fullscreen: "Fullscreen",
  "forge-palette": "Forge palette and settings",
  "switch-camera": "Switch camera", support: "Support MOSH",
};

const ORDER_KEY = "cathedral_hot_trigger_order_v1";

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER];
    const known = new Set(DEFAULT_ORDER as readonly string[]);
    const kept = parsed.filter((id: unknown): id is string => typeof id === "string" && known.has(id));
    const missing = DEFAULT_ORDER.filter(id => !kept.includes(id));
    return [...kept, ...missing];
  } catch {
    return [...DEFAULT_ORDER];
  }
}
function saveOrder(order: string[]) {
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch {}
}

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
  onPointerDown, onPointerUp, onPointerCancel,
}: {
  label: string;
  active?: boolean;
  delay: number;
  onClick: () => void;
  children: ReactNode;
  tint?: string;
  disabled?: boolean;
  /** Optional hold gesture, layered on top of the plain click — see the
   *  Pro Mode button for the one caller that uses these. */
  onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerCancel}
      onPointerCancel={onPointerCancel}
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
function TrackNudgeToast({ onPlay, onDismiss }: { onPlay: () => void; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLeaving(true), 30_000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDismiss, 520);
    return () => window.clearTimeout(t);
  }, [leaving, onDismiss]);

  return (
    <div
      role="status"
      className={`absolute right-full mr-2 top-0 z-50 w-56 rounded-md border border-[hsl(var(--accent))]/40 bg-black/90 p-2.5 backdrop-blur-md panel-in-3d ${leaving ? "bg-glitch-pulse" : ""}`}
      style={leaving ? undefined : { animation: "panel-in 180ms ease-out both" }}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent))]">
        <Music2 className="h-3 w-3" strokeWidth={1.5} /> need a soundtrack?
      </div>
      <p className="mt-1 text-[10px] leading-tight text-white/60">
        Start the music trigger and MOSH will pick a track at random.
      </p>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={onPlay}
          className="flex-1 rounded-sm border border-[hsl(var(--accent))]/50 bg-[hsl(var(--accent))]/10 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--accent))]/20"
        >
          Play random
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 rounded-sm border border-white/15 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:text-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function TrackTrigger({ delay, showNudge, onNudgeDismiss }: { delay: number; showNudge?: boolean; onNudgeDismiss?: () => void }) {
  const trackEnabled = useStore(s => s.trackEnabled);
  const trackTitle = useStore(s => s.trackTitle);
  const setTrackEnabled = useStore(s => s.setTrackEnabled);
  const setTrackMeta = useStore(s => s.setTrackMeta);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startRandomTrack = () => {
    runTrackAction(() => trackPlayer.shuffleShowcaseTrack());
    onNudgeDismiss?.();
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  useEffect(() => {
    const browse = () => fileRef.current?.click();
    window.addEventListener("mosh:browse-audio-track", browse);
    return () => window.removeEventListener("mosh:browse-audio-track", browse);
  }, []);

  return (
    <div ref={wrapRef} className="relative" data-shuffle-picker>
      <button
        type="button"
        aria-label={trackEnabled ? `Pause ${trackTitle}` : "Play a random MOSH track"}
        aria-pressed={trackEnabled}
        title={trackEnabled ? `Pause · ${trackTitle}` : "Play a random track"}
        data-active={trackEnabled || undefined}
        data-tint=""
        data-no-longpress
        className="hot-trigger"
        style={{ animationDelay: `${delay}ms`, ["--ht-tint" as string]: "262 68% 72%" }}
        onClick={() => trackEnabled ? setTrackEnabled(false) : startRandomTrack()}
      >
        <span className="hot-trigger__glitch" aria-hidden>
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
        <span className="hot-trigger__ico">
          {trackEnabled ? <Music className="h-4 w-4" strokeWidth={1.5} /> : <Music2 className="h-4 w-4" strokeWidth={1.5} />}
        </span>
      </button>
      {showNudge && <TrackNudgeToast onPlay={startRandomTrack} onDismiss={() => onNudgeDismiss?.()} />}
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

          {/* Bigger, obviously-tappable transport row — the small text
              menu items below are fine for occasional actions, but
              skip/shuffle are meant to be reached for repeatedly. */}
          <div className="mt-2.5 flex items-center justify-center gap-2">
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              aria-label="Previous showcase track ([ key)"
              title="Previous track — ["
              onClick={() => runTrackAction(() => trackPlayer.prevShowcaseTrack())}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] active:scale-95"
            >
              <SkipBack className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              aria-label="Shuffle showcase tracks (\ key)"
              title="Shuffle — \"
              onClick={() => runTrackAction(() => trackPlayer.shuffleShowcaseTrack())}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--accent))]/50 text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--accent))]/10 active:scale-95"
            >
              <ShuffleIcon className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              role="menuitem"
              data-no-longpress
              aria-label="Next showcase track (] key)"
              title="Next track — ]"
              onClick={() => runTrackAction(() => trackPlayer.nextShowcaseTrack())}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border-default))] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] active:scale-95"
            >
              <SkipForward className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="mt-2.5 mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">
            showcase
          </div>
          <div className="flex flex-col gap-0.5">
            {SHOWCASE_TRACKS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                data-no-longpress
                data-active={trackEnabled && trackTitle === t.title || undefined}
                onClick={() => { setOpen(false); runTrackAction(() => trackPlayer.useShowcaseTrack(t.id)); }}
                className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] data-[active]:border-[hsl(var(--accent))]/40 data-[active]:text-[hsl(var(--accent))]"
              >
                <Music2 className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{t.title}</span>
              </button>
            ))}
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
 * Nudges toward turning the mic on the first time there's actually something
 * on screen this session. Anchored as a sibling of the audio trigger (same
 * recipe HintPulse uses elsewhere: a `relative` wrapper, this drops in next
 * to it) rather than a portal, so it visually points straight at the button
 * it's asking about. Stays up to 60s, then glitches out via the same one-shot
 * bg-glitch-pulse used for ambient corruption elsewhere in the app.
 */
function MicNudgeToast({ onYes, onNo, onExpire }: { onYes: () => void; onNo: () => void; onExpire: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLeaving(true), 60_000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onExpire, 520);
    return () => window.clearTimeout(t);
  }, [leaving, onExpire]);

  return (
    <div
      role="status"
      className={`absolute right-full mr-2 top-0 z-50 w-56 rounded-md border border-[hsl(var(--accent))]/40 bg-black/90 p-2.5 backdrop-blur-md panel-in-3d ${leaving ? "bg-glitch-pulse" : ""}`}
      style={leaving ? undefined : { animation: "panel-in 180ms ease-out both" }}
    >
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent))]">
        <Mic className="h-3 w-3" strokeWidth={1.5} /> react to sound?
      </div>
      <p className="mt-1 text-[10px] leading-tight text-white/60">
        Turn on the mic (or route a tab's audio) and the effects move with it.
      </p>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => { onYes(); }}
          className="flex-1 rounded-sm border border-[hsl(var(--accent))]/50 bg-[hsl(var(--accent))]/10 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--accent))]/20"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => { onNo(); }}
          className="flex-1 rounded-sm border border-white/15 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/60 transition hover:text-white"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

/**
 * Unified audio control: the main tap keeps its old job (turn whichever
 * source is listening off, or ask which one to start if nothing is), and a
 * small caret — same affordance as the track trigger's — always opens the
 * full panel: pick a source, AND Beat Sync, which used to live only in the
 * bottom Beat & Audio panel. Beat Sync and Listen Mode were never actually
 * separate concerns from "what's this thing listening to," they were just
 * drawn in three different places; this is the one place now.
 */
function AudioTrigger({ delay, onMicFlash }: { delay: number; onMicFlash?: (on: boolean) => void }) {
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const beatEnabled = useStore(s => s.beatEnabled);
  const setBeatEnabled = useStore(s => s.setBeatEnabled);
  const bpm = useStore(s => s.bpm);
  const setBpm = useStore(s => s.setBpm);
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  const tap = () => {
    const now = performance.now();
    const fresh = [...taps, now].filter(t => now - t < 2500);
    setTaps(fresh);
    if (fresh.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < fresh.length; i++) intervals.push(fresh[i] - fresh[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.max(20, Math.min(300, Math.round(60000 / avg))));
    }
  };

  const listening = micEnabled || systemAudioEnabled;

  return (
    <div ref={wrapRef} className="relative" data-audio-source-picker>
      <HotBtn
        delay={delay}
        label={micEnabled ? "Mic on" : systemAudioEnabled ? "Device audio on" : "Listen mode"}
        active={listening || beatEnabled}
        tint="var(--signal-good)"
        onClick={() => {
          if (micEnabled) { setMicEnabled(false); onMicFlash?.(false); return; }
          if (systemAudioEnabled) { setSystemAudioEnabled(false); onMicFlash?.(false); return; }
          setOpen(v => !v);
        }}
      >
        {listening ? <Mic className="h-4 w-4" strokeWidth={1.5} /> : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
      </HotBtn>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen(o => !o)}
        aria-label="Audio options — source and beat sync"
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        data-no-longpress
        className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/70 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--accent))]"
        title="Audio options — source & beat sync"
      >
        <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          data-audio-source-picker
          className="panel-in-3d absolute right-full top-0 z-50 mr-2 w-60 rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md"
          role="menu"
          aria-label="Audio options"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">source</div>
          <button
            type="button"
            onClick={() => { setSystemAudioEnabled(false); setMicEnabled(true); onMicFlash?.(true); }}
            data-active={micEnabled || undefined}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 hover:bg-white/10 data-[active]:text-[hsl(var(--accent))]"
          >
            <Mic className="h-3 w-3" strokeWidth={1.5} /> Microphone
          </button>
          <button
            type="button"
            onClick={() => { setMicEnabled(false); toggleSystemAudio(); onMicFlash?.(true); }}
            data-active={systemAudioEnabled || undefined}
            className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 hover:bg-white/10 data-[active]:text-[hsl(var(--accent))]"
          >
            <MonitorSpeaker className="h-3 w-3" strokeWidth={1.5} /> Device audio
          </button>

          <div className="my-2 h-px bg-white/10" />

          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">beat sync</span>
            <button
              type="button"
              onClick={() => setBeatEnabled(!beatEnabled)}
              data-on={beatEnabled}
              className="switch-square"
              aria-label="toggle beat sync"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={20} max={300} value={bpm}
              onChange={(e) => setBpm(+e.target.value)}
              aria-label="BPM"
              className="input-mono w-16 text-[12px]"
            />
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">bpm</span>
            <button
              type="button"
              onClick={tap}
              className="ml-auto flex items-center gap-1 rounded-sm border border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/70 hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
            >
              <Heart className="h-2.5 w-2.5" strokeWidth={1.5} /> tap
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Global reactivity multiplier — a single slider that scales mic/device
 * sensitivity AND audio-mapped modulator strength together, in every mode
 * (see GlCanvas.tsx). Defaults to 1×, a genuine no-op: nothing about the
 * current look changes until this is actually touched.
 */
function SensitivityTrigger({ delay }: { delay: number }) {
  const sensitivity = useStore(s => s.sensitivity);
  const setSensitivity = useStore(s => s.setSensitivity);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <HotBtn
        delay={delay}
        label={`Sensitivity · ${sensitivity.toFixed(2)}×`}
        active={sensitivity !== 1}
        tint="150 70% 62%"
        onClick={() => setOpen(v => !v)}
      >
        <Gauge className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
      {open && (
        <div
          className="panel-in-3d absolute right-full top-0 z-50 mr-2 w-52 rounded-md border border-white/10 bg-black/85 p-2.5 backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">
            <span>sensitivity</span>
            <span>{sensitivity.toFixed(2)}×</span>
          </div>
          <input
            type="range" min={0.2} max={2.5} step={0.05} value={sensitivity}
            onChange={(e) => setSensitivity(+e.target.value)}
            aria-label="Global sensitivity"
            className="slider-hair w-full"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <p className="max-w-[75%] font-mono text-[9px] leading-tight text-white/45">
              Scales how hard everything reacts — mic/device audio and any
              beat/audio-mapped effect, in every mode. 1× changes nothing.
            </p>
            {sensitivity !== 1 && (
              <button
                type="button"
                onClick={() => setSensitivity(1)}
                className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-white/50 hover:text-[hsl(var(--accent))]"
              >
                reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "Customize layout" — reorder any trigger with up/down, no drag-and-drop
 *  (nothing else in this codebase has a drag library; this matches the one
 *  existing reorder precedent, LayerStack's up/down move buttons). Always
 *  pinned last in the rail so it can't be reordered out of reach of itself. */
function CustomizeTrigger({
  delay, order, onMove, onReset, present,
}: {
  delay: number;
  order: string[];
  onMove: (id: string, dir: -1 | 1) => void;
  onReset: () => void;
  present: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <HotBtn delay={delay} label="Customize layout" active={open} tint="220 8% 70%" onClick={() => setOpen(v => !v)}>
        <Pencil className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
      {open && (
        <div
          className="panel-in-3d absolute right-full bottom-0 z-50 mr-2 w-60 max-h-[70vh] overflow-y-auto rounded-md border border-white/10 bg-black/90 p-2 backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1.5 flex items-center justify-between px-0.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">customize layout</span>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/50 hover:text-[hsl(var(--accent))]"
              title="Reset to default order"
            >
              <RotateCcw className="h-2.5 w-2.5" strokeWidth={1.5} /> reset
            </button>
          </div>
          <ul className="flex flex-col gap-0.5">
            {order.map((id, i) => (
              <li
                key={id}
                className={`flex items-center gap-1.5 rounded px-1.5 py-1 ${present.has(id) ? "" : "opacity-40"}`}
              >
                <GripVertical className="h-3 w-3 shrink-0 text-white/25" strokeWidth={1.5} />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-white/80">
                  {TRIGGER_LABELS[id] ?? id}
                </span>
                <button
                  type="button"
                  onClick={() => onMove(id, -1)}
                  disabled={i === 0}
                  aria-label="move up"
                  className="text-white/40 hover:text-[hsl(var(--accent))] disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(id, 1)}
                  disabled={i === order.length - 1}
                  aria-label="move down"
                  className="text-white/40 hover:text-[hsl(var(--accent))] disabled:opacity-20"
                >
                  ↓
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MobileRadialWheel({
  ids, registry, visualizerRef, isRecording, onSelect,
}: {
  ids: string[];
  registry: Record<string, ReactNode>;
  visualizerRef?: RefObject<HTMLElement>;
  isRecording: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rotation, setRotation] = useState(() => {
    try { return Number(localStorage.getItem(MOBILE_WHEEL_ROTATION_KEY)) || 0; } catch { return 0; }
  });
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef({ pointerId: -1, x: 0, y: 0, fired: false });
  const highlightRef = useRef<string | null>(null);
  const rotationRef = useRef(rotation);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  rotationRef.current = rotation;
  const outerCount = Math.min(14, ids.length);
  const innerCount = Math.max(0, ids.length - outerCount);

  const select = (id: string | null) => {
    highlightRef.current = id;
    setHighlighted(id);
  };

  const activate = useCallback((id: string) => {
    onSelect(id);
    const slot = wheelRef.current?.querySelector<HTMLElement>(`[data-radial-id="${CSS.escape(id)}"]`);
    slot?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.click();
  }, [onSelect]);

  useEffect(() => {
    const target = visualizerRef?.current;
    if (!target) return;
    let timer: number | null = null;
    const cancelTimer = () => { if (timer != null) window.clearTimeout(timer); timer = null; };
    const ignored = (eventTarget: EventTarget | null) =>
      eventTarget instanceof HTMLElement && !!eventTarget.closest("button, a, input, textarea, select, [role='slider'], [data-no-longpress], .mobile-radial-wheel");
    const onDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || ignored(event.target) || gestureRef.current.pointerId !== -1) return;
      gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, fired: false };
      timer = window.setTimeout(() => {
        gestureRef.current.fired = true;
        setOpen(true);
        try { navigator.vibrate?.(12); } catch {}
      }, MOBILE_WHEEL_HOLD_MS);
    };
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      const distance = Math.hypot(dx, dy);
      if (!gesture.fired && distance > 18) { cancelTimer(); return; }
      if (!gesture.fired || distance < MOBILE_WHEEL_FLICK_PX) { select(null); return; }
      // Zero degrees is twelve o'clock, matching the wheel's visual layout.
      const angle = normalizeRadialDegrees(Math.atan2(dy, dx) * 180 / Math.PI + 90);
      const index = radialTriggerIndex(angle, distance, idsRef.current.length, rotationRef.current);
      select(idsRef.current[index] ?? null);
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current.pointerId) return;
      cancelTimer();
      if (gestureRef.current.fired && highlightRef.current) activate(highlightRef.current);
      gestureRef.current = { pointerId: -1, x: 0, y: 0, fired: false };
      select(null);
    };
    target.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    return () => {
      cancelTimer();
      target.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [visualizerRef, activate]);

  const rotateRef = useRef<{ id: number; angle: number; rotation: number } | null>(null);
  const pointerAngle = (x: number, y: number) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.atan2(y - (rect.top + rect.height / 2), x - (rect.left + rect.width / 2)) * 180 / Math.PI;
  };
  return (
    <div className="mobile-radial-layer pointer-events-none absolute inset-0 z-[70]">
      <button type="button" className="pointer-events-auto absolute left-1/2 top-1/2 h-px w-px opacity-0" onClick={() => setOpen(true)} aria-label="Open radial controls" />
      {open && (
        <>
          <button className="pointer-events-auto absolute inset-0 bg-black/20 backdrop-blur-[1px]" aria-label="Close radial controls" onClick={() => setOpen(false)} />
          <div
            ref={wheelRef}
            className="mobile-radial-wheel pointer-events-auto absolute left-1/2 top-1/2"
            role="menu"
            aria-label="Visualizer controls"
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              rotateRef.current = { id: event.pointerId, angle: pointerAngle(event.clientX, event.clientY), rotation };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = rotateRef.current;
              if (!drag || drag.id !== event.pointerId) return;
              const next = drag.rotation + pointerAngle(event.clientX, event.clientY) - drag.angle;
              rotationRef.current = next;
              setRotation(next);
            }}
            onPointerUp={(event) => {
              if (rotateRef.current?.id !== event.pointerId) return;
              rotateRef.current = null;
              try { localStorage.setItem(MOBILE_WHEEL_ROTATION_KEY, String(rotationRef.current)); } catch {}
            }}
          >
            <div className="mobile-radial-wheel__rings" aria-hidden />
            {ids.map((id, index) => {
              const inner = index >= outerCount;
              const ringIndex = inner ? index - outerCount : index;
              const count = inner ? innerCount : outerCount;
              const angle = (ringIndex * 360 / Math.max(1, count)) + rotation;
              const radius = inner ? 29 : 43;
              return (
                <div
                  key={id}
                  role="menuitem"
                  data-radial-id={id}
                  data-highlighted={highlighted === id || undefined}
                  className="mobile-radial-wheel__slot"
                  style={{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--radial-size) * -${radius / 100})) rotate(${-angle}deg)` }}
                  onClick={() => onSelect(id)}
                >
                  {registry[id]}
                </div>
              );
            })}
            <button
              type="button"
              className="mobile-radial-wheel__hub"
              onClick={() => setOpen(false)}
              aria-label="Close radial controls"
            >
              <span>{highlighted ? (TRIGGER_LABELS[highlighted] ?? highlighted) : "MOSH"}</span>
              <small>{isRecording ? "REC" : "steer · tap · flick"}</small>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DesktopRadialWheel({
  ids, registry, visualizerRef, isRecording, onSelect,
}: {
  ids: string[];
  registry: Record<string, ReactNode>;
  visualizerRef?: RefObject<HTMLElement>;
  isRecording: boolean;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [center, setCenter] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [layout, setLayout] = useState<RadialLayout>(() => {
    try { return JSON.parse(localStorage.getItem(DESKTOP_WHEEL_LAYOUT_KEY) || "{}"); } catch { return {}; }
  });
  const wheelRef = useRef<HTMLDivElement>(null);
  const idsRef = useRef(ids);
  const layoutRef = useRef(layout);
  const highlightedRef = useRef<string | null>(null);
  const gestureRef = useRef({ pointerId: -1, x: 0, y: 0, fired: false });
  const editDragRef = useRef<{ pointerId: number; id: string } | null>(null);
  idsRef.current = ids;
  layoutRef.current = layout;

  const select = (id: string | null) => {
    highlightedRef.current = id;
    setHighlighted(id);
  };
  const activate = useCallback((id: string) => {
    onSelect(id);
    const slot = wheelRef.current?.querySelector<HTMLElement>(`[data-radial-id="${CSS.escape(id)}"]`);
    slot?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.click();
  }, [onSelect]);
  const saveLayout = (next: RadialLayout) => {
    layoutRef.current = next;
    setLayout(next);
    try { localStorage.setItem(DESKTOP_WHEEL_LAYOUT_KEY, JSON.stringify(next)); } catch {}
  };
  const pointFromPointer = (clientX: number, clientY: number) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - rect.width / 2) / rect.width,
      y: (clientY - rect.top - rect.height / 2) / rect.height,
    };
  };

  useEffect(() => {
    const target = visualizerRef?.current;
    if (!target) return;
    let timer: number | null = null;
    const cancelTimer = () => { if (timer != null) window.clearTimeout(timer); timer = null; };
    const ignored = (eventTarget: EventTarget | null) =>
      eventTarget instanceof HTMLElement && !!eventTarget.closest("button, a, input, textarea, select, [role='slider'], [data-no-longpress], .desktop-radial-wheel");
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0 || ignored(event.target) || gestureRef.current.pointerId !== -1) return;
      gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, fired: false };
      timer = window.setTimeout(() => {
        const size = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.78, 560);
        const radius = size / 2 + 12;
        const nextCenter = {
          x: Math.max(radius, Math.min(window.innerWidth - radius, event.clientX)),
          y: Math.max(radius, Math.min(window.innerHeight - radius, event.clientY)),
        };
        gestureRef.current = { ...gestureRef.current, x: nextCenter.x, y: nextCenter.y, fired: true };
        setCenter(nextCenter);
        setEditing(false);
        setOpen(true);
      }, DESKTOP_WHEEL_HOLD_MS);
    };
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (event.pointerId !== gesture.pointerId) return;
      const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
      if (!gesture.fired && distance > 12) { cancelTimer(); return; }
      if (!gesture.fired) return;
      const size = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.78, 560);
      const point = { x: (event.clientX - gesture.x) / size, y: (event.clientY - gesture.y) / size };
      select(distance < 38 ? null : nearestRadialId(point, idsRef.current, layoutRef.current, 0.2));
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current.pointerId) return;
      cancelTimer();
      if (gestureRef.current.fired && highlightedRef.current) {
        activate(highlightedRef.current);
        setOpen(false);
      }
      gestureRef.current = { pointerId: -1, x: 0, y: 0, fired: false };
      select(null);
    };
    target.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    return () => {
      cancelTimer();
      target.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [visualizerRef, activate]);

  return (
    <div className="desktop-radial-layer pointer-events-none fixed inset-0 z-[70]">
      {open && <>
        <button type="button" className="pointer-events-auto absolute inset-0 bg-black/20 backdrop-blur-[1px]" aria-label="Close radial controls" onClick={() => { setOpen(false); setEditing(false); }} />
        <div
          ref={wheelRef}
          className="desktop-radial-wheel mobile-radial-wheel pointer-events-auto absolute"
          style={{ left: center.x, top: center.y }}
          role="menu"
          aria-label="Desktop visualizer controls"
        >
          <div className="mobile-radial-wheel__rings" aria-hidden />
          {ids.map((id, index) => {
            const point = layout[id] ?? defaultRadialPoint(index, ids.length);
            return (
              <div
                key={id}
                role="menuitem"
                data-radial-id={id}
                data-highlighted={highlighted === id || undefined}
                data-editing={editing || undefined}
                className="mobile-radial-wheel__slot"
                style={{ transform: `translate(-50%, -50%) translate(calc(var(--radial-size) * ${point.x}), calc(var(--radial-size) * ${point.y}))` }}
                onClickCapture={(event) => { if (editing) { event.preventDefault(); event.stopPropagation(); } }}
                onClick={() => onSelect(id)}
                onPointerDownCapture={(event) => {
                  if (!editing) return;
                  event.preventDefault();
                  event.stopPropagation();
                  editDragRef.current = { pointerId: event.pointerId, id };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = editDragRef.current;
                  if (!editing || drag?.pointerId !== event.pointerId || drag.id !== id) return;
                  saveLayout({ ...layoutRef.current, [id]: clampRadialPoint(pointFromPointer(event.clientX, event.clientY)) });
                }}
                onPointerUp={(event) => {
                  if (editDragRef.current?.pointerId !== event.pointerId) return;
                  editDragRef.current = null;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                }}
              >
                {registry[id]}
              </div>
            );
          })}
          <div className="mobile-radial-wheel__hub">
            <button type="button" onClick={() => setEditing(value => !value)} aria-pressed={editing}>
              <span>{editing ? "DONE" : (highlighted ? (TRIGGER_LABELS[highlighted] ?? highlighted) : "MOSH")}</span>
              <small>{editing ? "drag every icon" : (isRecording ? "REC" : "hold · steer · release")}</small>
            </button>
            {editing && <button type="button" className="radial-layout-reset" onClick={() => saveLayout({})}>reset</button>}
          </div>
        </div>
      </>}
    </div>
  );
}

/**
 * Floating cluster of "moshing" cute icons over the visualizer.
 * The DOM overlay is outside <canvas>, so canvas.captureStream() never records these.
 */
export function HotTriggers({
  visualizerRef, hidden = false,
  isRecording, onToggleRecord, onScreenshot, onFreeze, onGif, onShare, onSupport, onAccount, gifBusy, gifProgress,
  onMicFlash, journeyOn, onToggleJourney, journeyLocked, journeyPreview, isFullscreen, onToggleFullscreen, onHome,
  onClearFx, hasFx, onSaveFavorite, showMicNudge, onMicNudgeYes, onMicNudgeNo, onMicNudgeExpire, showTrackNudge, onTrackNudgeDismiss,
}: Props) {
  const mosh = useStore(s => s.mosh);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);
  const sourceMode = useStore(s => s.sourceMode);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const favPanelRef = useRef<HTMLDivElement>(null);
  const favorites = useStore(s => s.favorites);
  const saveFavorite = useStore(s => s.saveFavorite);
  const applyFavorite = useStore(s => s.applyFavorite);
  const removeFavorite = useStore(s => s.removeFavorite);
  const renameFavorite = useStore(s => s.renameFavorite);
  const heldRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const proHeldRef = useRef(false);
  const proHoldTimerRef = useRef<number | null>(null);
  const captureHeldRef = useRef(false);
  const captureHoldTimerRef = useRef<number | null>(null);
  const favHeldRef = useRef(false);
  const favHoldTimerRef = useRef<number | null>(null);
  const uploadHeldRef = useRef(false);
  const uploadHoldTimerRef = useRef<number | null>(null);

  const [order, setOrder] = useState<string[]>(() => loadOrder());
  // A dock needs a stable "current" item even after the pointer leaves. The
  // last trigger used remains emphasized until another trigger is chosen;
  // hover/focus temporarily rolls the magnification toward its neighbors.
  const [selectedTriggerId, setSelectedTriggerId] = useState<string>("mosh");
  const moveOrder = (id: string, dir: -1 | 1) => {
    setOrder(prev => {
      const idx = prev.indexOf(id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      saveOrder(next);
      return next;
    });
  };
  const resetOrder = () => { const d = [...DEFAULT_ORDER]; setOrder(d); saveOrder(d); };

  // Rail container ref — click delegation for the interact glitch, and the
  // scan target for the ambient random one.
  const railRef = useRef<HTMLDivElement>(null);
  const fireGlitch = (el: Element | null | undefined) => {
    if (!el) return;
    el.setAttribute("data-glitch", "1");
    window.setTimeout(() => el.removeAttribute("data-glitch"), 750);
  };
  const onRailClick = (e: React.MouseEvent) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>(".hot-trigger");
    fireGlitch(trigger);
    const id = trigger?.closest<HTMLElement>("[data-trigger-id]")?.dataset.triggerId;
    if (id) setSelectedTriggerId(id);
  };
  // Ambient glitch: a random idle trigger, ≥3×/min (12–18s spacing averages
  // ~4/min), completely independent of anything the user does.
  useEffect(() => {
    let cancelled = false;
    let t: number | null = null;
    const tick = () => {
      if (cancelled) return;
      const all = railRef.current?.querySelectorAll(".hot-trigger");
      if (all && all.length) fireGlitch(all[Math.floor(Math.random() * all.length)]);
      t = window.setTimeout(tick, 12_000 + Math.random() * 6_000);
    };
    t = window.setTimeout(tick, 12_000 + Math.random() * 6_000);
    return () => { cancelled = true; if (t) window.clearTimeout(t); };
  }, []);

  // Switch-camera — only shown on touch devices when a live camera stream is active
  const [isTouchScreen, setIsTouchScreen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(pointer: coarse), (max-width: 900px)");
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
  const proModeEnabled = useStore(s => s.proModeEnabled);
  const setProModeEnabled = useStore(s => s.setProModeEnabled);
  const helpModeEnabled = useStore(s => s.helpModeEnabled);
  const setHelpModeEnabled = useStore(s => s.setHelpModeEnabled);
  const [isoOpen, setIsoOpen] = useState(false);
  const [forgePanelOpen, setForgePanelOpen] = useState(false);

  useEffect(() => {
    if (!isoOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-iso-panel]")) return;
      setIsoOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [isoOpen]);

  useEffect(() => {
    if (!forgePanelOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-forge-panel]")) return;
      setForgePanelOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [forgePanelOpen]);


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
      const ladder = [null, ...AUTO_MOSH_TIMINGS] as const;
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

  // Any successful favorite save (keyboard, hold-gesture, or the panel's own
  // "+ save current mosh" button) opens the list with the new entry
  // highlighted and scrolled into view — new saves are appended, so it's
  // always the last item.
  useEffect(() => {
    const onSaved = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setFavOpen(true);
      setJustSavedId(id);
      window.setTimeout(() => {
        favPanelRef.current
          ?.querySelector<HTMLElement>(`[data-fav-id="${id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      }, 0);
      window.setTimeout(() => setJustSavedId(cur => (cur === id ? null : cur)), 4000);
    };
    window.addEventListener("mosh:favorite-saved", onSaved);
    return () => window.removeEventListener("mosh:favorite-saved", onSaved);
  }, []);


  const startHold = (e: React.PointerEvent) => {
    heldRef.current = false;
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    const { clientX, clientY } = e;
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      setPickerOpen(true);
      const uv = clientToViewportUv(clientX, clientY);
      cursorFx.chaos(uv.x, uv.y);
      try { (navigator as any).vibrate?.(10); } catch {}
    }, 420);
  };
  const endHold = () => {
    if (holdTimerRef.current) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
  };
  const toggleShuffle = () => {
    if (heldRef.current) return;
    setShuffleSec(shuffleSec == null ? DEFAULT_AUTO_MOSH_SEC : null);
  };

  const startFavHold = (e: React.PointerEvent) => {
    favHeldRef.current = false;
    if (favHoldTimerRef.current) window.clearTimeout(favHoldTimerRef.current);
    const { clientX, clientY } = e;
    favHoldTimerRef.current = window.setTimeout(() => {
      favHeldRef.current = true;
      // Long-press = quick save. The panel then opens itself (see the
      // mosh:favorite-saved listener above) with the new entry highlighted.
      (onSaveFavorite ?? saveFavorite)();
      const uv = clientToViewportUv(clientX, clientY);
      cursorFx.chaos(uv.x, uv.y);
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

  const startUploadHold = (e: React.PointerEvent<HTMLButtonElement>) => {
    uploadHeldRef.current = false;
    if (uploadHoldTimerRef.current) window.clearTimeout(uploadHoldTimerRef.current);
    const { clientX, clientY } = e;
    uploadHoldTimerRef.current = window.setTimeout(() => {
      uploadHeldRef.current = true;
      window.dispatchEvent(new Event("mosh:open-upload-settings"));
      const uv = clientToViewportUv(clientX, clientY);
      cursorFx.chaos(uv.x, uv.y);
      try { (navigator as any).vibrate?.(15); } catch {}
    }, 450);
  };
  const endUploadHold = () => {
    if (uploadHoldTimerRef.current) {
      window.clearTimeout(uploadHoldTimerRef.current);
      uploadHoldTimerRef.current = null;
    }
  };
  const onUploadTap = () => {
    if (uploadHeldRef.current) return;
    window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "upload" }));
  };

  // ---- Build every trigger once, keyed by id, then render in `order`. ----
  const registry: Record<string, ReactNode> = {
    home: onHome && (
      <HotBtn key="home" delay={0} label="Back to start" onClick={onHome} tint="220 12% 80%">
        <Home className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "source-upload": (
      <HotBtn key="source-upload" delay={0} label="Upload source — hold for photo deck" active={sourceMode === "upload"} onClick={onUploadTap} onPointerDown={startUploadHold} onPointerUp={endUploadHold} onPointerCancel={endUploadHold} tint="326 90% 65%">
        <Upload className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "source-camera": (
      <HotBtn key="source-camera" delay={0} label="Live camera" active={sourceMode === "camera"} onClick={() => window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "camera" }))} tint="190 90% 62%">
        <Camera className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "source-forge": (
      <HotBtn key="source-forge" delay={0} label="Forge source" active={sourceMode === "forge"} onClick={() => window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "forge" }))} tint="24 94% 62%">
        <Flame className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    account: onAccount && (
      <HotBtn key="account" delay={0} label="Account" onClick={onAccount} tint="266 70% 75%">
        <UserCircle className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    undo: (
      <HotBtn key="undo" delay={0} label="Undo" onClick={undo} disabled={!canUndo} tint="210 10% 75%">
        <Undo2 className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    redo: (
      <HotBtn key="redo" delay={0} label="Redo" onClick={redo} disabled={!canRedo} tint="210 10% 75%">
        <Redo2 className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    mosh: (
      <span key="mosh" data-mosh-input className="contents">
        <HotBtn delay={0} label="Mosh" onClick={() => crossfadeLayers(mosh, MOSH_FADE_MS)} tint="12 90% 58%">
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
      </span>
    ),
    "auto-mosh": (
      <div key="auto-mosh" className="relative" data-shuffle-picker>
        <button
          type="button"
          aria-label={shuffleSec ? `Auto-Mosh ${shuffleSec}s (hold for timing)` : "Auto-Mosh (hold for timing)"}
          aria-pressed={shuffleSec != null}
          title={shuffleSec ? `Auto-Mosh every ${shuffleSec}s — hold for timing` : "Auto-Mosh — hold for timing"}
          data-active={shuffleSec != null || undefined}
          data-tint=""
          data-no-longpress
          className="hot-trigger"
          style={{ ["--ht-tint" as string]: "36 90% 60%" }}
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
            {AUTO_MOSH_TIMINGS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setShuffleSec(s); setPickerOpen(false); }}
                data-active={shuffleSec === s || undefined}
                className="w-full rounded px-2 py-1 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-white/70 hover:bg-white/10 hover:text-white data-[active]:text-[hsl(var(--accent))]"
              >
                {s < 60 ? `${s}s` : `${s / 60}m`}
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    "clear-fx": onClearFx && (
      <button
        key="clear-fx"
        type="button"
        onClick={onClearFx}
        disabled={!hasFx}
        aria-label="Clear all effects and show the remastered source"
        title="Clear all FX — show the remastered source only"
        data-tint=""
        data-no-longpress
        className="hot-trigger"
        style={{ ["--ht-tint" as string]: "0 0% 66%" }}
      >
        <span className="hot-trigger__glitch" aria-hidden><Eraser className="h-4 w-4" strokeWidth={1.5} /></span>
        <span className="hot-trigger__ico"><Eraser className="h-4 w-4" strokeWidth={1.5} /></span>
      </button>
    ),
    // Journey — Smart and Storm combined into one director. They were two
    // buttons doing halves of the same job: Smart chose what suited the
    // moment but never touched it again until the next switch; Storm never
    // chose well but never let the frame sit still. Journey runs Smart's
    // judgement on a slow unpredictable clock and Storm's interference on a
    // fast bounded one.
    journey: onToggleJourney && (
      <button
        key="journey"
        type="button"
        onClick={onToggleJourney}
        aria-label={journeyLocked ? "Journey (supporter unlock)" : (journeyPreview ? "Forge Journey free preview" : (journeyOn ? "Journey mode on" : "Journey mode off"))}
        aria-pressed={journeyOn || undefined}
        title={journeyLocked
          ? "Journey · supporter unlock (I)"
          : journeyPreview
            ? (journeyOn ? "Forge Journey on · five-minute preview (I)" : "Forge Journey · five-minute free preview (I)")
          : (journeyOn ? "Journey on · directing itself from motion & sound (I)" : "Journey · sit back, it directs itself (I)")}
        data-active={journeyOn || undefined}
        data-tint=""
        data-no-longpress
        className="hot-trigger relative"
        style={{ ["--ht-tint" as string]: "248 70% 74%" }}
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
    ),
    audio: (
      <div key="audio" className="relative">
        {/* Mic-nudge anchors here so it points straight at this button. */}
        {showMicNudge && (
          <MicNudgeToast
            onYes={() => onMicNudgeYes?.()}
            onNo={() => onMicNudgeNo?.()}
            onExpire={() => onMicNudgeExpire?.()}
          />
        )}
        <AudioTrigger delay={0} onMicFlash={onMicFlash} />
      </div>
    ),
    sensitivity: <SensitivityTrigger key="sensitivity" delay={0} />,
    freeze: (
      <HotBtn key="freeze" delay={0} label="Freeze" onClick={onFreeze} tint="200 80% 76%">
        <Snowflake className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    capture: (
      <HotBtn
        key="capture"
        delay={0}
        label={isRecording ? "Stop recording" : "Capture — tap for a still, hold to record"}
        active={isRecording}
        onClick={() => {
          // While recording, tap stops it regardless of hold state — the
          // fast, discoverable way out always works. Otherwise, a hold
          // already started the recording (see onPointerDown) and this
          // plain click is the tap path: an instant smart-still capture.
          if (isRecording) { onToggleRecord(); return; }
          if (captureHeldRef.current) return;
          onScreenshot();
        }}
        onPointerDown={(e) => {
          if (isRecording) return;
          captureHeldRef.current = false;
          if (captureHoldTimerRef.current) window.clearTimeout(captureHoldTimerRef.current);
          const { clientX, clientY } = e;
          captureHoldTimerRef.current = window.setTimeout(() => {
            captureHeldRef.current = true;
            onToggleRecord();
            const uv = clientToViewportUv(clientX, clientY);
            cursorFx.chaos(uv.x, uv.y);
            try { (navigator as any).vibrate?.(12); } catch {}
          }, 420);
        }}
        onPointerUp={() => { if (captureHoldTimerRef.current) { window.clearTimeout(captureHoldTimerRef.current); captureHoldTimerRef.current = null; } }}
        onPointerCancel={() => { if (captureHoldTimerRef.current) { window.clearTimeout(captureHoldTimerRef.current); captureHoldTimerRef.current = null; } }}
        tint={isRecording ? "var(--signal-live)" : "40 20% 84%"}
      >
        {isRecording
          ? <Square className="h-3.5 w-3.5 fill-current" strokeWidth={1.5} />
          : <Camera className="h-4 w-4" strokeWidth={1.5} />}
      </HotBtn>
    ),
    gif: <GifButton key="gif" onGif={onGif} gifBusy={gifBusy} gifProgress={gifProgress} />,
    share: onShare && (
      <HotBtn key="share" delay={0} label="Share" onClick={onShare} tint="228 85% 72%">
        <Share2 className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "mosh-sticker": <MoshStickerTrigger key="mosh-sticker" delay={0} />,
    "sticker-mode": (
      <HotBtn
        key="sticker-mode"
        delay={0}
        label="Sticker capture mode"
        active={stickerMode}
        onClick={() => setStickerMode(!stickerMode)}
        tint="96 55% 62%"
      >
        <Scissors className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "pro-mode": (
      <HotBtn
        key="pro-mode"
        delay={0}
        label={helpModeEnabled ? "Pro Mode (hold: Help Mode is ON)" : "Pro Mode — hide all UI (hold for Help Mode)"}
        active={proModeEnabled || helpModeEnabled}
        onClick={() => { if (proHeldRef.current) return; setProModeEnabled(!proModeEnabled); }}
        onPointerDown={(e) => {
          proHeldRef.current = false;
          if (proHoldTimerRef.current) window.clearTimeout(proHoldTimerRef.current);
          const { clientX, clientY } = e;
          proHoldTimerRef.current = window.setTimeout(() => {
            proHeldRef.current = true;
            setHelpModeEnabled(!helpModeEnabled);
            const uv = clientToViewportUv(clientX, clientY);
            cursorFx.chaos(uv.x, uv.y);
            try { (navigator as any).vibrate?.(10); } catch {}
          }, 420);
        }}
        onPointerUp={() => { if (proHoldTimerRef.current) { window.clearTimeout(proHoldTimerRef.current); proHoldTimerRef.current = null; } }}
        onPointerCancel={() => { if (proHoldTimerRef.current) { window.clearTimeout(proHoldTimerRef.current); proHoldTimerRef.current = null; } }}
        tint={helpModeEnabled ? "200 90% 65%" : "0 0% 70%"}
      >
        {helpModeEnabled ? <HelpCircle className="h-4 w-4" strokeWidth={1.5} /> : <EyeOff className="h-4 w-4" strokeWidth={1.5} />}
      </HotBtn>
    ),
    isolation: (
      <div key="isolation" className="relative" data-iso-panel>
        <HotBtn delay={0} label="Isolation mode" active={isolationMode !== 'off'} onClick={() => setIsoOpen(v => !v)} tint="174 65% 55%">
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
    ),
    // StickerCapture owns the actual capture logic, but renders its compact
    // control into this rail slot when the mode is on (rather than floating a
    // second, oversized button over export feedback near the bottom-right).
    "sticker-capture": stickerMode && <div key="sticker-capture" id="mosh-sticker-capture-slot" />,
    "theme-track": <TrackTrigger key="theme-track" delay={0} showNudge={showTrackNudge} onNudgeDismiss={onTrackNudgeDismiss} />,
    "forge-palette": sourceMode === "forge" && (
      <div key="forge-palette" className="relative" data-forge-panel>
        <HotBtn
          delay={0}
          label={forgePanelOpen ? "Close Forge palette and settings" : "Open Forge palette and settings"}
          active={forgePanelOpen}
          onClick={() => setForgePanelOpen(open => !open)}
          tint="318 82% 68%"
        >
          <Palette className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
        {forgePanelOpen && createPortal(
          <div className="fixed left-3 top-14 z-50 safe-top safe-left" data-forge-panel>
            <ForgePanel embedded />
          </div>,
          document.body,
        )}
      </div>
    ),
    favorites: (
      <div key="favorites" className="relative" data-fav-panel>
        <button
          type="button"
          aria-label={favOpen ? "Close favorites" : "Open favorites (hold to quick-save)"}
          title="Favorites — tap to open, hold to save current mosh"
          data-active={favOpen || undefined}
          data-tint=""
          data-no-longpress
          className="hot-trigger"
          style={{ ["--ht-tint" as string]: "var(--signal-warn)" }}
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
            ref={favPanelRef}
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
                  const justSaved = justSavedId === f.id;
                  return (
                    <li
                      key={f.id}
                      data-fav-id={f.id}
                      className={`group flex items-center gap-1 rounded px-1 py-1 hover:bg-white/5 transition-colors ${
                        justSaved ? "bg-[hsl(var(--accent))]/15 ring-1 ring-[hsl(var(--accent))]/50" : ""
                      }`}
                    >
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
    ),
    fullscreen: onToggleFullscreen && (
      <HotBtn
        key="fullscreen"
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
    ),
    "switch-camera": isTouchScreen && videoStream && (
      <HotBtn key="switch-camera" delay={0} label="Switch camera" onClick={flipCamera} active={flipBusy} tint="212 80% 70%">
        <SwitchCamera className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    support: onSupport && (
      <HotBtn key="support" delay={0} label="Support MOSH" onClick={onSupport} tint="280 70% 72%">
        <Gem className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
  };

  const availableIds = order.filter(id => !!registry[id]);
  const present = new Set(availableIds);
  const [scrollStart, setScrollStart] = useState(0);
  const wheelCarryRef = useRef(0);
  const dragIdRef = useRef<string | null>(null);
  const visibleCount = Math.min(12, availableIds.length);
  const normalizedStart = availableIds.length ? ((scrollStart % availableIds.length) + availableIds.length) % availableIds.length : 0;
  const visibleIds = Array.from({ length: visibleCount }, (_, index) => availableIds[(normalizedStart + index) % availableIds.length]);

  useEffect(() => {
    if (scrollStart < availableIds.length) return;
    setScrollStart(0);
  }, [availableIds.length, scrollStart]);

  const reorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setOrder(prev => {
      const from = prev.indexOf(draggedId);
      const to = prev.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      saveOrder(next);
      return next;
    });
  };

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelCarryRef.current += Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(wheelCarryRef.current) < 24) return;
      const direction = wheelCarryRef.current > 0 ? 1 : -1;
      wheelCarryRef.current = 0;
      setScrollStart(start => start + direction);
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, []);

  if (isTouchScreen) {
    return (
      <MobileRadialWheel
        ids={availableIds}
        registry={registry}
        visualizerRef={visualizerRef}
        isRecording={isRecording}
        onSelect={setSelectedTriggerId}
      />
    );
  }

  return (
    <>
    <DesktopRadialWheel
      ids={availableIds}
      registry={registry}
      visualizerRef={visualizerRef}
      isRecording={isRecording}
      onSelect={setSelectedTriggerId}
    />
    {!hidden && (
    /* Vertically centered so the dock occupies the right edge evenly across
       desktop, tablet and phone aspect ratios. */
    <div
      className="ui-chrome hot-triggers pointer-events-none absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-1 safe-right"
    >
      <div
        ref={railRef}
        className="hot-trigger-rail pointer-events-auto"
        onClick={onRailClick}
        aria-label="Hot triggers. Scroll to cycle; drag handles to reorder."
      >
        {visibleIds.map(id => (
          <div
            key={id}
            className="hot-trigger-slot"
            data-trigger-id={id}
            data-selected={selectedTriggerId === id || undefined}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIdRef.current) reorder(dragIdRef.current, id);
            }}
          >
            <button
              type="button"
              draggable
              className="hot-trigger-drag"
              aria-label={`Reorder ${TRIGGER_LABELS[id] ?? id}`}
              title="Drag to reorder"
              onDragStart={(e) => {
                dragIdRef.current = id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => { dragIdRef.current = null; }}
              onPointerDown={(e) => {
                dragIdRef.current = id;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragIdRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-trigger-id]");
                const targetId = target?.dataset.triggerId;
                if (targetId) reorder(dragIdRef.current, targetId);
              }}
              onPointerUp={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
                dragIdRef.current = null;
              }}
              onPointerCancel={() => { dragIdRef.current = null; }}
            >
              <GripVertical aria-hidden />
            </button>
            {registry[id]}
          </div>
        ))}
        <div className="hot-trigger-slot hot-trigger-slot--customize">
          <CustomizeTrigger delay={0} order={order} onMove={moveOrder} onReset={resetOrder} present={present} />
        </div>
      </div>

      {isRecording && (
        <div className="pointer-events-none flex items-center gap-1 rounded-sm bg-black/55 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-red-400 backdrop-blur-sm">
          <Circle className="h-1.5 w-1.5 fill-current animate-pulse" />
          REC
        </div>
      )}
    </div>
    )}
    </>
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
        style={{ ["--ht-tint" as string]: "300 70% 70%" }}
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
