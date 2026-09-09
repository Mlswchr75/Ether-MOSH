import { Mic, MicOff, Circle, Square, Sparkles, Scissors, Snowflake, Camera, Shuffle, Star, Play, Pencil, Trash2, X, Film, Lock, Share2, Compass, Maximize2, Minimize2, SwitchCamera, Eraser, Link2, Upload, Music, Music2, Shuffle as ShuffleIcon, Undo2, Redo2, ChevronDown, MonitorSpeaker, Heart, GripVertical, RotateCcw, SkipBack, SkipForward, Palette, RectangleVertical, RectangleHorizontal, Moon, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/useStore";
import { trackPlayer, DEFAULT_TRACK_TITLE, SHOWCASE_TRACKS } from "@/engine/trackPlayer";
import { runTrackAction } from "@/engine/trackActions";
import { requestCameraStream, type CameraFacing } from "@/hooks/useCamera";
import { ForgePanel } from "./ForgePanel";
import { MotifMaestroPanel } from "./MotifMaestroPanel";
import { shareUrl } from "@/lib/share";
import { toggleSystemAudio } from "@/engine/systemAudio";
import { AudioInputControls } from "./AudioInputControls";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";
import { cursorFx } from "@/engine/cursorFx";
import { toast } from "sonner";
import { clampRadialPoint, defaultRadialPoint, nearestRadialId, type RadialLayout } from "@/lib/radialLayout";
import { hitSlot, slotsForCounts, unrotatePoint, type WheelSlot } from "@/lib/wheelGeometry";
import { gestureLock } from "@/engine/canvasGestures";
import { enhanceHotTriggerRail } from "@/engine/hotTriggerMobile";
import { validateAudioUpload } from "@/lib/mediaFileSafety";
import { MoshVortexIcon, LiveFeedIcon, UploadBeamIcon, ForgeFlameIcon, MotifMandalaIcon, HomeBeaconIcon, AccountCrystalIcon } from "./HotTriggerIcons";
import { AccountSettingsOverlay } from "./AccountSettingsOverlay";

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
  /** Re-enables the retired right-edge strip without disabling the radial wheel. */
  showLegacyLaunchpad?: boolean;
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
  /** After a minute of silent play, invite the user to start a soundtrack. */
  showTrackNudge?: boolean;
  onTrackNudgeDismiss?: () => void;
};

export const RADIAL_WHEEL_ARM_MS = 220;
export const RADIAL_WHEEL_HOLD_MS = 400;
const MOBILE_WHEEL_FLICK_PX = 54;
const MOBILE_WHEEL_ROTATION_KEY = "cathedral_mobile_radial_rotation_v1";
const DESKTOP_WHEEL_LAYOUT_KEY = "cathedral_desktop_radial_layout_v1";

export function radialFlickThreshold(pointerType: string) {
  return pointerType === "mouse" ? 34 : pointerType === "pen" ? 38 : MOBILE_WHEEL_FLICK_PX;
}

export function radialGestureShouldActivate(maxTravel: number, pointerType: string) {
  return maxTravel >= radialFlickThreshold(pointerType);
}

export function radialHoldJitterTolerance(pointerType: string) {
  return pointerType === "touch" ? 20 : pointerType === "pen" ? 12 : 8;
}

/** Hold-to-open is intentionally confined to the middle: a circle whose
 * diameter is half the shorter viewport edge, always under 25% of its area. */
export function isCentralRadialHoldPoint(x: number, y: number, width: number, height: number) {
  const radius = Math.min(width, height) * 0.25;
  return Math.hypot(x - width / 2, y - height / 2) <= radius;
}

export function normalizeRadialDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function radialIndexForAngle(angle: number, count: number, rotation = 0) {
  if (count <= 0) return -1;
  const step = 360 / count;
  return Math.round(normalizeRadialDegrees(angle - rotation) / step) % count;
}

/**
 * The wheel's two ring radii, as fractions of its diameter.
 *
 * Slot placement and slot hit-testing both read from these, via
 * `lib/wheelGeometry`. They used to be computed separately: the ring was
 * *drawn* at fractional radii but *flick-selected* against a hard-coded
 * `distance < 112` pixel boundary, so the two agreed only when the wheel
 * happened to be about 600px across. On a phone — where the wheel is closer
 * to 330px — the ring you could see and the ring you could hit were
 * different rings.
 *
 * The radii also have to hold the two rings *apart*. Eight outer slots and
 * six inner ones do not share a step size, so the half-step stagger cannot
 * stop them lining up — at 90° and 270° they do. That is harmless only if the
 * radial gap exceeds a touch target, which at the previous 0.44/0.315 it did
 * not: 0.125 of the diameter is ~41px on a phone, and the buttons are 48px,
 * so the rings overlapped where they aligned. 0.425/0.255 puts ~56px between
 * them, and still clears the hub inside and the wheel's own edge outside.
 */
export const MOBILE_RING_RADII = [0.425, 0.255];

/** A flick is a ballistic gesture, so it gets a far looser catch radius than
 *  a finger the user is deliberately steering across the ring. */
const FLICK_TOLERANCE = 0.17;

/**
 * Pull a flick's endpoint onto the ring band before hit-testing it.
 *
 * A flick says "that direction", not "that exact spot" — the old angle-based
 * selection took the angle and used distance only to pick a ring, so a long
 * throw past the outer ring still fired. Nearest-slot matching alone does not:
 * flick 0.6 of the wheel's diameter from centre and every slot is further away
 * than the catch radius, so the gesture silently selects nothing. That is well
 * inside a thumb's reach on a phone, and "I flicked hard and nothing happened"
 * is the worst failure this control can have.
 *
 * So a flick shorter than the inner ring or longer than the outer one is
 * clamped to the nearest ring and then matched by angle, while a flick that
 * lands between the rings still picks whichever is genuinely closer.
 */
export function clampFlickToRings(nx: number, ny: number): { x: number; y: number } {
  const distance = Math.hypot(nx, ny);
  if (distance <= 1e-6) return { x: nx, y: ny };
  const inner = Math.min(...MOBILE_RING_RADII);
  const outer = Math.max(...MOBILE_RING_RADII);
  const clamped = Math.min(outer, Math.max(inner, distance));
  const scale = clamped / distance;
  return { x: nx * scale, y: ny * scale };
}

/**
 * Triggers per ring, and therefore per page.
 *
 * The wheel carries 26 ring items. Shown at once that is roughly three times
 * the breadth pie-menu research puts the accuracy ceiling at, and it showed:
 * neighbours sat ~57px apart on a phone, barely more than one touch target,
 * which is the whole reason a flick used to land on the wrong trigger.
 *
 * Eight on the outer ring and six on the inner keeps both inside the budget.
 * On a 328px wheel — a 390px phone at 84vw, the tightest real case — that
 * puts adjacent outer slots 106.7px apart and adjacent inner slots 83.6px
 * apart, and the closest pair of all, one outer against one inner, 55.8px
 * apart against a 48px target: no overlap, ~8px of air. Fourteen a page also
 * means 26 items need only two pages, so nothing is more than one chevron
 * away.
 */
const RING_CAPACITY = [8, 6];
export const RADIAL_PAGE_SIZE = RING_CAPACITY.reduce((a, b) => a + b, 0);

/** How many pages the current trigger set needs. */
export function radialPageCount(total: number): number {
  return Math.max(1, Math.ceil(total / RADIAL_PAGE_SIZE));
}

/** Wrap a page index into range, so paging past either end is continuous. */
export function wrapPage(page: number, total: number): number {
  const pages = radialPageCount(total);
  return ((page % pages) + pages) % pages;
}

/** The ids shown on `page`, in the user's own order. */
export function radialPageIds(ids: string[], page: number): string[] {
  const start = wrapPage(page, ids.length) * RADIAL_PAGE_SIZE;
  return ids.slice(start, start + RADIAL_PAGE_SIZE);
}

/** Slot geometry only changes when the page's trigger count does, and
 *  steering asks for it on every pointermove — so build it once per count. */
const slotCache = new Map<number, WheelSlot[]>();

export function radialSlotsFor(total: number): WheelSlot[] {
  // Clamped to one page. Handed more, this used to fill the outer ring to
  // capacity and dump the entire remainder on the inner one — twenty-six
  // triggers became eight outside and eighteen inside, which is worse than
  // the unpaginated layout it replaced. Callers pass a page; anything beyond
  // one has nowhere to go, and silently drawing it badly is the failure mode
  // pagination exists to remove.
  const capped = Math.max(0, Math.min(total, RADIAL_PAGE_SIZE));
  const cached = slotCache.get(capped);
  if (cached) return cached;
  // Fill the outer ring first — it has the circumference — then the inner.
  // A page that does not fill the outer ring draws one ring, not two.
  const counts = [Math.min(RING_CAPACITY[0], capped), Math.max(0, capped - RING_CAPACITY[0])]
    .filter(count => count > 0);
  const slots = slotsForCounts(counts, MOBILE_RING_RADII);
  slotCache.set(capped, slots);
  return slots;
}

/** Tightest centre-to-centre neighbour gap the layout produces, in px. Exposed
 *  so a test can hold the line on touch-target spacing. */
/**
 * The smallest centre-to-centre distance between ANY two slots on a page, in
 * px, for a wheel of the given diameter.
 *
 * Every pair, not every pair within a ring. Ring-local spacing was the
 * original measure and it could not see the failure it existed to catch: two
 * rings whose slot counts share no step size drift into alignment, and the
 * pair that collides is one outer slot against one inner slot. Ring-local
 * spacing reported 83.6px for a layout whose true tightest pair was 55.8px.
 */
export function radialTightestSpacing(total: number, diameter: number): number {
  const slots = radialSlotsFor(total);
  const points = slots.map(slot => {
    const radians = (slot.angleDeg - 90) * Math.PI / 180;
    const radius = (MOBILE_RING_RADII[slot.ring] ?? 0) * diameter;
    return { x: Math.cos(radians) * radius, y: Math.sin(radians) * radius };
  });
  let tightest = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      tightest = Math.min(tightest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
    }
  }
  return tightest;
}

/**
 * Which trigger a point addresses, in normalized wheel space (offsets as a
 * fraction of the wheel's diameter from its centre, +y downward).
 */
export function radialTriggerAt(
  nx: number, ny: number, total: number, rotation = 0, tolerance?: number,
) {
  if (total <= 0) return -1;
  const point = unrotatePoint(nx, ny, rotation);
  return hitSlot(point.x, point.y, radialSlotsFor(total), tolerance);
}

/** Auto-Mosh / auto-shuffle interval options — the one list every surface
 *  that touches shuffleSec draws from (this rail, its keyboard cycle in
 *  Editor.tsx, and the bottom-panel ShufflePanel), so "5s here, 3s there"
 *  can't happen again. */
export const AUTO_MOSH_TIMINGS = [3, 15, 30, 60, 300, 600] as const;
const DEFAULT_AUTO_MOSH_SEC = 15;

/** Performance-first: make/change/restore, direct the live response, capture,
 * deepen the artwork, then source/system/navigation utilities.
 * pro-mode, sensitivity, export-settings, support, and the VR/immersive
 * override used to live here too — all five now live inside the "account"
 * trigger's settings overlay instead (see AccountSettingsOverlay.tsx), so
 * none of them need a ring slot of their own any more. */
const DEFAULT_ORDER = [
  "mosh", "params", "undo", "redo", "journey", "auto-mosh", "clear-fx", "dark-mode",
  "audio", "theme-track", "freeze",
  "capture", "gif", "share", "favorites",
  "sticker-mode",
  "source-camera", "switch-camera", "source-upload", "source-forge", "forge-palette", "source-motif", "motif-maestro",
  "fullscreen", "desktop-portrait", "account", "home",
] as const;

const TRIGGER_LABELS: Record<string, string> = {
  home: "Back to start", undo: "Undo", redo: "Redo",
  "source-upload": "Upload source", "source-camera": "Live camera", "source-forge": "Forge source", "source-motif": "Motif Maestro", account: "Settings",
  mosh: "Mosh", "auto-mosh": "Auto-Mosh", "clear-fx": "Clear FX", journey: "Journey",
  params: "Parameters — layers, FX, tune, audio (two-finger hold, or T)",
  "dark-mode": "Dark Mode — crush light to black, push color to neon",
  audio: "Audio (mic / device / beat sync)",
  freeze: "Freeze", capture: "Capture — tap for a still, hold to record", gif: "GIF loop", share: "Share",
  "sticker-mode": "Sticker Studio",
  "theme-track": "Theme track", favorites: "Favorites", fullscreen: "Fullscreen",
  "forge-palette": "Forge settings — colour is directed automatically",
  "motif-maestro": "Motif Maestro controls",
  "switch-camera": "Switch camera",
  "desktop-portrait": "Canvas shape",
};

const ORDER_KEY = "cathedral_hot_trigger_order_v2";

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
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
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
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
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
      data-hot-trigger-hold={onPointerDown ? "true" : undefined}
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

  return createPortal(
    <div
      role="status"
      // Portaled to <body> and fixed, not anchored to the theme-track ring
      // slot: that slot lives inside the radial wheel, which is
      // visibility:hidden whenever the wheel itself is closed — this nudge
      // is meant to appear unprompted while the user is just watching the
      // visualizer. A plain `fixed` here (without the portal) still isn't
      // viewport-relative: an ancestor further up the page tree establishes
      // its own containing block for fixed descendants, so the toast landed
      // thousands of pixels down the page instead of in the corner.
      className={`fixed bottom-20 right-3 z-50 w-56 rounded-md border border-[hsl(var(--accent))]/40 bg-black/90 p-2.5 backdrop-blur-md panel-in-3d safe-bottom safe-right ${leaving ? "bg-glitch-pulse" : ""}`}
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
    </div>,
    document.body,
  );
}

function TrackTrigger({ delay }: { delay: number }) {
  const trackEnabled = useStore(s => s.trackEnabled);
  const trackTitle = useStore(s => s.trackTitle);
  const setTrackEnabled = useStore(s => s.setTrackEnabled);
  const setTrackMeta = useStore(s => s.setTrackMeta);
  const uploadedTracks = useStore(s => s.uploadedTracks);
  const addUploadedTrack = useStore(s => s.addUploadedTrack);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startRandomTrack = () => {
    runTrackAction(() => trackPlayer.shuffleShowcaseTrack());
  };

  useEffect(() => {
    if (!open) return;
    // Checks the attribute rather than wrapRef.contains(): the panel is
    // portaled to <body> (see below) so it lands in a fixed, always
    // on-screen spot regardless of where this trigger sits on the ring —
    // real DOM containment no longer holds once it's outside wrapRef's tree.
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-shuffle-picker]")) setOpen(false);
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
        title={trackEnabled ? `Pause · ${trackTitle} — Command+Shift-click to choose a song` : "Play a random song + moment — Command+Shift-click to choose"}
        data-active={trackEnabled || undefined}
        data-tint=""
        data-no-longpress
        className="hot-trigger"
        style={{ animationDelay: `${delay}ms`, ["--ht-tint" as string]: "262 68% 72%" }}
        /* Command+Shift opens the picker instead of toggling. The caret below already
           opens it, but it is a 20px target tucked in a corner of another
           button — fine to discover once, tedious to hit every time you want
           a specific track. Ctrl+Shift mirrors the gesture off macOS, and a
           plain tap still toggles randomized playback exactly as before. */
        onClick={(event) => {
          if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
            event.stopPropagation();
            setOpen(true);
            return;
          }
          if (trackEnabled) setTrackEnabled(false); else startRandomTrack();
        }}
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
        onClick={(event) => { event.stopPropagation(); setOpen(o => !o); }}
        aria-label="Track options"
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        data-no-longpress
        className="pointer-events-auto absolute -bottom-1 -right-1 z-20 grid h-5 w-5 place-items-center rounded-full bg-black/80 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--accent))]"
        title="Track options"
      >
        <ShuffleIcon className="h-2 w-2" strokeWidth={2.5} />
      </button>

      {open && createPortal(
        <div
          data-shuffle-picker
          // Fixed to a corner instead of anchored to this trigger's own ring
          // slot (see forge-palette/motif-maestro for the same pattern): the
          // ring can place this trigger anywhere in a circle nearly filling
          // the viewport, and a slot in the lower arc left most of this
          // library's song list rendered below the visible screen.
          className="fixed left-3 top-14 z-50 w-64 safe-top safe-left"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="panel-in-3d max-h-[82dvh] w-full overflow-y-auto rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-2.5 backdrop-blur-md [scrollbar-width:thin]"
            role="menu"
            aria-label="Track options"
          >
          <div className="overflow-hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--text-secondary))]">
            now playing
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-[hsl(var(--text-primary))]" title={trackTitle}>
            {trackTitle}
          </div>
          <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.14em] text-[hsl(var(--text-tertiary))]">
            cmd + shift + song trigger opens this library
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

          {uploadedTracks.length > 0 && (
            <>
              <div className="mt-2.5 mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">
                yours
              </div>
              <div className="flex flex-col gap-0.5">
                {uploadedTracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    data-no-longpress
                    data-active={trackTitle === t.title || undefined}
                    aria-current={trackTitle === t.title ? "true" : undefined}
                    onClick={async () => {
                      setOpen(false);
                      try {
                        await trackPlayer.setSource(t.url, t.title, "");
                        setTrackMeta(t.title, "");
                        setTrackEnabled(true);
                      } catch (err) {
                        // An object URL dies with the document that made it,
                        // and Safari can drop one earlier under memory
                        // pressure. Say so rather than failing silently on a
                        // row that looks perfectly fine.
                        console.error("[track] uploaded track no longer available:", err);
                        toast.error(`"${t.title}" is no longer loaded — add the file again`);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] data-[active]:!border-[#5dff9b]/50 data-[active]:!text-[#5dff9b]"
                  >
                    <Upload className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="mt-2.5 mb-1 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--text-tertiary))]">
            <span>showcase</span>
            <span>{SHOWCASE_TRACKS.length} songs</span>
          </div>
          <div className="flex max-h-[min(42dvh,22rem)] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
            {SHOWCASE_TRACKS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                data-no-longpress
                data-active={trackTitle === t.title || undefined}
                aria-current={trackTitle === t.title ? "true" : undefined}
                onClick={() => { setOpen(false); runTrackAction(() => trackPlayer.useShowcaseTrack(t.id)); }}
                className="flex w-full items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(var(--text-secondary))] transition hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))] data-[active]:!border-[#5dff9b]/50 data-[active]:!text-[#5dff9b]"
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
              const issue = validateAudioUpload(f);
              if (issue) { toast.error(issue); return; }
              const url = URL.createObjectURL(f);
              const name = f.name.replace(/\.[^.]+$/, "");
              try {
                await trackPlayer.setSource(url, name, "");
                setTrackMeta(name, "");
                setTrackEnabled(true);
                // Keep it in the picker. Without this an upload was playable
                // exactly once — switching to a showcase track and back meant
                // re-browsing for a file already loaded in this session.
                addUploadedTrack({ id: `upload:${name}`, url, title: name });
                setOpen(false);
              } catch (err) {
                console.error("[track] failed to load audio file:", err);
                URL.revokeObjectURL(url);
                toast.error("Couldn't load that audio file");
              }
            }}
          />
          </div>
        </div>,
        document.body,
      )}
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
    // Checks the attribute rather than wrapRef.contains(): the panel itself
    // is portaled to <body> (see below) so it can land in a fixed, always
    // on-screen spot regardless of where this trigger sits on the ring —
    // real DOM containment no longer holds once it's outside wrapRef's tree.
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-audio-source-picker]")) setOpen(false);
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
        onClick={(e) => {
          if (micEnabled) { setMicEnabled(false); onMicFlash?.(false); return; }
          if (systemAudioEnabled) { setSystemAudioEnabled(false); onMicFlash?.(false); return; }
          // Opening the source/beat-sync popover, not firing a one-shot
          // action — must not bubble into the ring-item wrapper's
          // dismiss-on-click, or the popover would never get to show.
          e.stopPropagation();
          setOpen(v => !v);
        }}
      >
        {listening ? <Mic className="h-4 w-4" strokeWidth={1.5} /> : <MicOff className="h-4 w-4" strokeWidth={1.5} />}
      </HotBtn>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="Audio options — source and beat sync"
        aria-expanded={open || undefined}
        aria-haspopup="menu"
        data-no-longpress
        className="absolute -bottom-1 -right-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/70 text-[hsl(var(--text-secondary))] transition hover:text-[hsl(var(--accent))]"
        title="Audio options — source & beat sync"
      >
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>

      {open && createPortal(
        <div
          data-audio-source-picker
          // Fixed to a corner instead of anchored to this trigger's own ring
          // slot (see forge-palette/motif-maestro for the same pattern): the
          // ring can place this trigger anywhere in a circle nearly filling
          // the viewport, and a slot in the lower arc left this panel's BPM
          // input and beat-sync toggle rendered below the visible screen
          // with no way to reach them.
          className="panel-in-3d fixed left-3 top-14 z-50 w-60 max-h-[70vh] overflow-y-auto rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md safe-top safe-left"
          role="menu"
          aria-label="Audio options"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
          <AudioInputControls compact />

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
        </div>,
        document.body,
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
  ids, registry, visualizerRef, isRecording, onSelect, onMosh,
}: {
  ids: string[];
  registry: Record<string, ReactNode>;
  visualizerRef?: RefObject<HTMLElement>;
  isRecording: boolean;
  onSelect: (id: string) => void;
  /** Hold-and-release without steering to any ring item, or a direct tap
   *  on the center hub — both mosh to the next FX stack, same as a plain
   *  click/spacebar always has. */
  onMosh: () => void;
}) {
  // Always opens on page one. Remembering the page would make the wheel
  // non-deterministic, and muscle memory — the whole reason this layout was
  // worth preserving — depends on the same flick reaching the same trigger
  // every time you summon it.
  const [page, setPage] = useState(0);
  const pages = radialPageCount(ids.length);
  const pageIds = useMemo(() => radialPageIds(ids, page), [ids, page]);

  const layerRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const wheelRectRef = useRef<DOMRect | null>(null);
  const openRef = useRef(false);
  const gestureRef = useRef({
    pointerId: -1, x: 0, y: 0, lastX: 0, lastY: 0,
    originX: 0, originY: 0, maxTravel: 0,
    startedAt: 0, armed: false, fired: false, cancelled: false, pointerType: "mouse",
  });
  const armTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const highlightRef = useRef<string | null>(null);
  const labelSwapRef = useRef(false);
  const rotationRef = useRef<number>(Number.NaN);
  if (Number.isNaN(rotationRef.current)) {
    try { rotationRef.current = Number(localStorage.getItem(MOBILE_WHEEL_ROTATION_KEY)) || 0; } catch { rotationRef.current = 0; }
  }
  const idsRef = useRef(pageIds);
  const activateRef = useRef<(id: string) => void>(() => {});
  // The keydown listener is registered once, on mount. Reading turnPage
  // through a ref keeps it from capturing the first render's `pages` and
  // `ids.length`: several registry entries are conditional, so the trigger
  // count does change at runtime, and a wheel that mounted with one page
  // would otherwise never regain keyboard paging.
  const turnPageRef = useRef<(direction: -1 | 1) => void>(() => {});
  idsRef.current = pageIds;
  // Placement comes from the same module the hit-test reads, so a slot can
  // never be drawn somewhere it can't be touched. Rebuilt only when the
  // trigger count changes — rotation is applied in CSS and unwound in the
  // hit-test, never by regenerating this.
  const slotsRef = useRef<WheelSlot[]>([]);
  slotsRef.current = radialSlotsFor(pageIds.length);

  const clearTimers = () => {
    if (armTimerRef.current != null) window.clearTimeout(armTimerRef.current);
    if (openTimerRef.current != null) window.clearTimeout(openTimerRef.current);
    armTimerRef.current = null;
    openTimerRef.current = null;
  };

  const setPhase = (phase: "idle" | "armed" | "open") => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.dataset.phase = phase;
    openRef.current = phase === "open";
    // While the wheel is up, no other canvas recognizer gets to act on the
    // fingers steering it — a flick across the ring is not an undo swipe.
    if (phase === "open") gestureLock.claim("hot-trigger-wheel");
    else gestureLock.release("hot-trigger-wheel");
    wheelRef.current?.setAttribute("aria-hidden", phase === "open" ? "false" : "true");
    // Published so the audio nudge can fire only while the menu that answers
    // it is actually on screen (see Editor's nudge effect).
    useStore.getState().setRadialMenuOpen(phase === "open");
  };

  // A menu that stops existing is not open. setPhase is imperative here (it
  // writes straight to the DOM rather than through state), so nothing else
  // would clear this on unmount.
  useEffect(() => () => useStore.getState().setRadialMenuOpen(false), []);

  const select = (id: string | null) => {
    if (highlightRef.current === id) return;
    if (highlightRef.current) slotRefs.current.get(highlightRef.current)?.removeAttribute("data-highlighted");
    highlightRef.current = id;
    if (id) slotRefs.current.get(id)?.setAttribute("data-highlighted", "true");
    if (id) {
      const rect = slotRefs.current.get(id)?.getBoundingClientRect();
      if (rect) cursorFx.preview((rect.left + rect.width / 2) / Math.max(1, window.innerWidth), (rect.top + rect.height / 2) / Math.max(1, window.innerHeight));
      try { navigator.vibrate?.(3); } catch {}
    }
    const label = labelRef.current;
    if (label) {
      label.textContent = id ? (TRIGGER_LABELS[id] ?? id) : "MOSH";
      labelSwapRef.current = !labelSwapRef.current;
      label.dataset.swap = labelSwapRef.current ? "a" : "b";
    }
  };

  const activate = (id: string) => {
    onSelect(id);
    const slot = slotRefs.current.get(id);
    slot?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.click();
  };
  activateRef.current = activate;

  const cacheWheelRect = () => { wheelRectRef.current = wheelRef.current?.getBoundingClientRect() ?? null; };

  /** Pauses the ring's ambient animations while a finger is actually working
   *  it, so the frame budget goes to pointer response instead. */
  const setSteering = (on: boolean) => {
    const layer = layerRef.current;
    if (!layer) return;
    if (on) layer.dataset.steering = "true";
    else delete layer.dataset.steering;
  };

  const paintRotation = (next: number) => {
    rotationRef.current = next;
    const wheel = wheelRef.current;
    if (!wheel) return;
    wheel.style.setProperty("--radial-rotation", `${next}deg`);
    wheel.style.setProperty("--radial-counter-rotation", `${-next}deg`);
  };

  const persistRotationSoon = () => {
    if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      try { localStorage.setItem(MOBILE_WHEEL_ROTATION_KEY, String(rotationRef.current)); } catch {}
    }, 120);
  };

  const turnPage = (direction: -1 | 1) => {
    if (pages <= 1) return;
    setPage(current => wrapPage(current + direction, ids.length));
    select(null);
    try { navigator.vibrate?.(4); } catch { /* Android only */ }
  };
  turnPageRef.current = turnPage;

  const dismiss = () => {
    clearTimers();
    setSteering(false);
    setPhase("idle");
    select(null);
    // Back to page one, so the next summon puts the same trigger under the
    // same flick. A wheel that reopens wherever you left it is a wheel you
    // have to read before you can use.
    setPage(0);
  };

  const selectFromFlick = (dx: number, dy: number, pointerType: string) => {
    const distance = Math.hypot(dx, dy);
    const threshold = radialFlickThreshold(pointerType);
    if (distance < threshold) { select(null); return; }
    // Normalize by the wheel's own size before hit-testing, so a flick lands
    // on the slot the user can actually see at whatever size the wheel is.
    const size = wheelRectRef.current?.width
      ?? Math.min(window.innerWidth, window.innerHeight) * 0.84;
    const onRing = clampFlickToRings(dx / size, dy / size);
    const index = radialTriggerAt(onRing.x, onRing.y, idsRef.current.length, rotationRef.current, FLICK_TOLERANCE);
    select(idsRef.current[index] ?? null);
  };

  useEffect(() => {
    const target = visualizerRef?.current;
    if (!target) return;
    const ignored = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element && !!eventTarget.closest("button, a, input, textarea, select, [role='slider'], [data-no-longpress], .mobile-radial-wheel");
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // A second finger landing mid-hold means the user is reaching for the
      // Parameters Wheel's two-finger gesture, not this one-finger hold.
      // Without this the single-finger hold would mature first and open the
      // wrong wheel out from under them.
      if (gestureRef.current.pointerId !== -1) {
        if (event.pointerId !== gestureRef.current.pointerId && !gestureRef.current.fired) {
          gestureRef.current.cancelled = true;
          clearTimers();
          setPhase("idle");
        }
        return;
      }
      if (ignored(event.target)) return;
      // The other wheel owns the screen while it is up.
      if (useStore.getState().paramWheelOpen) return;
      if (!isCentralRadialHoldPoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight)) return;
      clearTimers();
      gestureRef.current = {
        pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        lastX: event.clientX, lastY: event.clientY, startedAt: performance.now(),
        originX: event.clientX, originY: event.clientY, maxTravel: 0,
        armed: false, fired: false, cancelled: false, pointerType: event.pointerType || "mouse",
      };
      armTimerRef.current = window.setTimeout(() => {
        if (gestureRef.current.pointerId !== event.pointerId || gestureRef.current.cancelled) return;
        gestureRef.current.armed = true;
        setPhase("armed");
      }, RADIAL_WHEEL_ARM_MS);
      openTimerRef.current = window.setTimeout(() => {
        const gesture = gestureRef.current;
        if (gesture.pointerId !== event.pointerId || gesture.cancelled) return;
        gesture.fired = true;
        gesture.x = window.innerWidth / 2;
        gesture.y = window.innerHeight / 2;
        suppressClickRef.current = true;
        setPhase("open");
        cacheWheelRect();
        select(null);
        try { navigator.vibrate?.(12); } catch {}
      }, RADIAL_WHEEL_HOLD_MS);
    };
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (event.pointerId !== gesture.pointerId) return;
      const samples = event.getCoalescedEvents?.() ?? [];
      const sample = samples[samples.length - 1] ?? event;
      gesture.lastX = sample.clientX;
      gesture.lastY = sample.clientY;
      gesture.maxTravel = Math.max(gesture.maxTravel, Math.hypot(sample.clientX - gesture.originX, sample.clientY - gesture.originY));
      const dx = sample.clientX - gesture.x;
      const dy = sample.clientY - gesture.y;
      const distance = Math.hypot(dx, dy);
      if (!gesture.fired) {
        const tolerance = radialHoldJitterTolerance(gesture.pointerType);
        if (!gesture.armed && performance.now() - gesture.startedAt < RADIAL_WHEEL_ARM_MS && distance > tolerance) {
          gesture.cancelled = true;
          clearTimers();
          setPhase("idle");
        }
        return;
      }
      if (radialGestureShouldActivate(gesture.maxTravel, gesture.pointerType)) {
        setSteering(true);
        selectFromFlick(dx, dy, gesture.pointerType);
      }
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current.pointerId) return;
      clearTimers();
      let keepOpen = false;
      if (gestureRef.current.fired) {
        const gesture = gestureRef.current;
        gesture.maxTravel = Math.max(gesture.maxTravel, Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY));
        if (radialGestureShouldActivate(gesture.maxTravel, gesture.pointerType)) {
          selectFromFlick(event.clientX - gesture.x, event.clientY - gesture.y, gesture.pointerType);
          if (highlightRef.current) activateRef.current(highlightRef.current);
          else keepOpen = true;
        } else {
          select(null);
          keepOpen = true;
        }
      }
      setSteering(false);
      if (!keepOpen) { setPhase("idle"); select(null); }
      gestureRef.current.pointerId = -1;
    };
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current.pointerId) return;
      clearTimers();
      if (!gestureRef.current.fired) setPhase("idle");
      gestureRef.current.pointerId = -1;
      select(null);
    };
    const onClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    target.addEventListener("pointerdown", onDown, { passive: true });
    target.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerrawupdate", onMove as EventListener, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      clearTimers();
      target.removeEventListener("pointerdown", onDown);
      target.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerrawupdate", onMove as EventListener);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [visualizerRef]);

  const rotateRef = useRef<{ id: number; angle: number; rotation: number } | null>(null);
  const pointerAngle = (x: number, y: number) => {
    const rect = wheelRectRef.current ?? wheelRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.atan2(y - (rect.top + rect.height / 2), x - (rect.left + rect.width / 2)) * 180 / Math.PI;
  };
  const selectNearest = (x: number, y: number, currentRotation = rotationRef.current) => {
    const rect = wheelRectRef.current ?? wheelRef.current?.getBoundingClientRect();
    if (!rect || idsRef.current.length === 0) { select(null); return; }
    const nx = (x - (rect.left + rect.width / 2)) / rect.width;
    const ny = (y - (rect.top + rect.height / 2)) / rect.height;
    const index = radialTriggerAt(nx, ny, idsRef.current.length, currentRotation);
    select(idsRef.current[index] ?? null);
  };
  useEffect(() => {
    const wheel = wheelRef.current;
    if (!wheel) return;
    const onWheel = (event: WheelEvent) => {
      if (!openRef.current) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      const next = rotationRef.current + Math.max(-24, Math.min(24, delta * .18));
      paintRotation(next);
      selectNearest(event.clientX, event.clientY, next);
      persistRotationSoon();
    };
    wheel.addEventListener("wheel", onWheel, { passive: false });
    return () => wheel.removeEventListener("wheel", onWheel);
  }, [pageIds.length]);

  useEffect(() => {
    const onResize = () => { wheelRectRef.current = null; };
    const onKey = (event: KeyboardEvent) => {
      if (!openRef.current) return;
      if (event.key === "Escape") { dismiss(); return; }
      if (event.key === "PageDown" || event.key === "ArrowRight") { event.preventDefault(); turnPageRef.current(1); return; }
      if (event.key === "PageUp" || event.key === "ArrowLeft") { event.preventDefault(); turnPageRef.current(-1); }
    };
    const onExternalOpen = () => { setPhase("open"); cacheWheelRect(); };
    const onExternalClose = () => dismiss();
    // Two wheels are never up at once — the second one to open wins.
    const onParamWheelOpen = () => { if (openRef.current) dismiss(); };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("mosh:open-hot-triggers", onExternalOpen);
    window.addEventListener("mosh:close-hot-triggers", onExternalClose);
    window.addEventListener("mosh:open-param-wheel", onParamWheelOpen);
    const frame = requestAnimationFrame(() => layerRef.current?.setAttribute("data-prepared", "true"));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mosh:open-hot-triggers", onExternalOpen);
      window.removeEventListener("mosh:close-hot-triggers", onExternalClose);
      window.removeEventListener("mosh:open-param-wheel", onParamWheelOpen);
      gestureLock.release("hot-trigger-wheel");
      if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    };
  }, []);

  return (
    <div ref={layerRef} data-phase="idle" className="mobile-radial-layer pointer-events-none absolute inset-0 z-[70]">
      {/* Keyboard-only entry point (Tab + Enter/Space) for the wheel — real
          users open it with the long-press gesture below. pointer-events-none
          keeps this off mouse/touch hit-testing: it's dead center of the
          whole screen, and Chromium's touch-target adjustment was snapping
          taps several pixels away onto this invisible 1px button instead of
          the canvas underneath it. Keyboard activation doesn't go through
          hit-testing, so it's unaffected. */}
      <button type="button" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px opacity-0" onClick={() => { setPhase("open"); cacheWheelRect(); }} aria-label="Open radial controls" />
          <button type="button" className="mobile-radial-wheel__backdrop absolute inset-0" aria-label="Close radial controls" onClick={dismiss} />
          <div
            ref={wheelRef}
            className="mobile-radial-wheel absolute left-1/2 top-1/2"
            role="menu"
            aria-label="Visualizer controls"
            aria-hidden="true"
            style={{
              ["--radial-rotation" as string]: `${rotationRef.current}deg`,
              ["--radial-counter-rotation" as string]: `${-rotationRef.current}deg`,
            }}
            onPointerDown={(event) => {
              if (event.target instanceof Element && event.target.closest("[data-radial-action]")) return;
              cacheWheelRect();
              rotateRef.current = { id: event.pointerId, angle: pointerAngle(event.clientX, event.clientY), rotation: rotationRef.current };
              setSteering(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = rotateRef.current;
              if (drag && drag.id === event.pointerId) {
                const next = drag.rotation + pointerAngle(event.clientX, event.clientY) - drag.angle;
                paintRotation(next);
                selectNearest(event.clientX, event.clientY, next);
                return;
              }
              selectNearest(event.clientX, event.clientY);
            }}
            onPointerLeave={() => { if (!rotateRef.current) select(null); }}
            onPointerUp={(event) => {
              if (rotateRef.current?.id !== event.pointerId) return;
              rotateRef.current = null;
              setSteering(false);
              persistRotationSoon();
            }}
            onPointerCancel={(event) => {
              if (rotateRef.current?.id !== event.pointerId) return;
              rotateRef.current = null;
              setSteering(false);
            }}
          >
            <div className="mobile-radial-wheel__rings" aria-hidden><i/><b/><em/></div>
            {pageIds.map((id, index) => {
              const slot = slotsRef.current[index];
              if (!slot) return null;
              const angle = slot.angleDeg;
              const radius = slot.radius;
              return (
                <div
                  key={id}
                  ref={(node) => { if (node) slotRefs.current.set(id, node); else slotRefs.current.delete(id); }}
                  role="menuitem"
                  data-radial-id={id}
                  data-radial-variant={index % 8}
                  data-radial-action
                  className="mobile-radial-wheel__slot"
                  style={{
                    ["--slot-angle" as string]: `${angle}deg`,
                    ["--slot-counter-angle" as string]: `${-angle}deg`,
                    ["--slot-radius" as string]: `${radius}`,
                    ["--slot-delay" as string]: `${-(index % 9) * 137}ms`,
                  }}
                  onClick={() => { onSelect(id); dismiss(); }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerEnter={() => select(id)}
                  onFocus={() => select(id)}
                >
                  {registry[id]}
                </div>
              );
            })}
            <button
              type="button"
              data-mosh-input
              className="mobile-radial-wheel__hub"
              onClick={() => { onMosh(); dismiss(); }}
              aria-label="Mosh to the next FX stack"
            >
              <span ref={labelRef} className="mobile-radial-wheel__label">MOSH</span>
              <small>{isRecording ? "REC" : "steer · tap · flick"}</small>
            </button>
          </div>
          {pages > 1 && (
            /* A SIBLING of the wheel, not a child. The chevrons sit below the
               outer ring — the ring is the scarce, accurate real estate, and
               spending two of its best positions on navigation gives back
               exactly what pagination was meant to buy — but the wheel carries
               `contain: paint`, which clips everything outside its border box.
               Nested, this rendered nothing at all and left page two
               unreachable. It also kept non-menuitem children inside the
               wheel's role="menu"; out here, both problems go away. */
            <div className="mobile-radial-wheel__pager" data-radial-action>
              <button
                type="button"
                data-no-longpress
                aria-label="Previous triggers"
                onClick={() => turnPage(-1)}
              >‹</button>
              {/* The pips are decorative, so the live region needs real text of
                  its own — a label on a role-less span announces nothing when
                  it changes. */}
              <span aria-live="polite">
                <span className="sr-only">{`Page ${page + 1} of ${pages}`}</span>
                {Array.from({ length: pages }, (_, index) => (
                  <i key={index} data-on={index === page || undefined} aria-hidden />
                ))}
              </span>
              <button
                type="button"
                data-no-longpress
                aria-label="Next triggers"
                onClick={() => turnPage(1)}
              >›</button>
            </div>
          )}
    </div>
  );
}

function DesktopRadialWheel({
  ids, registry, visualizerRef, isRecording, onSelect, onMosh,
}: {
  ids: string[];
  registry: Record<string, ReactNode>;
  visualizerRef?: RefObject<HTMLElement>;
  isRecording: boolean;
  onSelect: (id: string) => void;
  /** Hold-and-release without steering to any ring item, or a direct click
   *  on the center hub — both mosh to the next FX stack, same as a plain
   *  click/spacebar always has. */
  onMosh: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "armed" | "open">("idle");
  // Same signal the mobile wheel publishes, so the nudge behaves identically
  // on both. Cleared on unmount — a menu that stops existing is not open.
  useEffect(() => {
    useStore.getState().setRadialMenuOpen(phase === "open");
  }, [phase]);
  useEffect(() => () => useStore.getState().setRadialMenuOpen(false), []);
  const [editing, setEditing] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [center, setCenter] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const [layout, setLayout] = useState<RadialLayout>(() => {
    try { return JSON.parse(localStorage.getItem(DESKTOP_WHEEL_LAYOUT_KEY) || "{}"); } catch { return {}; }
  });
  const wheelRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const labelSwapRef = useRef(false);
  const idsRef = useRef(ids);
  const layoutRef = useRef(layout);
  const highlightedRef = useRef<string | null>(null);
  const editingRef = useRef(editing);
  const gestureRef = useRef({ pointerId: -1, x: 0, y: 0, lastX: 0, lastY: 0, originX: 0, originY: 0, maxTravel: 0, startedAt: 0, fired: false, armed: false, cancelled: false, pointerType: "mouse" });
  const editDragRef = useRef<{ pointerId: number; id: string } | null>(null);
  idsRef.current = ids;
  layoutRef.current = layout;
  editingRef.current = editing;

  // Same "glitch a fresh name in" swap the mobile wheel's hub already did —
  // brought over here so hovering/steering across ring items reads
  // identically on both. `dataset.swap` alternates a/b purely to force the
  // CSS animation to re-trigger on every change, even repeats.
  const updateLabel = (text: string) => {
    const label = labelRef.current;
    if (!label) return;
    label.textContent = text;
    labelSwapRef.current = !labelSwapRef.current;
    label.dataset.swap = labelSwapRef.current ? "a" : "b";
  };
  const select = (id: string | null) => {
    if (highlightedRef.current === id) return;
    highlightedRef.current = id;
    setHighlighted(id);
    updateLabel(editingRef.current ? "DONE" : (id ? (TRIGGER_LABELS[id] ?? id) : "MOSH"));
    if (id) {
      const slot = wheelRef.current?.querySelector<HTMLElement>(`[data-radial-id="${CSS.escape(id)}"]`);
      const rect = slot?.getBoundingClientRect();
      if (rect) cursorFx.preview((rect.left + rect.width / 2) / Math.max(1, window.innerWidth), (rect.top + rect.height / 2) / Math.max(1, window.innerHeight));
      try { navigator.vibrate?.(3); } catch {}
    }
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

  const selectFromPointer = (clientX: number, clientY: number, pointerType: string) => {
    const gesture = gestureRef.current;
    const size = Math.min(window.innerWidth * 0.78, window.innerHeight * 0.78, 560);
    const dx = clientX - gesture.x;
    const dy = clientY - gesture.y;
    const distance = Math.hypot(dx, dy);
    if (distance < radialFlickThreshold(pointerType)) { select(null); return; }
    select(nearestRadialId({ x: dx / size, y: dy / size }, idsRef.current, layoutRef.current, 0.2));
  };

  useEffect(() => {
    const target = visualizerRef?.current;
    if (!target) return;
    let armTimer: number | null = null;
    let openTimer: number | null = null;
    const cancelTimers = () => {
      if (armTimer != null) window.clearTimeout(armTimer);
      if (openTimer != null) window.clearTimeout(openTimer);
      armTimer = null;
      openTimer = null;
    };
    // SVG icons are Elements but not HTMLElements. Treat clicks on the icon
    // inside a nested button as control clicks too, otherwise the radial
    // gesture listener starts underneath the button and closes the wheel on
    // pointer-up before its popover can be used.
    const ignored = (eventTarget: EventTarget | null) =>
      eventTarget instanceof Element && !!eventTarget.closest("button, a, input, textarea, select, [role='slider'], [data-no-longpress], .desktop-radial-wheel");
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.button !== 0 || ignored(event.target) || gestureRef.current.pointerId !== -1) return;
      if (!isCentralRadialHoldPoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight)) return;
      cancelTimers();
      gestureRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, originX: event.clientX, originY: event.clientY, maxTravel: 0, startedAt: performance.now(), fired: false, armed: false, cancelled: false, pointerType: event.pointerType || "mouse" };
      armTimer = window.setTimeout(() => {
        if (gestureRef.current.pointerId !== event.pointerId || gestureRef.current.cancelled) return;
        gestureRef.current.armed = true;
        setPhase("armed");
      }, RADIAL_WHEEL_ARM_MS);
      openTimer = window.setTimeout(() => {
        if (gestureRef.current.pointerId !== event.pointerId || gestureRef.current.cancelled) return;
        const nextCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        gestureRef.current = { ...gestureRef.current, x: nextCenter.x, y: nextCenter.y, fired: true };
        setCenter(nextCenter);
        setEditing(false);
        setPhase("open");
        select(null);
      }, RADIAL_WHEEL_HOLD_MS);
    };
    const onMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (event.pointerId !== gesture.pointerId) return;
      const samples = event.getCoalescedEvents?.() ?? [];
      const sample = samples[samples.length - 1] ?? event;
      gesture.lastX = sample.clientX;
      gesture.lastY = sample.clientY;
      gesture.maxTravel = Math.max(gesture.maxTravel, Math.hypot(sample.clientX - gesture.originX, sample.clientY - gesture.originY));
      const distance = Math.hypot(sample.clientX - gesture.x, sample.clientY - gesture.y);
      if (!gesture.fired) {
        if (!gesture.armed && performance.now() - gesture.startedAt < RADIAL_WHEEL_ARM_MS && distance > radialHoldJitterTolerance(gesture.pointerType)) {
          gesture.cancelled = true;
          cancelTimers();
          setPhase("idle");
        }
        return;
      }
      if (radialGestureShouldActivate(gesture.maxTravel, gesture.pointerType)) selectFromPointer(sample.clientX, sample.clientY, gesture.pointerType);
    };
    const onEnd = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current.pointerId) return;
      cancelTimers();
      let keepOpen = false;
      if (gestureRef.current.fired) {
        const gesture = gestureRef.current;
        gesture.maxTravel = Math.max(gesture.maxTravel, Math.hypot(event.clientX - gesture.originX, event.clientY - gesture.originY));
        if (radialGestureShouldActivate(gesture.maxTravel, gesture.pointerType)) {
          selectFromPointer(event.clientX, event.clientY, gesture.pointerType);
          if (highlightedRef.current) activate(highlightedRef.current);
          else keepOpen = true;
        } else {
          select(null);
          keepOpen = true;
        }
      }
      if (!keepOpen) setPhase("idle");
      gestureRef.current.pointerId = -1;
      select(null);
    };
    target.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerrawupdate", onMove as EventListener, { passive: true });
    window.addEventListener("pointerup", onEnd, { passive: true });
    window.addEventListener("pointercancel", onEnd, { passive: true });
    return () => {
      cancelTimers();
      target.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerrawupdate", onMove as EventListener);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [visualizerRef, activate]);

  useEffect(() => {
    const open = () => { setCenter({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); setPhase("open"); };
    const close = () => { setPhase("idle"); setEditing(false); select(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("mosh:open-hot-triggers", open);
    window.addEventListener("mosh:close-hot-triggers", close);
    window.addEventListener("keydown", key);
    const frame = requestAnimationFrame(() => layerRef.current?.setAttribute("data-prepared", "true"));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mosh:open-hot-triggers", open);
      window.removeEventListener("mosh:close-hot-triggers", close);
      window.removeEventListener("keydown", key);
    };
  }, []);

  return (
    <div ref={layerRef} data-phase={phase} className="desktop-radial-layer pointer-events-none fixed inset-0 z-[70]">
        {/* Keyboard-only entry point — see the mobile variant's comment above. */}
        <button type="button" className="pointer-events-none absolute left-1/2 top-1/2 h-px w-px opacity-0" onClick={() => setPhase("open")} aria-label="Open radial controls" />
        <button type="button" className="mobile-radial-wheel__backdrop absolute inset-0" aria-label="Close radial controls" onClick={() => { setPhase("idle"); setEditing(false); }} />
        <div
          ref={wheelRef}
          className="desktop-radial-wheel mobile-radial-wheel absolute"
          style={{ left: center.x, top: center.y }}
          role="menu"
          aria-label="Desktop visualizer controls"
          aria-hidden={phase === "open" ? "false" : "true"}
        >
          <div className="mobile-radial-wheel__rings" aria-hidden><i/><b/><em/></div>
          {ids.map((id, index) => {
            const point = layout[id] ?? defaultRadialPoint(index, ids.length);
            return (
              <div
                key={id}
                role="menuitem"
                data-radial-id={id}
                data-radial-variant={index % 8}
                data-radial-action
                data-highlighted={highlighted === id || undefined}
                data-editing={editing || undefined}
                className="mobile-radial-wheel__slot"
                style={{
                  transform: `translate(-50%, -50%) translate(calc(var(--radial-size) * ${point.x}), calc(var(--radial-size) * ${point.y}))`,
                  ["--slot-delay" as string]: `${-(index % 9) * 137}ms`,
                }}
                onClickCapture={(event) => { if (editing) { event.preventDefault(); event.stopPropagation(); } }}
                onClick={() => {
                  if (editing) return;
                  onSelect(id);
                  setPhase("idle");
                  setHighlighted(null);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerEnter={() => select(id)}
                onFocus={() => select(id)}
              >
                {registry[id]}
                {editing && (
                  <button
                    type="button"
                    className="radial-slot-grip"
                    aria-label={`Move ${TRIGGER_LABELS[id] ?? id}`}
                    title={`Drag to move ${TRIGGER_LABELS[id] ?? id}`}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      editDragRef.current = { pointerId: event.pointerId, id };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      const drag = editDragRef.current;
                      if (drag?.pointerId !== event.pointerId || drag.id !== id) return;
                      saveLayout({ ...layoutRef.current, [id]: clampRadialPoint(pointFromPointer(event.clientX, event.clientY)) });
                    }}
                    onPointerUp={(event) => {
                      if (!editDragRef.current || editDragRef.current.pointerId !== event.pointerId) return;
                      editDragRef.current = null;
                      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                    onPointerCancel={() => { editDragRef.current = null; }}
                  >
                    <GripVertical aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
          <div className="mobile-radial-wheel__hub">
            <button
              type="button"
              data-mosh-input
              onClick={() => {
                // While customizing layout, the hub is still the "DONE"
                // toggle it always was — mosh only takes over once editing
                // is off, so a mid-drag click can't fire an unrelated mosh.
                if (editing) {
                  setEditing(false);
                  updateLabel(highlightedRef.current ? (TRIGGER_LABELS[highlightedRef.current] ?? highlightedRef.current) : "MOSH");
                  return;
                }
                onMosh();
                setPhase("idle");
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setEditing(value => {
                  const next = !value;
                  updateLabel(next ? "DONE" : (highlightedRef.current ? (TRIGGER_LABELS[highlightedRef.current] ?? highlightedRef.current) : "MOSH"));
                  return next;
                });
              }}
              aria-pressed={editing}
              aria-label={editing ? "Done customizing layout" : "Mosh to the next FX stack — right-click to customize layout"}
            >
              <span ref={labelRef} className="mobile-radial-wheel__label">MOSH</span>
              <small>{editing ? "drag every icon" : (isRecording ? "REC" : "hold · steer · release")}</small>
            </button>
            {editing && <button type="button" className="radial-layout-reset" onClick={() => saveLayout({})}>reset</button>}
          </div>
        </div>
    </div>
  );
}

/**
 * Floating cluster of "moshing" cute icons over the visualizer.
 * The DOM overlay is outside <canvas>, so canvas.captureStream() never records these.
 */
export function HotTriggers({
  visualizerRef, hidden = false, showLegacyLaunchpad = false,
  isRecording, onToggleRecord, onScreenshot, onFreeze, onGif, onShare, onSupport, onAccount, gifBusy, gifProgress,
  onMicFlash, journeyOn, onToggleJourney, journeyLocked, journeyPreview, isFullscreen, onToggleFullscreen, onHome,
  onClearFx, hasFx, onSaveFavorite, showTrackNudge, onTrackNudgeDismiss,
}: Props) {
  const mosh = useStore(s => s.mosh);
  // Shared by the ring's own "mosh" slot AND both radial wheels' center
  // hub — releasing a hold without steering to any ring item now mosh'es
  // to the next FX stack directly, the same as this button always has.
  const triggerMosh = useCallback(() => crossfadeLayers(mosh, MOSH_FADE_MS), [mosh]);
  const undo = useStore(s => s.undo);
  const redo = useStore(s => s.redo);
  const canUndo = useStore(s => s.past.length > 0);
  const canRedo = useStore(s => s.future.length > 0);
  const shuffleSec = useStore(s => s.shuffleSec);
  const setShuffleSec = useStore(s => s.setShuffleSec);
  const sourceMode = useStore(s => s.sourceMode);
  const darkModeOn = useStore(s => s.darkModeOn);
  const toggleDarkMode = useStore(s => s.toggleDarkMode);

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

  // The legacy rail's up/down arrows. Attached here, when the rail actually
  // exists, rather than by a document-wide MutationObserver installed on every
  // page of the site waiting for it to appear.
  useEffect(() => { enhanceHotTriggerRail(railRef.current); }, [showLegacyLaunchpad]);
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
  const desktopCanvasAspect = useStore(s => s.desktopCanvasAspect);
  const cycleDesktopCanvasAspect = useStore(s => s.cycleDesktopCanvasAspect);

  const stickerMode = useStore(s => s.stickerMode);
  const setStickerMode = useStore(s => s.setStickerMode);
  const [forgePanelOpen, setForgePanelOpen] = useState(false);
  const [motifPanelOpen, setMotifPanelOpen] = useState(false);
  // The consolidated settings overlay — opened from the "account" trigger,
  // or (landing on its Export tab specifically) from the "export started"
  // toast any export path anywhere in the app can fire. Pro Mode, Help
  // Mode, sensitivity, export settings, and the VR/immersive override all
  // moved inside it; see AccountSettingsOverlay.tsx.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"general" | "export">("general");

  useEffect(() => {
    if (!forgePanelOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-forge-panel]")) return;
      setForgePanelOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [forgePanelOpen]);

  useEffect(() => {
    if (!motifPanelOpen) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest("[data-motif-panel]")) return;
      setMotifPanelOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [motifPanelOpen]);

  // Reachable from outside this component too — the "export started" toast
  // (fired by any export path, anywhere in the app) opens the settings
  // overlay straight to its Export tab when tapped, via the same
  // plain-window-event pattern useIdleFade's markUiActive() uses to cross
  // that same module boundary.
  useEffect(() => {
    const open = () => { setSettingsInitialTab("export"); setSettingsOpen(true); };
    window.addEventListener("mosh:open-export-settings", open);
    return () => window.removeEventListener("mosh:open-export-settings", open);
  }, []);


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
        <HomeBeaconIcon className="h-4 w-4" />
      </HotBtn>
    ),
    // The bridge between the two wheels. Everything that used to sit in the
    // menu rack below the fold is one tap from here, so a user who found this
    // wheel never has to discover the two-finger hold on their own.
    params: (
      <HotBtn
        key="params"
        delay={0}
        label="Parameters — layers, FX, tune, audio"
        onClick={() => window.dispatchEvent(new Event("mosh:toggle-param-wheel"))}
        tint="190 90% 60%"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "source-upload": (
      <HotBtn key="source-upload" delay={0} label="Upload source — hold for photo deck" active={sourceMode === "upload"} onClick={onUploadTap} onPointerDown={startUploadHold} onPointerUp={endUploadHold} onPointerCancel={endUploadHold} tint="326 90% 65%">
        <UploadBeamIcon className="h-4 w-4" />
      </HotBtn>
    ),
    "source-camera": (
      <HotBtn key="source-camera" delay={0} label="Live camera" active={sourceMode === "camera"} onClick={() => window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "camera" }))} tint="190 90% 62%">
        <LiveFeedIcon className="h-4 w-4" />
      </HotBtn>
    ),
    "source-forge": (
      <HotBtn key="source-forge" delay={0} label="Forge source" active={sourceMode === "forge"} onClick={() => window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "forge" }))} tint="24 94% 62%">
        <ForgeFlameIcon className="h-4 w-4" />
      </HotBtn>
    ),
    "source-motif": (
      <HotBtn key="source-motif" delay={0} label="Motif Maestro" active={sourceMode === "motif"} onClick={() => window.dispatchEvent(new CustomEvent("mosh:switch-mode", { detail: "motif" }))} tint="270 92% 72%">
        <MotifMandalaIcon className="h-4 w-4" />
      </HotBtn>
    ),
    // Opens the consolidated settings overlay now, instead of navigating
    // straight to the full account page — that page is still one click away
    // inside the overlay itself ("My Account"), for what genuinely needs its
    // own page (sign-in, subscription). See AccountSettingsOverlay.tsx.
    account: onAccount && (
      <HotBtn
        key="account"
        delay={0}
        label="Settings"
        // Always lands on General from here — only the export-started toast's
        // cross-module event should jump straight to the Export tab. Without
        // resetting this, opening Settings normally after that event fired
        // once would keep landing back on Export.
        onClick={() => { setSettingsInitialTab("general"); setSettingsOpen(true); }}
        tint="266 70% 75%"
      >
        <AccountCrystalIcon className="h-4 w-4" />
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
        <HotBtn delay={0} label="Mosh" onClick={triggerMosh} tint="12 90% 58%">
          <MoshVortexIcon className="h-4 w-4" />
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
    // Dark Mode — a finisher-level grade (see Renderer.ts) that crushes
    // low-color/bright content toward true black while boosting whatever
    // color survives, so the effect stack's neon reads against real black
    // instead of mid-grey ambient light. Independent of the FX stack: it
    // stays on across Mosh/undo/clear-fx like Journey does.
    "dark-mode": (
      <button
        key="dark-mode"
        type="button"
        onClick={toggleDarkMode}
        aria-label={darkModeOn ? "Dark Mode on" : "Dark Mode off"}
        aria-pressed={darkModeOn || undefined}
        title={darkModeOn ? "Dark Mode on — crushing light to black, pushing color to neon" : "Dark Mode — crush light to black, push color to neon"}
        data-active={darkModeOn || undefined}
        data-tint=""
        data-no-longpress
        className="hot-trigger relative"
        style={{ ["--ht-tint" as string]: "280 20% 55%" }}
      >
        <span className="hot-trigger__glitch" aria-hidden><Moon className="h-4 w-4" strokeWidth={1.5} /></span>
        <span className="hot-trigger__ico"><Moon className="h-4 w-4" strokeWidth={1.5} /></span>
        {darkModeOn && (
          <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-[hsl(var(--accent))]/60 animate-pulse" />
        )}
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
        <AudioTrigger delay={0} onMicFlash={onMicFlash} />
      </div>
    ),
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
    "sticker-mode": (
      <HotBtn
        key="sticker-mode"
        delay={0}
        label="Sticker Studio — isolate, cut, animate, import and open the Vault"
        active={stickerMode}
        onClick={() => setStickerMode(!stickerMode)}
        tint="96 55% 62%"
      >
        <Scissors className="h-4 w-4" strokeWidth={1.5} />
      </HotBtn>
    ),
    "theme-track": <TrackTrigger key="theme-track" delay={0} />,
    "forge-palette": sourceMode === "forge" && (
      <div key="forge-palette" className="relative" data-forge-panel>
        <HotBtn
          delay={0}
          label={forgePanelOpen ? "Close Forge palette and settings" : "Open Forge palette and settings"}
          active={forgePanelOpen}
          // Opens/closes a portal-rendered panel, not a one-shot action —
          // must not bubble into the ring-item wrapper's dismiss-on-click.
          onClick={(e) => { e.stopPropagation(); setForgePanelOpen(open => !open); }}
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
    "motif-maestro": sourceMode === "motif" && (
      <div key="motif-maestro" className="relative" data-motif-panel>
        <HotBtn
          delay={0}
          label={motifPanelOpen ? "Close Motif Maestro controls" : "Open Motif Maestro controls"}
          active={motifPanelOpen}
          // Same reasoning as forge-palette above — must not bubble into
          // the ring-item wrapper's dismiss-on-click.
          onClick={(e) => { e.stopPropagation(); setMotifPanelOpen(open => !open); }}
          tint="270 92% 72%"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
        </HotBtn>
        {motifPanelOpen && createPortal(
          <div className="fixed left-3 top-14 z-[90] safe-top safe-left" data-motif-panel>
            <MotifMaestroPanel embedded />
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
          // A tap opens the favorites popover, not a one-shot action — must
          // not bubble into the ring-item wrapper's dismiss-on-click.
          onClick={(e) => { e.stopPropagation(); onFavTap(); }}
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
        {favOpen && createPortal(
          <div
            ref={favPanelRef}
            data-fav-panel
            // Fixed to a corner instead of anchored to this trigger's own
            // ring slot (see forge-palette/motif-maestro for the same
            // pattern): the ring can place this trigger anywhere in a
            // circle nearly filling the viewport, and a slot in the lower
            // arc left most of this list rendered below the visible screen.
            className="fixed left-3 top-14 z-40 w-64 max-h-[70vh] overflow-y-auto rounded-md border border-white/10 bg-black/85 p-2 backdrop-blur-md panel-in-3d safe-top safe-left"
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
          </div>,
          document.body,
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
    // Desktop-only — cycle the same stage between the viewport, a fitted 9:16
    // portrait, and a fitted 1:1 square without spending another wheel slot.
    "desktop-portrait": !isTouchScreen && (
      <HotBtn
        key="desktop-portrait"
        delay={0}
        label={desktopCanvasAspect === "landscape"
          ? "Canvas: landscape — switch to portrait"
          : desktopCanvasAspect === "portrait"
            ? "Canvas: portrait — switch to square"
            : "Canvas: square — switch to landscape"}
        active={desktopCanvasAspect !== "landscape"}
        onClick={cycleDesktopCanvasAspect}
        tint="46 90% 62%"
      >
        {desktopCanvasAspect === "landscape"
          ? <RectangleVertical className="h-4 w-4" strokeWidth={1.5} />
          : desktopCanvasAspect === "portrait"
            ? <Square className="h-4 w-4" strokeWidth={1.5} />
            : <RectangleHorizontal className="h-4 w-4" strokeWidth={1.5} />}
      </HotBtn>
    ),
    // Was its own wheel trigger ("Support MOSH") — now the loud, animated
    // nudge inside the settings overlay instead. onSupport is passed
    // straight through to AccountSettingsOverlay below.
  };

  const availableIds = order.filter(id => !!registry[id]);
  const present = new Set(availableIds);
  // The two radial wheels never show "mosh" as a ring slot — their center
  // hub IS the mosh button now (see triggerMosh above). Still present in
  // `availableIds`/`registry` for the legacy flat rail and the hidden XR
  // registry, neither of which has a "center".
  const wheelIds = availableIds.filter(id => id !== "mosh");
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
  }, [showLegacyLaunchpad]);

  // Same reasoning as MicNudgeToast: this overlay is itself the way out of
  // Pro Mode (and everything else buried behind it), so it can't be nested
  // inside the branch that Pro Mode hides — toggling Pro Mode ON from
  // inside these settings would otherwise yank the settings overlay out
  // from under the user mid-click, along with the very toggle they just
  // used. Rendered the same way regardless of `hidden`.
  const settingsOverlay = onAccount && (
    <AccountSettingsOverlay
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      onMyAccount={onAccount}
      onSupport={onSupport}
      initialTab={settingsInitialTab}
    />
  );

  // Performance/immersive mode hides the DOM chrome, but Quest still needs the
  // live action registry. Keep one non-rendered copy mounted so the WebXR
  // wheel invokes these exact handlers instead of drifting into a second set
  // of trigger implementations.
  if (hidden) {
    return (
      <>
        <div hidden aria-hidden data-xr-hot-trigger-registry>
          {availableIds.map(id => <div key={id} data-trigger-id={id}>{registry[id]}</div>)}
        </div>
        {settingsOverlay}
      </>
    );
  }

  return (
    <>
    {isTouchScreen ? (
      <MobileRadialWheel
        ids={wheelIds}
        registry={registry}
        visualizerRef={visualizerRef}
        isRecording={isRecording}
        onSelect={setSelectedTriggerId}
        onMosh={triggerMosh}
      />
    ) : (
      <DesktopRadialWheel
        ids={wheelIds}
        registry={registry}
        visualizerRef={visualizerRef}
        isRecording={isRecording}
        onSelect={setSelectedTriggerId}
        onMosh={triggerMosh}
      />
    )}
    {settingsOverlay}
    {showTrackNudge && (
      <TrackNudgeToast
        onPlay={() => { runTrackAction(() => trackPlayer.shuffleShowcaseTrack()); onTrackNudgeDismiss?.(); }}
        onDismiss={() => onTrackNudgeDismiss?.()}
      />
    )}
    {showLegacyLaunchpad && (
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
        // The wheel's own ring-item wrapper now dismisses the whole wheel on
        // any click within it (so one-shot triggers close after picking) —
        // this button opens a length submenu instead of firing an action
        // directly, so its click must not bubble into that dismissal or the
        // submenu would never get a chance to show.
        onClick={(e) => { e.stopPropagation(); if (!gifBusy) setOpen(o => !o); }}
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

      {open && !gifBusy && createPortal(
        <div
          // Fixed to a corner instead of anchored to this trigger's own ring
          // slot (see forge-palette/motif-maestro for the same pattern) —
          // consistent with the other ring accessory panels even though
          // this one is small enough to rarely clip on its own.
          className="panel-in-3d fixed left-3 top-14 z-50 flex items-center gap-1 rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-1 backdrop-blur-md safe-top safe-left"
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
        </div>,
        document.body,
      )}
    </div>
  );
}
