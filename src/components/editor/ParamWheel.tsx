import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import { haptic, hapticsAvailable } from "@/hooks/useHaptics";
import {
  angleDelta, hitSlot, HUB_RADIUS, pointerAngle, precisionForRadius, slotOffset,
  slotsForCounts, unrotatePoint, wheelSlots, type WheelSlot,
} from "@/lib/wheelGeometry";
import {
  BROWSER_PAGE_SIZE, breadcrumb, clampAnchor, formatScalar, pageSlice, scalarFraction,
  scalarFromFraction, wheelSizeFor, type WheelAnchor, type WheelItem,
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

/**
 * The browser layout's two rings. The outer one carries the catalogue, where
 * the circumference is greatest; the inner one carries the selected entry's
 * own controls, which are few. Both stay clear of the hub, which grows in
 * this layout to hold the back and commit buttons.
 */
const BROWSER_RADII = [0.435, 0.285];

/**
 * How far a dot's arc sweeps for a value's full range: tight when it is just
 * a read-out sitting beside its slot, wide while a finger is actually
 * dragging it. Resting arcs have to fit between neighbours on a 14-slot ring
 * (~26 degrees apart); a dragging arc only has to be comfortable to sweep,
 * and everything else is dimmed under it anyway.
 */
const DOT_ARC_IDLE = 24;
const DOT_ARC_DRAG = 72;
/**
 * Radial offset of a dot from the slot it belongs to, in normalized space.
 * Far enough that it clears the slot's own button — the widest of which is
 * ~13% of the diameter, so ~6.6% from centre to edge — and the dot lands
 * outside it rather than on its rim.
 */
const DOT_OFFSET = 0.085;
/** Long-press on a browser entry keeps it, without a trip to the hub. */
const COMMIT_HOLD_MS = 500;

export function ParamWheel() {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [anchor, setAnchor] = useState<WheelAnchor>({ x: 0, y: 0 });
  const [nodeId, setNodeId] = useState("root");
  const [page, setPage] = useState(0);
  const [engagedKey, setEngagedKey] = useState<string | null>(null);
  // Focus and engagement are two different things, and conflating them was a
  // bug in both directions: merely hovering a parameter armed the rim
  // scrubber, and pressing Enter on an already-focused parameter *dis*engaged
  // it. `highlight` is where attention is; `engagedId` is what the rim is
  // wired to.
  const [highlight, setHighlight] = useState<string | null>(null);
  const [engagedId, setEngagedId] = useState<string | null>(null);
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
  const browsing = node.layout === "browser";
  const view = useMemo(
    () => pageSlice(node.items, page, browsing ? BROWSER_PAGE_SIZE : undefined),
    [node.items, page, browsing],
  );

  /** Chevrons only exist when a node overflows its ring. */
  const outerItems = useMemo<WheelItem[]>(() => {
    if (!view.paged) return view.items;
    return [
      { id: "__prev", label: "Previous page", glyph: "‹", action: () => setPage(p => p - 1) },
      ...view.items,
      { id: "__next", label: "Next page", glyph: "›", action: () => setPage(p => p + 1) },
    ];
  }, [view]);

  const innerItems = useMemo<WheelItem[]>(() => (browsing ? node.inner ?? [] : []), [browsing, node.inner]);

  /**
   * One flat list, outer ring first, so a single index addresses any slot and
   * the hit-test needs no idea which ring it landed on.
   */
  const items = useMemo(() => [...outerItems, ...innerItems], [outerItems, innerItems]);

  // Built unrotated, deliberately. The ring's rotation is applied once, in
  // CSS, on the container — baking it in here too would apply it twice, and
  // rebuilding this on every frame of a spin would be wasted work besides.
  // Pointer positions are rotated back before hit-testing instead.
  const slots = useMemo<WheelSlot[]>(() => (
    browsing
      ? slotsForCounts([outerItems.length, innerItems.length], BROWSER_RADII)
      : wheelSlots(outerItems.length)
  ), [browsing, outerItems.length, innerItems.length]);

  const engaged = useMemo(() => {
    const found = items.find(item => item.id === engagedId && item.scalar);
    return found?.scalar ? { item: found, scalar: found.scalar } : null;
  }, [items, engagedId]);

  /**
   * The slot that currently shows a draggable dot: whatever is engaged, else
   * whatever is highlighted, provided it has a value to drag. Only one at a
   * time — a dot on every slot would be a ring of confetti, and the user only
   * ever has one finger's worth of attention anyway.
   */
  const dotIndex = useMemo(() => {
    const id = engagedId ?? highlight;
    if (!id) return -1;
    const index = items.findIndex(item => item.id === id);
    return index >= 0 && items[index].scalar ? index : -1;
  }, [items, engagedId, highlight]);

  /** An audition the user walked away from is an audition they declined. */
  const dropAudition = useCallback(() => {
    if (useStore.getState().previewLayerId) useStore.getState().discardPreview();
  }, []);

  const close = useCallback(() => {
    dropAudition();
    setOpen(false);
    setArmed(false);
    setScrubbing(false);
    setHighlight(null);
    setEngagedId(null);
    haptic("close");
  }, [dropAudition]);

  const goTo = useCallback((next: string) => {
    setNodeId(next);
    setPage(0);
    setHighlight(null);
    // A different node has different scalars, so the rim has nothing to be
    // wired to any more. `engagedKey` deliberately survives: it is which
    // *parameter* the mod and audio branches are about, not which slot the
    // rim is driving.
    setEngagedId(null);
    haptic("select");
  }, []);

  const goBack = useCallback(() => {
    dropAudition();
    const parent = tree[nodeId]?.parent;
    if (parent) goTo(parent);
    else close();
  }, [tree, nodeId, goTo, close, dropAudition]);

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
  // A wheel that stops existing is not open — and an audition it was holding
  // is not something the user chose to keep. Without the discard, unmounting
  // mid-audition left the previewed layer in the stack with no undo entry to
  // remove it, and `previewLayerId` pointing at it, so the next audition
  // silently deleted a layer the user had every reason to think was theirs.
  useEffect(() => () => {
    const store = useStore.getState();
    if (store.previewLayerId) store.discardPreview();
    store.setParamWheelOpen(false);
  }, []);

  // Two-finger tap-and-hold on the art. The recognizer and its arbitration
  // live in Editor.tsx, which owns every canvas gesture; this component only
  // listens for the decision.
  useEffect(() => {
    // The armed preview is anchored too. Without this it rendered at the
    // origin — a half-wheel in the top-left corner — because the anchor was
    // only ever set at commit time.
    const onArm = (event: Event) => {
      const detail = (event as CustomEvent<WheelAnchor | undefined>).detail;
      if (detail) {
        const nextSize = wheelSizeFor(window.innerWidth, window.innerHeight);
        setSize(nextSize);
        setAnchor(clampAnchor(detail.x, detail.y, nextSize, window.innerWidth, window.innerHeight));
      }
      setArmed(true);
    };
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
    return () => {
      window.removeEventListener("mosh:arm-param-wheel", onArm);
      window.removeEventListener("mosh:disarm-param-wheel", onDisarm);
      window.removeEventListener("mosh:open-param-wheel", onOpen);
      window.removeEventListener("mosh:toggle-param-wheel", onToggle);
    };
  }, [openAt, close]);

  useEffect(() => {
    const onClose = () => { setArmed(false); if (open) close(); };
    window.addEventListener("mosh:close-param-wheel", onClose);
    return () => window.removeEventListener("mosh:close-param-wheel", onClose);
  }, [open, close]);

  // ── activation ─────────────────────────────────────────────────────────
  const activate = useCallback((item: WheelItem) => {
    if (item.disabled) { haptic("reject"); return; }
    if (item.branch) { goTo(item.branch); return; }
    // A browser entry auditions on tap: it lands on the frame immediately,
    // and stays only if it is committed. Nothing here is a decision yet.
    if (item.preview) {
      item.preview();
      setHighlight(item.id);
      setEngagedId(null);
      haptic("select");
      return;
    }
    if (item.action) {
      item.action();
      haptic("commit");
      // A slot that also carries a value stays wired to the rim after the
      // tap, so "pick it, then sweep" is one continuous move.
      if (item.scalar) { setHighlight(item.id); setEngagedId(item.id); }
      return;
    }
    if (item.scalar) {
      setHighlight(item.id);
      setEngagedId(current => (current === item.id ? null : item.id));
      if (nodeId === "tune") setEngagedKey(current => (current === item.id ? null : item.id));
      haptic("select");
    }
  }, [goTo, nodeId]);

  /** The hub's ＋ button, and the long-press on an entry, both land here. */
  const commitAudition = useCallback(() => {
    if (!node.onCommit) { haptic("reject"); return; }
    node.onCommit();
    haptic("commit");
  }, [node]);

  // Keyboard steering. Tab already reaches every slot, but a ring is a
  // circle, not a list: left/right walk around it and wrap, up/down step in
  // and out of the rings, and once a value is engaged they nudge it instead.
  // Same two axes the two touch bands give a thumb.
  const stepHighlight = useCallback((delta: number) => {
    if (!items.length) return;
    const current = items.findIndex(item => item.id === highlight);
    const next = current < 0
      ? (delta > 0 ? 0 : items.length - 1)
      : (current + delta + items.length) % items.length;
    setHighlight(items[next].id);
    haptic("step");
  }, [items, highlight]);

  const nudgeEngaged = useCallback((direction: -1 | 1, coarse: boolean) => {
    if (!engaged) return false;
    const { scalar } = engaged;
    const stride = coarse ? 0.1 : (scalar.step ? scalar.step / Math.max(1e-6, scalar.max - scalar.min) : 0.02);
    const next = Math.min(1, Math.max(0, scalarFraction(scalar) + direction * stride));
    scalar.set(scalarFromFraction(scalar, next));
    haptic(next === 0 || next === 1 ? "limit" : "step");
    return true;
  }, [engaged]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); goBack(); return; }
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      switch (event.key) {
        case "ArrowRight": event.preventDefault(); stepHighlight(1); return;
        case "ArrowLeft": event.preventDefault(); stepHighlight(-1); return;
        case "ArrowUp":
          event.preventDefault();
          if (!nudgeEngaged(1, event.shiftKey)) stepHighlight(-1);
          return;
        case "ArrowDown":
          event.preventDefault();
          if (!nudgeEngaged(-1, event.shiftKey)) stepHighlight(1);
          return;
        case "PageUp": if (view.paged) { event.preventDefault(); setPage(p => p - 1); setEngagedId(null); } return;
        case "PageDown": if (view.paged) { event.preventDefault(); setPage(p => p + 1); setEngagedId(null); } return;
        case "Backspace": event.preventDefault(); goBack(); return;
        case "Enter":
        case " ": {
          const item = items.find(entry => entry.id === highlight);
          if (!item) return;
          event.preventDefault();
          activate(item);
          return;
        }
        default:
      }
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
  }, [open, goBack, items, highlight, view.paged, activate, stepHighlight, nudgeEngaged]);

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
    /** Last page this drag actually applied, unwrapped — see the page branch. */
    pageApplied: number;
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
      pageApplied: view.page,
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
      // Compare against what this drag last applied, not against `view.page`.
      // `view.page` comes back wrapped into 0..pages-1 while `target` keeps
      // counting, so once a scrub crossed either end the two could never agree
      // again and every single pointermove re-fired: a continuous haptic buzz
      // and a stream of no-op state writes.
      if (target !== drag.pageApplied) {
        drag.pageApplied = target;
        setPage(target);
        setEngagedId(null);
        haptic("step");
      }
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
    const point = unrotatePoint(nx, ny, rotationRef.current);
    const index = hitSlot(point.x, point.y, slots);
    const item = index >= 0 ? items[index] : null;
    if (!item || item.id.startsWith("__")) return;
    setHighlight(current => {
      if (current === item.id) return current;
      haptic("step");
      return item.id;
    });
  };

  // ── slot long-press ────────────────────────────────────────────────────
  //
  // Two different secondary actions, decided by what the slot is. On a
  // browser entry it *keeps* the effect — audition and decide in one gesture,
  // for someone who already knows what they want and doesn't need the trip to
  // the hub. On a value it resets to the default.
  const holdRef = useRef<{ id: string; timer: number; fired: boolean } | null>(null);
  const startSlotHold = (item: WheelItem) => {
    const hold = item.commit
      ? () => { item.commit?.(); setHighlight(item.id); haptic("commit"); }
      : item.scalar?.reset
        ? () => { item.scalar?.reset?.(); haptic("limit"); }
        : null;
    if (!hold) return;
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
    holdRef.current = {
      id: item.id, fired: false,
      timer: window.setTimeout(() => {
        if (!holdRef.current) return;
        holdRef.current.fired = true;
        hold();
      }, item.commit ? COMMIT_HOLD_MS : 480),
    };
  };
  const endSlotHold = () => {
    if (holdRef.current) window.clearTimeout(holdRef.current.timer);
  };
  const slotHoldFired = (id: string) => holdRef.current?.id === id && holdRef.current.fired;
  useEffect(() => () => { if (holdRef.current) window.clearTimeout(holdRef.current.timer); }, []);

  // ── the dot: drag it round to draw or erase the amount ─────────────────
  //
  // The dot rides on a short arc anchored at its own slot, so "how much of
  // this" is readable without engaging anything, and settable without
  // travelling to the rim. Dragging widens the arc from a tidy resting span
  // to a comfortable sweep, and dims everything else so the widened arc
  // crossing its neighbours reads as a read-out rather than as clutter.
  const [dotDragging, setDotDragging] = useState(false);
  const dotDragRef = useRef<{ pointerId: number; angle: number; fraction: number } | null>(null);

  const dotSlot = dotIndex >= 0 ? slots[dotIndex] : null;
  const dotItem = dotIndex >= 0 ? items[dotIndex] : null;
  const dotFraction = dotItem?.scalar ? scalarFraction(dotItem.scalar) : 0;
  const dotSpan = dotDragging ? DOT_ARC_DRAG : DOT_ARC_IDLE;

  const onDotPointerDown = (event: React.PointerEvent) => {
    if (!dotItem?.scalar) return;
    event.stopPropagation();
    event.preventDefault();
    const { angle } = localPoint(event.clientX, event.clientY);
    dotDragRef.current = { pointerId: event.pointerId, angle, fraction: scalarFraction(dotItem.scalar) };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setDotDragging(true);
    setScrubbing(true);
    setEngagedId(dotItem.id);
    haptic("select");
  };

  const onDotPointerMove = (event: React.PointerEvent) => {
    const drag = dotDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !dotItem?.scalar) return;
    event.stopPropagation();
    const { angle, radius } = localPoint(event.clientX, event.clientY);
    const delta = angleDelta(drag.angle, angle);
    drag.angle = angle;
    const step = (delta / DOT_ARC_DRAG) * precisionForRadius(radius);
    const next = Math.min(1, Math.max(0, drag.fraction + step));
    if ((next === 0 || next === 1) && next !== drag.fraction) haptic("limit");
    drag.fraction = next;
    queueScrub(dotItem.scalar, next);
  };

  const endDotDrag = (event: React.PointerEvent) => {
    const drag = dotDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dotDragRef.current = null;
    setDotDragging(false);
    setScrubbing(false);
  };

  const trail = useMemo(() => breadcrumb(tree, nodeId), [tree, nodeId]);
  const hubValue = engaged ? formatScalar(engaged.scalar) : null;
  const hubLabel = engaged
    ? engaged.item.label
    : highlight
      ? items.find(item => item.id === highlight)?.label ?? node.title
      : node.title;
  const rimHint = engaged ? "drag the dot · or sweep the rim" : null;

  if (!open && !armed) return null;

  return (
    <div
      className="param-wheel-layer"
      data-phase={open ? "open" : "armed"}
      data-scrubbing={scrubbing || undefined}
      data-dot-dragging={dotDragging || undefined}
      data-layout={node.layout ?? "ring"}
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
          pages={view.pages}
          page={view.page}
          rings={browsing ? BROWSER_RADII : null}
          dot={dotSlot ? { slot: dotSlot, fraction: dotFraction, span: dotSpan } : null}
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
              data-engaged={engagedId === item.id || undefined}
              data-active={item.active || undefined}
              data-tone={item.tone}
              data-disabled={item.disabled || undefined}
              data-ring={slot.ring}
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
              {dotIndex === index && item.scalar && (
                <button
                  type="button"
                  className="param-wheel__dot"
                  data-dragging={dotDragging || undefined}
                  aria-label={`${item.label} amount — drag around the wheel to set`}
                  aria-valuenow={Math.round(dotFraction * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  role="slider"
                  tabIndex={-1}
                  style={{
                    ["--dot-angle" as string]: `${dotFraction * dotSpan}deg`,
                    ["--dot-reach" as string]: String(DOT_OFFSET),
                  }}
                  onPointerDown={onDotPointerDown}
                  onPointerMove={onDotPointerMove}
                  onPointerUp={endDotDrag}
                  onPointerCancel={endDotDrag}
                  onClick={(event) => event.stopPropagation()}
                />
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="param-wheel__empty">{node.subtitle ?? "Nothing here yet"}</p>
        )}

        {/*
          The hub is a cluster, not a button. The read-out — where you are,
          what is under your finger, what it is set to — sits above a row of
          real controls: BACK, which always steps out one level and is the one
          thing that must never be a guess, and ＋, which keeps whatever is
          being auditioned. Making back an explicit target matters more the
          deeper the tree goes; making commit explicit is what lets every tap
          in the catalogue be a try rather than a decision.
        */}
        <div data-wheel-hub className="param-wheel__hub" onPointerDown={(event) => event.stopPropagation()}>
          <span className="param-wheel__trail" aria-hidden>
            {trail.length > 1 ? trail.slice(0, -1).map(step => step.title).join(" › ") : "PARAMS"}
          </span>
          <span className="param-wheel__title">{hubLabel}</span>
          {hubValue !== null
            ? <span className="param-wheel__value">{hubValue}</span>
            : <span className="param-wheel__hint">{node.subtitle ?? (node.parent ? "step back with ←" : "tap ✕ to close")}</span>}
          {rimHint && <span className="param-wheel__hint">{rimHint}</span>}
          {view.paged && <span className="param-wheel__page" aria-hidden>{view.page + 1} / {view.pages}</span>}
          <div className="param-wheel__hub-row">
            <button
              type="button"
              className="param-wheel__hub-button"
              data-role="back"
              onClick={goBack}
              aria-label={node.parent ? `Back to ${tree[node.parent]?.title ?? "menu"}` : "Close parameter wheel"}
              title={node.parent ? "Back" : "Close"}
            >
              {node.parent ? "←" : "✕"}
            </button>
            {browsing && (
              <button
                type="button"
                className="param-wheel__hub-button"
                data-role="commit"
                data-ready={node.onCommit ? "" : undefined}
                disabled={!node.onCommit}
                onClick={commitAudition}
                aria-label={node.commitLabel ?? "Keep the effect you are trying — pick one first"}
                title={node.commitLabel ?? "Try an effect first"}
              >
                ＋
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Rings, page pips and the dot's arc, as one SVG.
 *
 * Drawn rather than composed from bordered elements so the whole dial is a
 * single composited layer over the live canvas — the arc updates by path
 * geometry alone, which does not trigger layout.
 *
 * There used to be a second, full-width arc near the rim showing the engaged
 * value. It is gone: the dot's own arc shows the same number, anchored to the
 * slot it belongs to, and two indicators for one value is worse than either
 * alone — you have to work out whether they agree. The rim *gesture* still
 * works and drives the engaged scalar; the dot's arc is what answers it.
 */
function WheelDial({
  pages, page, rings, dot,
}: {
  pages: number;
  page: number;
  /** Explicit ring radii for the browser layout, else the default two. */
  rings: number[] | null;
  /** The one slot showing a draggable amount, if any. */
  dot: { slot: WheelSlot; fraction: number; span: number } | null;
}) {
  const guides = rings ?? [0.42, 0.29];
  return (
    <svg className="param-wheel__dial" viewBox="0 0 100 100" aria-hidden focusable="false">
      {guides.map((r, index) => (
        <circle
          key={r}
          className={`param-wheel__ring param-wheel__ring--${index === 0 ? "outer" : "inner"}`}
          cx="50" cy="50" r={r * 100}
        />
      ))}
      <circle className="param-wheel__ring param-wheel__ring--hub" cx="50" cy="50" r={HUB_RADIUS * 100} />
      {dot && (
        <>
          <path
            className="param-wheel__dot-track"
            d={arcPath(dot.slot.angleDeg, dot.span, dot.slot.radius + DOT_OFFSET)}
          />
          <path
            className="param-wheel__dot-arc"
            d={arcPath(dot.slot.angleDeg, dot.span * dot.fraction, dot.slot.radius + DOT_OFFSET)}
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

/**
 * An arc in the dial's 0-100 viewBox, starting at `fromDeg` clockwise from
 * twelve o'clock and sweeping `spanDeg`, at `radius` (a fraction of the
 * wheel's diameter, so ×100 for this viewBox).
 *
 * A zero-length sweep still has to draw *something* — that is the state of an
 * amount turned all the way down, and a path that vanishes would read as
 * "this control is gone" rather than "this value is zero" — so it collapses
 * to a hairline stub rather than an empty string.
 */
export function arcPath(fromDeg: number, spanDeg: number, radius: number): string {
  const r = radius * 100;
  const span = Math.max(0.6, Math.min(359.9, spanDeg));
  const a0 = (fromDeg - 90) * Math.PI / 180;
  const a1 = (fromDeg + span - 90) * Math.PI / 180;
  const x0 = 50 + Math.cos(a0) * r;
  const y0 = 50 + Math.sin(a0) * r;
  const x1 = 50 + Math.cos(a1) * r;
  const y1 = 50 + Math.sin(a1) * r;
  const largeArc = span > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
