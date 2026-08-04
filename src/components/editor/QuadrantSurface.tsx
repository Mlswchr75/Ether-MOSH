/**
 * QuadrantSurface — the canvas as a four-voice visual instrument.
 *
 * Replaces "tap anywhere to mosh" with a Kaoss-pad style surface:
 *
 *   TAP a quadrant   → re-rolls only that quadrant's effect, biased somewhere
 *                      on the similar↔incompatible axis against the other three.
 *   DRAG a quadrant  → invisible XY pad. Horizontal sweeps the effect's primary
 *                      param, vertical its secondary (up = more). The values
 *                      written are the same ones the Tune menu below the
 *                      visualizer edits, so the sliders track the finger.
 *   TAP + HOLD       → latches the pad: the readout stays up while you work.
 *
 * Nothing is painted over the canvas except a brief readout and the quadrant
 * guides, and both live outside <canvas> so captureStream() never records them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { useKaossStore } from "@/store/kaossStore";
import { EFFECTS_BY_ID } from "@/engine/effects";
import {
  QUADRANT_SHORT,
  applyAxisDelta,
  axisTargets,
  quadrantAt,
  type AxisTarget,
  type QuadrantIndex,
} from "@/engine/quadrants";

/** Movement past this fraction of a quadrant switches a tap into a drag. */
const DRAG_THRESHOLD = 0.06;
/** A press shorter than this with no drag counts as a tap. */
const TAP_MS = 320;
/** How long the readout lingers after the finger lifts. */
const READOUT_LINGER_MS = 1100;
/** Pinch out past this ratio enters Performance Mode; its inverse exits. */
const PINCH_RATIO = 1.25;

type Drag = {
  pointerId: number;
  quadrant: QuadrantIndex;
  /**
   * Start position in FULL-CANVAS space, 0..1 — not quadrant-local. Deltas
   * measured here stay continuous when a finger crosses a midline; re-deriving
   * quadrant-local coords mid-drag would make the value jump.
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
  quadrant: QuadrantIndex;
  effectName: string;
  xLabel: string; xValue: number;
  yLabel: string; yValue: number;
  /** Set for a re-roll rather than a param sweep. */
  relation?: string;
  at: number;
};

type Props = {
  /** Fires on a tap that lands in a quadrant, after the roll. */
  onRoll?: (q: QuadrantIndex) => void;
  /** Two-finger pinch — kept here so a single surface owns every canvas gesture. */
  onTogglePerf?: () => void;
};

export function QuadrantSurface({ onRoll, onTogglePerf }: Props) {
  const kaossOn = useKaossStore(s => s.instrumentEnabled);
  const showBeforeAfter = useStore(s => s.showBeforeAfter);
  const isolationMode = useStore(s => s.isolationMode);
  const stickerMode = useStore(s => s.stickerMode);
  const layers = useStore(s => s.layers);
  const moshQuadrant = useStore(s => s.moshQuadrant);

  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [activeQuadrant, setActiveQuadrant] = useState<QuadrantIndex | null>(null);
  const readoutTimer = useRef<number | null>(null);

  // Live pointers, so a second finger can be recognised as a pinch rather than
  // being mistaken for a second quadrant gesture.
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

    // A second finger turns the gesture into a pinch — abandon any quadrant
    // drag in progress so a two-finger zoom never sweeps a parameter.
    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      setActiveQuadrant(null);
      pinchBaseRef.current = pinchDistance();
      pinchFiredRef.current = false;
      e.preventDefault();
      return;
    }

    const { x, y } = norm(e);
    const q = quadrantAt(x, y);
    const layer = useStore.getState().layers[q];

    setActiveQuadrant(q);

    // An empty or locked quadrant has no pad to drive — the lift still rolls it.
    const targets = layer ? axisTargets(layer.effectId) : null;
    dragRef.current = {
      pointerId: e.pointerId,
      quadrant: q,
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
    // Canvas-space delta, doubled so one quadrant's width of travel (0.5 of the
    // canvas) sweeps a full parameter range. Continuous across the midlines, so
    // a finger that strays out of its quadrant keeps driving the same voice.
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
      quadrant: d.quadrant,
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
    setActiveQuadrant(null);

    // The lift that ends a pinch must not also re-roll a quadrant.
    if (wasPinch) return;

    const heldFor = performance.now() - d.startedAt;
    // A drag has already done its work; only a clean tap re-rolls.
    if (d.moved || heldFor >= TAP_MS) return;

    const roll = moshQuadrant(d.quadrant);
    if (!roll) {
      // Locked layer — say so rather than looking broken.
      const layer = useStore.getState().layers[d.quadrant];
      if (layer?.locked) {
        showReadout({
          quadrant: d.quadrant,
          effectName: effectNameOf(layer.effectId),
          xLabel: "", xValue: 0, yLabel: "", yValue: 0,
          relation: "locked",
          at: performance.now(),
        });
      }
      return;
    }

    showReadout({
      quadrant: roll.quadrant,
      effectName: roll.effectName,
      xLabel: "", xValue: 0, yLabel: "", yValue: 0,
      relation: roll.relation,
      at: performance.now(),
    });
    onRoll?.(roll.quadrant);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchBaseRef.current = null;
    if (pointersRef.current.size === 0) pinchFiredRef.current = false;
    const d = dragRef.current;
    if (d && d.pointerId === e.pointerId) dragRef.current = null;
    setActiveQuadrant(null);
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
      aria-label="Quadrant instrument — tap a quadrant to re-roll it, drag to sweep its parameters"
    >
      <QuadrantGuides active={activeQuadrant} layers={layers} />
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

/**
 * Faint quadrant guides. Idle they're barely there; the quadrant under the
 * finger lights up so the mapping is learnable without a tutorial.
 */
function QuadrantGuides({ active, layers }: { active: QuadrantIndex | null; layers: ReturnType<typeof useStore.getState>["layers"] }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* Cross-hair split */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.07]" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.07]" />
      {([0, 1, 2, 3] as QuadrantIndex[]).map(q => {
        const filled = !!layers[q];
        const isActive = active === q;
        return (
          <div
            key={q}
            className="absolute h-1/2 w-1/2 transition-all duration-200"
            style={{
              left: q % 2 === 0 ? 0 : "50%",
              top: q < 2 ? 0 : "50%",
              boxShadow: isActive ? "inset 0 0 0 1px hsl(var(--accent) / 0.5)" : "none",
              background: isActive ? "hsl(var(--accent) / 0.05)" : "transparent",
            }}
          >
            <span
              className="absolute font-mono text-[9px] uppercase tracking-[0.2em] transition-opacity duration-200"
              style={{
                // Tuck each badge into the quadrant's outer corner.
                left: q % 2 === 0 ? "0.6rem" : "auto",
                right: q % 2 === 0 ? "auto" : "0.6rem",
                top: q < 2 ? "0.6rem" : "auto",
                bottom: q < 2 ? "auto" : "0.6rem",
                color: isActive ? "hsl(var(--accent))" : filled ? "hsl(0 0% 100% / 0.22)" : "hsl(0 0% 100% / 0.1)",
                opacity: isActive ? 1 : 0.75,
              }}
            >
              {QUADRANT_SHORT[q]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Kaoss-style LED readout — what you just did, in one line. */
function QuadrantReadout({ r }: { r: Readout }) {
  return (
    <div data-quadrant-readout className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex items-center gap-2 whitespace-nowrap rounded-sm border border-white/10 bg-black/70 px-2.5 py-1 backdrop-blur-md">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--accent))]">
          {QUADRANT_SHORT[r.quadrant]}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/85">
          {r.effectName}
        </span>
        {r.relation ? (
          <>
            <span className="font-mono text-[9px] text-white/30">/</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/60">
              {r.relation}
            </span>
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
      </div>
    </div>
  );
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}
