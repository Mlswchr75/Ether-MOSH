import { Mic, MicOff, Circle, Square, Sparkles, Scissors, Snowflake, Camera, Shuffle, Star, Play, Pencil, Trash2, X, Film, Lock, Share2, Compass, Maximize2, Minimize2, Gem, Home, SwitchCamera, Crosshair, Eraser, Link2, Upload, Music, Music2, Shuffle as ShuffleIcon, Undo2, Redo2, Gauge, ChevronDown, MonitorSpeaker, Heart, GripVertical, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "@/store/useStore";
import { trackPlayer, DEFAULT_TRACK_TITLE } from "@/engine/trackPlayer";
import { requestCameraStream, type CameraFacing } from "@/hooks/useCamera";
import { IsolationPanel } from "./IsolationPanel";
import { MoshStickerTrigger } from "./MoshStickerTrigger";
import { shareUrl } from "@/lib/share";
import { toggleSystemAudio } from "@/engine/systemAudio";
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
  /** First real content this session and nothing's listening yet — nudge
   *  toward turning the mic on, anchored to the audio trigger. */
  showMicNudge?: boolean;
  onMicNudgeYes?: () => void;
  onMicNudgeNo?: () => void;
  onMicNudgeExpire?: () => void;
};

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
  "home", "undo", "redo",
  "mosh", "auto-mosh", "clear-fx", "journey",
  "audio", "sensitivity",
  "freeze", "record", "screenshot", "gif", "share",
  "mosh-sticker", "sticker-mode", "isolation", "theme-track",
  "favorites", "fullscreen", "switch-camera", "support",
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  home: "Back to start", undo: "Undo", redo: "Redo",
  mosh: "Mosh", "auto-mosh": "Auto-Mosh", "clear-fx": "Clear FX", journey: "Journey",
  audio: "Audio (mic / device / beat sync)", sensitivity: "Sensitivity",
  freeze: "Freeze", record: "Record", screenshot: "Screenshot", gif: "GIF loop", share: "Share",
  "mosh-sticker": "Mosh sticker", "sticker-mode": "Sticker capture", isolation: "AI isolation",
  "theme-track": "Theme track", favorites: "Favorites", fullscreen: "Fullscreen",
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

/**
 * Floating cluster of "moshing" cute icons over the visualizer.
 * The DOM overlay is outside <canvas>, so canvas.captureStream() never records these.
 */
export function HotTriggers({
  isRecording, onToggleRecord, onScreenshot, onFreeze, onGif, onShare, onSupport, gifBusy, gifProgress,
  onMicFlash, journeyOn, onToggleJourney, journeyLocked, isFullscreen, onToggleFullscreen, onHome,
  onClearFx, hasFx, onSaveFavorite, showMicNudge, onMicNudgeYes, onMicNudgeNo, onMicNudgeExpire,
}: Props) {
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
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const favPanelRef = useRef<HTMLDivElement>(null);
  const favorites = useStore(s => s.favorites);
  const saveFavorite = useStore(s => s.saveFavorite);
  const applyFavorite = useStore(s => s.applyFavorite);
  const removeFavorite = useStore(s => s.removeFavorite);
  const renameFavorite = useStore(s => s.renameFavorite);
  const heldRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const favHeldRef = useRef(false);
  const favHoldTimerRef = useRef<number | null>(null);

  const [order, setOrder] = useState<string[]>(() => loadOrder());
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
    fireGlitch((e.target as HTMLElement).closest(".hot-trigger"));
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
    setShuffleSec(shuffleSec == null ? DEFAULT_AUTO_MOSH_SEC : null);
  };

  const startFavHold = () => {
    favHeldRef.current = false;
    if (favHoldTimerRef.current) window.clearTimeout(favHoldTimerRef.current);
    favHoldTimerRef.current = window.setTimeout(() => {
      favHeldRef.current = true;
      // Long-press = quick save. The panel then opens itself (see the
      // mosh:favorite-saved listener above) with the new entry highlighted.
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

  // ---- Build every trigger once, keyed by id, then render in `order`. ----
  const registry: Record<string, ReactNode> = {
    home: onHome && (
      <HotBtn key="home" delay={0} label="Back to start" onClick={onHome} tint="220 12% 80%">
        <Home className="h-4 w-4" strokeWidth={1.5} />
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
      <HotBtn key="mosh" delay={0} label="Mosh" onClick={mosh} tint="12 90% 58%">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
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
        aria-label={journeyLocked ? "Journey (supporter unlock)" : (journeyOn ? "Journey mode on" : "Journey mode off")}
        aria-pressed={journeyOn || undefined}
        title={journeyLocked
          ? "Journey · supporter unlock (I)"
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
    record: (
      <HotBtn
        key="record"
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
    ),
    screenshot: (
      <HotBtn key="screenshot" delay={0} label="Screenshot" onClick={onScreenshot} tint="40 20% 84%">
        <Camera className="h-4 w-4" strokeWidth={1.5} />
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
    "theme-track": <TrackTrigger key="theme-track" delay={0} />,
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

  const present = useMemo(() => new Set(order.filter(id => !!registry[id])), [order, registry]);
  // No wrapper element around each node — the rail's CSS grid targets its
  // direct children, so every trigger renders exactly as it always did,
  // just in `order` instead of source order. Reordering does mean the
  // hand-tuned entrance-delay cascade no longer lines up with position;
  // every trigger above sets delay={0} for that reason (was ={0..440}).
  const orderedNodes = order.map(id => registry[id]).filter(Boolean);

  return (
    /* top-14 keeps the rail clear of the account chip pinned at top-3/right-3
       (z-40), which would otherwise sit on top of the first trigger. */
    <div
      className="ui-chrome hot-triggers pointer-events-none absolute right-3 top-14 z-30 flex flex-col items-end gap-1 safe-top safe-right"
    >
      {/* Auto-wrapping rail: fills a column, then starts a second one inward.
          No overflow clipping, so left-opening panels stay visible. */}
      <div ref={railRef} className="hot-trigger-rail pointer-events-auto" onClick={onRailClick}>
        {orderedNodes}
        <CustomizeTrigger delay={0} order={order} onMove={moveOrder} onReset={resetOrder} present={present} />
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
