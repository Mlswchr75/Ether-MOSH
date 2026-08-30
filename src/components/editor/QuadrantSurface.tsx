/**
 * QuadrantSurface — the canvas as a semantic-role visual instrument.
 *
 * Tapping deliberately has no geography. An earlier version mapped each corner
 * to one layer, which put a decision in front of the gesture that used to be
 * pure play: you had to know the map, and aim, before anything happened. Now
 * position only matters once you are already dragging, where it is continuous
 * and self-evident:
 *
 *   TAP anywhere  → re-rolls the NEXT role in rotation (grade → form → accent
 *                   → finish), so repeated taps evolve the look a part at a
 *                   time instead of replacing it wholesale. Locked roles are
 *                   skipped, which is how you steer: keep what you like, keep
 *                   tapping, and the rest rearranges around it.
 *   DRAG anywhere → invisible XY pad over the selected layer. Horizontal
 *                   sweeps its primary param, vertical its secondary (up =
 *                   more). The values written are the same ones the Tune menu
 *                   edits, so the sliders track the finger.
 *
 * A full re-roll is deliberately NOT bound here. The MOSH button is already the
 * obvious affordance for it, and the editor owns a 750ms canvas hold for the
 * menu rack — putting a second hold on this surface would fire both.
 *
 * Nothing is painted over the canvas except a brief readout and the role rail,
 * and both live outside <canvas> so captureStream() never records them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useKaossStore } from "@/store/kaossStore";
import { EFFECTS_BY_ID } from "@/engine/effects";
import type { Role } from "@/engine/artDirector";
import { ROLE_COPY, groupLayersByRole, resolveLayerRole } from "@/engine/effectRoles";
import { crossfadeLayers, MOSH_FADE_MS } from "@/engine/layerCrossfade";
import {
  applyAxisDelta,
  axisTargets,
  type AxisTarget,
} from "@/engine/quadrants";

/** Movement past this fraction of the canvas switches a tap into a drag. */
const DRAG_THRESHOLD = 0.06;
/**
 * A press longer than this is not a tap. The editor binds its own 750ms hold on
 * the canvas (the menu rack), so the bound has to sit below that or lifting out
 * of a rack hold would also roll a role.
 */
const TAP_MS = 400;
/** How long the readout lingers after the finger lifts. */
const READOUT_LINGER_MS = 1100;
/** Pinch out past this ratio enters Performance Mode; its inverse exits. */
const PINCH_RATIO = 1.25;

type Drag = {
  pointerId: number;
  role?: Role;
  /**
   * Start position in full-canvas space, 0..1. Deltas measured here stay
   * continuous when a finger crosses a midline.
   */
  startX: number;
  startY: number;
  startedAt: number;
  layerId: string;
  /** Param values when the finger landed — deltas apply on top of these. */
  baseX: number;
  baseY: number;
  targets: { x: AxisTarget; y: AxisTarget };
  moved: boolean;
};

type Readout = {
  role?: Role;
  effectName: string;
  xLabel: string; xValue: number;
  yLabel: string; yValue: number;
  /** Set for a re-roll rather than a param sweep. */
  relation?: string;
  /** The art direction the stack is composed under. */
  look?: string;
  /** Plain-language feedback for a gesture with no layer target. */
  message?: string;
  at: number;
};

type Props = {
  /** Two-finger pinch — kept here so a single surface owns every canvas gesture. */
  onTogglePerf?: () => void;
  /** Opens the existing Tune panel for the chosen effect layer. */
  onTune?: (layerId: string) => void;
};

export function QuadrantSurface({ onTogglePerf, onTune = () => {} }: Props) {
  const kaossOn = useKaossStore(s => s.instrumentEnabled);
  const showBeforeAfter = useStore(s => s.showBeforeAfter);
  const isolationMode = useStore(s => s.isolationMode);
  const stickerMode = useStore(s => s.stickerMode);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const readoutTimer = useRef<number | null>(null);

  // Live pointers, so a second finger can be recognised as a pinch rather than
  // being mistaken for a second role gesture.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchBaseRef = useRef<number | null>(null);
  const pinchFiredRef = useRef(false);

  const pinchDistance = () => {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  };

  // The surface stands down whenever another interaction layer owns the canvas.
  const active = !kaossOn && !showBeforeAfter && isolationMode !== "tap" && !stickerMode;

  const showReadout = useCallback((r: Readout) => {
    setReadout(r);
    if (readoutTimer.current) window.clearTimeout(readoutTimer.current);
    readoutTimer.current = window.setTimeout(() => setReadout(null), READOUT_LINGER_MS);
  }, []);

  useEffect(() => () => {
    if (readoutTimer.current) window.clearTimeout(readoutTimer.current);
  }, []);

  /**
   * Resolve the layer a drag drives without treating stack position as meaning.
   * A chip selection is exact; otherwise use the remembered layer for the open
   * role, then the first unlocked layer for the role cursor.
   */
  const activeLayer = () => {
    const s = useStore.getState();
    const selected = s.selectedLayerId
      ? s.layers.find(layer => layer.id === s.selectedLayerId)
      : undefined;
    if (selected) {
      return { layer: selected, role: resolveLayerRole(selected, s.layers.indexOf(selected)) };
    }

    const rememberedRole = s.selectedRole ?? s.roleCursor;
    const rememberedId = s.selectedRoleLayers[rememberedRole];
    const remembered = rememberedId
      ? s.layers.find(layer => layer.id === rememberedId)
      : undefined;
    if (remembered) return { layer: remembered, role: rememberedRole };

    const fallback = groupLayersByRole(s.layers)[s.roleCursor].find(layer => !layer.locked);
    return fallback ? { layer: fallback, role: s.roleCursor } : null;
  };

  const norm = (e: React.PointerEvent | PointerEvent) => {
    const el = wrapRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    // Modifier gestures belong to the editor's own shortcuts.
    if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // A second finger turns the gesture into a pinch — abandon any role
    // drag in progress so a two-finger zoom never sweeps a parameter.
    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      pinchBaseRef.current = pinchDistance();
      pinchFiredRef.current = false;
      e.preventDefault();
      return;
    }

    const { x, y } = norm(e);
    // A drag sculpts the selected semantic layer, wherever the finger landed.
    const target = activeLayer();
    const layer = target?.layer;

    // An empty or locked role has no pad to drive — the lift still rolls.
    const targets = layer ? axisTargets(layer.effectId) : null;
    dragRef.current = {
      pointerId: e.pointerId,
      role: target?.role,
      startX: x,
      startY: y,
      startedAt: performance.now(),
      layerId: layer?.id ?? "",
      baseX: layer && targets?.x.key ? (layer.params[targets.x.key] ?? 0) : 0,
      baseY: layer ? (targets?.y.key ? (layer.params[targets.y.key] ?? 0) : layer.opacity) : 0,
      targets: targets ?? { x: nullTarget(), y: nullTarget() },
      moved: false,
    };

    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const tracked = pointersRef.current.get(e.pointerId);
    if (tracked) { tracked.x = e.clientX; tracked.y = e.clientY; }

    // Pinch takes priority while two fingers are down.
    if (pointersRef.current.size >= 2) {
      const base = pinchBaseRef.current;
      if (base && !pinchFiredRef.current) {
        const ratio = pinchDistance() / base;
        if (ratio >= PINCH_RATIO || ratio <= 1 / PINCH_RATIO) {
          pinchFiredRef.current = true;
          const wantFullscreen = ratio >= PINCH_RATIO;
          if (wantFullscreen !== useStore.getState().isPerformanceMode) onTogglePerf?.();
        }
      }
      e.preventDefault();
      return;
    }

    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;

    const { x, y } = norm(e);
    // Canvas-space delta, doubled so half the canvas's width of travel sweeps a
    // full parameter range. Continuous across midlines, so the selected layer
    // stays stable wherever the finger travels.
    const dx = (x - d.startX) * 2;
    const dy = (y - d.startY) * 2;

    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    d.moved = true;

    const layer = useStore.getState().layers.find(l => l.id === d.layerId);
    if (!layer || layer.locked || !d.targets.x.label) return;

    const store = useStore.getState();
    // Screen Y grows downward; up should mean more.
    const nextX = applyAxisDelta(d.targets.x, d.baseX, dx);
    const nextY = applyAxisDelta(d.targets.y, d.baseY, -dy);

    if (d.targets.x.key) store.setParam(layer.id, d.targets.x.key, nextX);
    if (d.targets.y.key) store.setParam(layer.id, d.targets.y.key, nextY);
    else store.setOpacity(layer.id, nextY);

    showReadout({
      role: d.role,
      effectName: effectNameOf(layer.effectId),
      xLabel: d.targets.x.label, xValue: nextX,
      yLabel: d.targets.y.label, yValue: nextY,
      at: performance.now(),
    });
    e.preventDefault();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchBaseRef.current = null;

    // Clear pinch state as soon as the last finger leaves — and before the
    // no-drag bail-out below, otherwise a pinch (which nulls dragRef) would
    // leave the flag set and swallow the next genuine tap.
    const wasPinch = pinchFiredRef.current;
    if (pointersRef.current.size === 0) pinchFiredRef.current = false;

    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;

    // The lift that ends a pinch must not also re-roll.
    if (wasPinch) return;

    // A drag has already done its work; only a clean tap re-rolls, and a press
    // long enough to belong to the menu-rack hold is not a tap.
    if (d.moved || performance.now() - d.startedAt >= TAP_MS) return;

    // A plain tap re-rolls the whole stack, same as the Mosh button, Shift+M,
    // and desktop double-click — one consistent "moshs the fx stack" gesture
    // everywhere instead of a partial single-role reroll only tap owned.
    crossfadeLayers(() => useStore.getState().mosh(), MOSH_FADE_MS);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchBaseRef.current = null;
    if (pointersRef.current.size === 0) pinchFiredRef.current = false;
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) dragRef.current = null;
  };

  if (!active) return null;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-20 select-none touch-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="Visual instrument — tap to re-roll the next role, hold to re-roll everything, drag to sweep the selected role's parameters"
    >
      {readout && <QuadrantReadout r={readout} />}
    </div>
  );
}

function nullTarget(): AxisTarget {
  return { key: null, label: "", min: 0, max: 1 };
}

function effectNameOf(id: string): string {
  return EFFECTS_BY_ID[id]?.name ?? id;
}

/* ────────────────────────────────────────────────────────────────────────
   Overlays
   ────────────────────────────────────────────────────────────────────── */

/** Kaoss-style LED readout — what you just did, in one line. */
function QuadrantReadout({ r }: { r: Readout }) {
  return (
    <div data-role-readout className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-sm border border-white/10 bg-black/70 px-2.5 py-1 backdrop-blur-md">
        {r.message ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/70">{r.message}</span>
        ) : (
          <>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">
              {r.role ? ROLE_COPY[r.role].label : "ROLE"}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/85">
              {r.effectName}
            </span>
            {r.relation ? (
              <>
                <span className="font-mono text-[9px] text-white/30">·</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
                  {r.relation}
                </span>
                {r.look && (
                  <>
                    <span className="font-mono text-[9px] text-white/30">·</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--accent))]/80">
                      {r.look}
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="font-mono text-[9px] text-white/30">/</span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/60">
                  {r.xLabel} {fmt(r.xValue)}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/60">
                  {r.yLabel} {fmt(r.yValue)}
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}
