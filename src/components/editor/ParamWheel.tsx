import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { haptic, hapticsAvailable } from "@/hooks/useHaptics";
import {
  angleDelta, hitSlot, HUB_RADIUS, pointerAngle, precisionForRadius, slotOffset, wheelSlots,
} from "@/lib/wheelGeometry";
import {
  breadcrumb, clampAnchor, formatScalar, pageSlice, scalarFraction, scalarFromFraction,
  wheelSizeFor, type WheelAnchor, type WheelItem,
} from "./paramWheelModel";
import { useParamWheelTree } from "./useParamWheelTree";
import "./paramWheel.css";

/** How long two still fingers must rest before the wheel commits. */
export const PARAM_WHEEL_HOLD_MS = 430;
/** An earlier beat that shows the wheel is coming, so the hold is never blind. */
export const PARAM_WHEEL_ARM_MS = 165;

const ROTATION_KEY = "cathedral_param_wheel_rotation_v1";
/** Outside this fraction of the diameter, a drag scrubs instead of rotating. */
const RIM_RADIUS = 0.52;
/** Degrees of rim sweep that cover a scalar's full range at coarse precision. */
const SWEEP_DEGREES = 240;

export function ParamWheel() {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [anchor, setAnchor] = useState<WheelAnchor>({ x: 0, y: 0 });
  const [nodeId, setNodeId] = useState("root");
  const [page, setPage] = useState(0);
  const [engagedKey, setEngagedKey] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [size, setSize] = useState(() =>
    typeof window === "undefined" ? 420 : wheelSizeFor(window.innerWidth, window.innerHeight));

  const rotationRef = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const rotationLoadedRef = useRef(false);
  if (!rotationLoadedRef.current) {
    rotationLoadedRef.current = true;
    try { rotationRef.current = Number(localStorage.getItem(ROTATION_KEY)) || 0; } catch { /* private mode */ }
  }

  const tree = useParamWheelTree(engagedKey);
  const node = tree[nodeId] ?? tree.root;
  const view = useMemo(() => pageSlice(node.items, page), [node.items, page]);

  /** Chevrons only exist when a node overflows one ring. */
  const items = useMemo<WheelItem[]>(() => {
    if (!view.paged) return view.items;
    return [
      { id: "__prev", label: "Previous page", glyph: "‹", action: () => setPage(p => p - 1) },
      ...view.items,
      { id: "__next", label: "Next page", glyph: "›", action: () => setPage(p => p + 1) },
    ];
  }, [view]);

  const slots = useMemo(
    () => wheelSlots(items.length, { rotationDeg: rotationRef.current }),
    // rotationRef is painted through CSS custom properties rather than state,
    // so layout only needs recomputing when the item count changes.
    [items.length],
  );

  const engaged = useMemo(() => {
    const found = items.find(item => item.id === highlight && item.scalar);
    return found?.scalar ? { item: found, scalar: found.scalar } : null;
  }, [items, highlight]);

  const close = useCallback(() => {
    setOpen(false);
    setArmed(false);
    setScrubbing(false);
    setHighlight(null);
    haptic("close");
  }, []);

  const goTo = useCallback((next: string) => {
    setNodeId(next);
    setPage(0);
    setHighlight(null);
    haptic("select");
  }, []);

  const goBack = useCallback(() => {
    const parent = tree[nodeId]?.parent;
    if (parent) goTo(parent);
    else close();
  }, [tree, nodeId, goTo, close]);

  // ── opening ────────────────────────────────────────────────────────────
  const openAt = useCallback((x: number, y: number) => {
    // Two wheels are never up at once — whichever opens second wins.
    window.dispatchEvent(new Event("mosh:close-hot-triggers"));
    const nextSize = wheelSizeFor(window.innerWidth, window.innerHeight);
    setSize(nextSize);
    setAnchor(clampAnchor(x, y, nextSize, window.innerWidth, window.innerHeight));
    setArmed(false);
    setOpen(true);
    haptic("open");
  }, []);

  useEffect(() => {
    useStore.getState().setParamWheelOpen(open);
  }, [open]);
  useEffect(() => () => useStore.getState().setParamWheelOpen(false), []);

  // Two-finger tap-and-hold on the art. The recognizer and its arbitration
  // live in Editor.tsx, which owns every canvas gesture; this component only
  // listens for the decision.
  useEffect(() => {
    const onArm = () => setArmed(true);
    const onDisarm = () => setArmed(false);
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<WheelAnchor | undefined>).detail;
      openAt(
        detail?.x ?? window.innerWidth / 2,
        detail?.y ?? window.innerHeight * 0.62,
      );
    };
    const onToggle = (event: Event) => {
      if (useStore.getState().paramWheelOpen) { close(); return; }
      onOpen(event);
    };
    window.addEventListener("mosh:arm-param-wheel", onArm);
    window.addEventListener("mosh:disarm-param-wheel", onDisarm);
    window.addEventListener("mosh:open-param-wheel", onOpen);
    window.addEventListener("mosh:toggle-param-wheel", onToggle);
    window.addEventListener("mosh:close-param-wheel", onDisarm);
    return () => {
      window.removeEventListener("mosh:arm-param-wheel", onArm);
      window.removeEventListener("mosh:disarm-param-wheel", onDisarm);
      window.removeEventListener("mosh:open-param-wheel", onOpen);
      window.removeEventListener("mosh:toggle-param-wheel", onToggle);
      window.removeEventListener("mosh:close-param-wheel", onDisarm);
    };
  }, [openAt, close]);

  useEffect(() => {
    if (!open) return;
    const onClose = () => close();
    window.addEventListener("mosh:close-param-wheel", onClose);
    return () => window.removeEventListener("mosh:close-param-wheel", onClose);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); goBack(); }
    };
    const onResize = () => {
      const nextSize = wheelSizeFor(window.innerWidth, window.innerHeight);
      setSize(nextSize);
      setAnchor(current => clampAnchor(current.x, current.y, nextSize, window.innerWidth, window.innerHeight));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [open, goBack]);

  // ── activation ─────────────────────────────────────────────────────────
  const activate = useCallback((item: WheelItem) => {
    if (item.disabled) { haptic("reject"); return; }
    if (item.branch) { goTo(item.branch); return; }
    if (item.action) {
      item.action();
      haptic("commit");
      // A parameter that can also be scrubbed stays under the rim after the
      // tap, so "pick it, then sweep" is one continuous move.
      if (item.scalar) setHighlight(item.id);
      return;
    }
    if (item.scalar) {
      setHighlight(current => (current === item.id ? null : item.id));
      if (nodeId === "tune") setEngagedKey(current => (current === item.id ? null : item.id));
      haptic("select");
    }
  }, [goTo, nodeId]);

  // ── rim / ring dragging ────────────────────────────────────────────────
  //
  // One pointer, two bands. Inside RIM_RADIUS the drag spins the ring, which
  // is a personal orientation preference and is remembered. Outside it, the
  // drag scrubs: the engaged scalar if there is one, otherwise the page. The
  // further out your finger, the finer the scrub — the same reason a big
  // knob is easier to set precisely than a small one.
  const dragRef = useRef<{
    pointerId: number;
    mode: "rotate" | "scrub" | "page";
    angle: number;
    rotation: number;
    fraction: number;
    pageFloat: number;
    moved: boolean;
  } | null>(null);
  const pendingRef = useRef<{ scalar: WheelItem["scalar"]; fraction: number } | null>(null);
  const frameRef = useRef(0);

  const paintRotation = (next: number) => {
    rotationRef.current = next;
    wheelRef.current?.style.setProperty("--param-wheel-rotation", `${next}deg`);
    wheelRef.current?.style.setProperty("--param-wheel-counter", `${-next}deg`);
  };

  /** Store writes are coalesced to one per frame — a scrub emits far more
   *  pointermove events than the renderer can use, and each write re-renders
   *  every layer subscriber. */
  const flushScrub = () => {
    frameRef.current = 0;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending?.scalar) return;
    pending.scalar.set(scalarFromFraction(pending.scalar, pending.fraction));
  };
  const queueScrub = (scalar: WheelItem["scalar"], fraction: number) => {
    pendingRef.current = { scalar, fraction };
    if (!frameRef.current) frameRef.current = requestAnimationFrame(flushScrub);
  };
  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  const localPoint = (clientX: number, clientY: number) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (!rect) return { nx: 0, ny: 0, radius: 0, angle: 0 };
    const nx = (clientX - rect.left - rect.width / 2) / rect.width;
    const ny = (clientY - rect.top - rect.height / 2) / rect.height;
    return { nx, ny, radius: Math.hypot(nx, ny), angle: pointerAngle(nx, ny) };
  };

  const onSurfacePointerDown = (event: React.PointerEvent) => {
    if (event.target instanceof Element && event.target.closest("[data-wheel-slot], [data-wheel-hub]")) return;
    const { radius, angle } = localPoint(event.clientX, event.clientY);
    if (radius < HUB_RADIUS) return;
    const rim = radius >= RIM_RADIUS;
    const mode = rim ? (engaged ? "scrub" : "page") : "rotate";
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      angle,
      rotation: rotationRef.current,
      fraction: engaged ? scalarFraction(engaged.scalar) : 0,
      pageFloat: view.page,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (mode === "scrub") setScrubbing(true);
  };

  const onSurfacePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (event.pointerType === "mouse") previewAt(event.clientX, event.clientY);
      return;
    }
    const { radius, angle } = localPoint(event.clientX, event.clientY);
    const delta = angleDelta(drag.angle, angle);
    drag.angle = angle;
    if (Math.abs(delta) > 0.4) drag.moved = true;

    if (drag.mode === "rotate") {
      paintRotation(rotationRef.current + delta);
      previewAt(event.clientX, event.clientY);
      return;
    }
    if (drag.mode === "scrub" && engaged) {
      const step = (delta / SWEEP_DEGREES) * precisionForRadius(radius);
      const next = Math.min(1, Math.max(0, drag.fraction + step));
      if ((next === 0 || next === 1) && next !== drag.fraction) haptic("limit");
      drag.fraction = next;
      queueScrub(engaged.scalar, next);
      return;
    }
    if (drag.mode === "page" && view.paged) {
      drag.pageFloat += delta / 90;
      const target = Math.round(drag.pageFloat);
      if (target !== view.page) { setPage(target); haptic("step"); }
    }
  };

  const endSurfaceDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setScrubbing(false);
    if (drag.mode === "rotate") {
      try { localStorage.setItem(ROTATION_KEY, String(rotationRef.current)); } catch { /* private mode */ }
    }
    // A rim press that never moved is a tap on empty space — dismiss, the way
    // tapping outside any other overlay does.
    if (!drag.moved && drag.mode !== "scrub") close();
  };

  /** Mouse hover / drag-over preview, so the wheel is steerable as well as tappable. */
  const previewAt = (clientX: number, clientY: number) => {
    const { nx, ny } = localPoint(clientX, clientY);
    const index = hitSlot(nx, ny, slots);
    const item = index >= 0 ? items[index] : null;
    if (!item || item.id.startsWith("__")) return;
    setHighlight(current => {
      if (current === item.id) return current;
      haptic("step");
      return item.id;
    });
  };

  // ── slot long-press: the secondary action (reset / delete) ─────────────
  const holdRef = useRef<{ id: string; timer: number; fired: boolean } | null>(null);
  const startSlotHold = (item: WheelItem) => {
    if (!item.scalar?.reset) return;
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
    holdRef.current = {
      id: item.id, fired: false,
      timer: window.setTimeout(() => {
        if (!holdRef.current) return;
        holdRef.current.fired = true;
        item.scalar?.reset?.();
        haptic("limit");
      }, 480),
    };
  };
  const endSlotHold = () => {
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
  };
  const slotHoldFired = (id: string) => holdRef.current?.id === id && holdRef.current.fired;
  useEffect(() => () => { if (holdRef.current) window.clearTimeout(holdRef.current.timer); }, []);

  const trail = useMemo(() => breadcrumb(tree, nodeId), [tree, nodeId]);
  const hubValue = engaged ? formatScalar(engaged.scalar) : null;
  const hubLabel = engaged
    ? engaged.item.label
    : highlight
      ? items.find(item => item.id === highlight)?.label ?? node.title
      : node.title;

  if (!open && !armed) return null;

  return (
    <div
      className="param-wheel-layer"
      data-phase={open ? "open" : "armed"}
      data-scrubbing={scrubbing || undefined}
      data-silent={hapticsAvailable() ? undefined : "true"}
    >
      <button
        type="button"
        className="param-wheel-layer__backdrop"
        aria-label="Close parameter wheel"
        onClick={close}
        data-no-longpress
      />
      <div
        ref={wheelRef}
        className="param-wheel"
        role="menu"
        aria-label={`Parameters — ${node.title}`}
        data-no-longpress
        style={{
          left: `${anchor.x}px`,
          top: `${anchor.y}px`,
          ["--param-wheel-size" as string]: `${size}px`,
          ["--param-wheel-rotation" as string]: `${rotationRef.current}deg`,
          ["--param-wheel-counter" as string]: `${-rotationRef.current}deg`,
        }}
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={endSurfaceDrag}
        onPointerCancel={endSurfaceDrag}
      >
        <WheelDial
          fraction={engaged ? scalarFraction(engaged.scalar) : null}
          pages={view.pages}
          page={view.page}
        />

        {items.map((item, index) => {
          const slot = slots[index];
          if (!slot) return null;
          const offset = slotOffset(slot);
          const isHighlighted = highlight === item.id;
          return (
            <div
              key={item.id}
              className="param-wheel__slot"
              data-wheel-slot
              data-highlighted={isHighlighted || undefined}
              data-active={item.active || undefined}
              data-tone={item.tone}
              data-disabled={item.disabled || undefined}
              style={{
                ["--slot-x" as string]: String(offset.x),
                ["--slot-y" as string]: String(offset.y),
                ["--slot-index" as string]: String(index),
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="param-wheel__button"
                aria-label={item.detail ? `${item.label} — ${item.detail}` : item.label}
                aria-disabled={item.disabled || undefined}
                title={item.label}
                onPointerDown={(event) => { event.stopPropagation(); startSlotHold(item); }}
                onPointerUp={endSlotHold}
                onPointerLeave={endSlotHold}
                onPointerCancel={endSlotHold}
                onFocus={() => setHighlight(item.id)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (slotHoldFired(item.id)) return;
                  activate(item);
                }}
              >
                <span className="param-wheel__glyph">{item.glyph ?? item.label.slice(0, 3)}</span>
                {item.scalar && (
                  <span
                    className="param-wheel__fill"
                    style={{ ["--fill" as string]: String(scalarFraction(item.scalar)) }}
                    aria-hidden
                  />
                )}
              </button>
              <span className="param-wheel__caption" aria-hidden>{item.label}</span>
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="param-wheel__empty">{node.subtitle ?? "Nothing here yet"}</p>
        )}

        <button
          type="button"
          data-wheel-hub
          className="param-wheel__hub"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={goBack}
          aria-label={node.parent ? `Back to ${tree[node.parent]?.title ?? "menu"}` : "Close parameter wheel"}
        >
          <span className="param-wheel__trail" aria-hidden>
            {trail.length > 1 ? trail.slice(0, -1).map(step => step.title).join(" › ") : "PARAMS"}
          </span>
          <span className="param-wheel__title">{hubLabel}</span>
          {hubValue !== null
            ? <span className="param-wheel__value">{hubValue}</span>
            : <span className="param-wheel__hint">{node.subtitle ?? (node.parent ? "tap centre to go back" : "tap centre to close")}</span>}
          {view.paged && <span className="param-wheel__page" aria-hidden>{view.page + 1} / {view.pages}</span>}
        </button>
      </div>
    </div>
  );
}

/**
 * Rings, tick marks and the rim arc, as one SVG. Drawn rather than composed
 * from bordered elements so the whole dial is a single composited layer over
 * the live canvas — the rim arc updates by stroke-dashoffset, which does not
 * trigger layout.
 */
function WheelDial({ fraction, pages, page }: { fraction: number | null; pages: number; page: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const sweep = SWEEP_DEGREES / 360;
  return (
    <svg className="param-wheel__dial" viewBox="0 0 100 100" aria-hidden focusable="false">
      <circle className="param-wheel__ring param-wheel__ring--outer" cx="50" cy="50" r={radius} />
      <circle className="param-wheel__ring param-wheel__ring--inner" cx="50" cy="50" r="29" />
      <circle className="param-wheel__ring param-wheel__ring--hub" cx="50" cy="50" r={HUB_RADIUS * 100} />
      {fraction !== null && (
        <>
          <circle
            className="param-wheel__arc param-wheel__arc--track"
            cx="50" cy="50" r={radius}
            strokeDasharray={`${circumference * sweep} ${circumference}`}
            transform={`rotate(${-90 - SWEEP_DEGREES / 2} 50 50)`}
          />
          <circle
            className="param-wheel__arc param-wheel__arc--fill"
            cx="50" cy="50" r={radius}
            strokeDasharray={`${circumference * sweep * fraction} ${circumference}`}
            transform={`rotate(${-90 - SWEEP_DEGREES / 2} 50 50)`}
          />
        </>
      )}
      {pages > 1 && Array.from({ length: pages }, (_, index) => {
        const angle = (index / pages) * Math.PI * 2 - Math.PI / 2;
        return (
          <circle
            key={index}
            className="param-wheel__pip"
            data-on={index === page || undefined}
            cx={50 + Math.cos(angle) * 22}
            cy={50 + Math.sin(angle) * 22}
            r="1.4"
          />
        );
      })}
    </svg>
  );
}
