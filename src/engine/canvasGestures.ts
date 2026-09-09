/**
 * Gesture arbitration for the visualizer surface.
 *
 * The canvas already carried five independent pointer recognizers, each with
 * its own `Map<pointerId, point>` and its own idea of what counts as a tap:
 * one-finger long-press (hot-trigger wheel), one- and two-finger swipes
 * (undo/redo), a two-finger tap (screenshot), a three-finger tap (GIF), and a
 * Pro-Mode two-finger toggle that fired on `pointerdown` with no duration test
 * at all. Adding a two-finger *hold* to that set without a referee would have
 * meant a slow two-finger tap firing a screenshot on the way to opening a
 * menu, and the Pro-Mode toggle pre-empting the hold every time.
 *
 * So: whichever recognizer commits first takes a lock, and the rest stand down
 * until every finger has lifted. A lock is deliberately scoped to one touch
 * sequence — it is not a modal state, and it always ends, so a recognizer that
 * throws or a finger the browser forgets to report cannot wedge the canvas.
 */

type LockState = { owner: string; at: number } | null;

let lock: LockState = null;

export const gestureLock = {
  /** Take the lock for this touch sequence. Returns false if someone else holds it. */
  claim(owner: string): boolean {
    if (lock && lock.owner !== owner) return false;
    lock = { owner, at: Date.now() };
    return true;
  },
  release(owner: string): void {
    if (lock?.owner === owner) lock = null;
  },
  /** Drop whatever is held. Called when the last finger lifts. */
  reset(): void {
    lock = null;
  },
  owner(): string | null {
    return lock?.owner ?? null;
  },
  /** True when another recognizer has committed and this one should stand down. */
  isBlocked(self?: string): boolean {
    return lock != null && lock.owner !== self;
  },
};

export type GesturePoint = { x: number; y: number };

export type HoldRecognizerConfig = {
  /** Exactly this many fingers, no more, no fewer. */
  fingers: number;
  /** Held this long, still, before the gesture commits. */
  holdMs: number;
  /** Optional earlier beat for an "it's coming" hint. */
  armMs?: number;
  /** Per-finger travel budget before the hold is abandoned, in px. */
  jitterPx?: number;
  /** Name used for the arbitration lock. */
  name: string;
  onArm?: (centroid: GesturePoint) => void;
  onCommit: (centroid: GesturePoint) => void;
  /** Fired when an armed-or-committed gesture is abandoned, so a hint can clear. */
  onCancel?: () => void;
};

export type HoldRecognizer = {
  down: (id: number, x: number, y: number) => void;
  move: (id: number, x: number, y: number) => void;
  up: (id: number) => void;
  cancel: () => void;
  /** True between commit and the last finger lifting. */
  isCommitted: () => boolean;
  activeCount: () => number;
};

export function centroidOf(points: Iterable<GesturePoint>): GesturePoint {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const point of points) { x += point.x; y += point.y; n++; }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}

/**
 * A "hold exactly N fingers still" recognizer, factored out so its timing and
 * abort rules can be tested without a DOM. Timers are injected so tests can
 * drive them directly rather than sleeping.
 */
export function createHoldRecognizer(
  config: HoldRecognizerConfig,
  timers: {
    setTimeout: (fn: () => void, ms: number) => number;
    clearTimeout: (handle: number) => void;
  } = { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h) },
): HoldRecognizer {
  const { fingers, holdMs, armMs, jitterPx = 18, name, onArm, onCommit, onCancel } = config;

  const active = new Map<number, GesturePoint>();
  const origins = new Map<number, GesturePoint>();
  let armTimer: number | null = null;
  let holdTimer: number | null = null;
  let armed = false;
  let committed = false;
  /** Latched once the sequence can no longer become a clean N-finger hold. */
  let spoiled = false;

  const clearTimers = () => {
    if (armTimer != null) timers.clearTimeout(armTimer);
    if (holdTimer != null) timers.clearTimeout(holdTimer);
    armTimer = null;
    holdTimer = null;
  };

  const abandon = () => {
    const wasVisible = armed || committed;
    clearTimers();
    if (committed) gestureLock.release(name);
    armed = false;
    committed = false;
    if (wasVisible) onCancel?.();
  };

  const spoil = () => {
    spoiled = true;
    abandon();
  };

  const schedule = () => {
    clearTimers();
    if (armMs != null) {
      armTimer = timers.setTimeout(() => {
        armTimer = null;
        if (spoiled || committed || active.size !== fingers) return;
        armed = true;
        onArm?.(centroidOf(active.values()));
      }, armMs);
    }
    holdTimer = timers.setTimeout(() => {
      holdTimer = null;
      if (spoiled || committed || active.size !== fingers) return;
      // Only commit if arbitration allows it — another recognizer may already
      // have decided this sequence is a swipe.
      if (!gestureLock.claim(name)) { spoil(); return; }
      committed = true;
      armed = false;
      onCommit(centroidOf(active.values()));
    }, holdMs);
  };

  return {
    down(id, x, y) {
      if (active.has(id)) return;
      active.set(id, { x, y });
      origins.set(id, { x, y });
      if (committed) return;
      if (active.size > fingers) { spoil(); return; }
      if (spoiled) return;
      // A finger added *after* the set was complete restarts nothing; a finger
      // that completes the set starts the clock.
      if (active.size === fingers) schedule();
      else clearTimers();
    },
    move(id, x, y) {
      const point = active.get(id);
      if (!point) return;
      point.x = x;
      point.y = y;
      if (committed || spoiled) return;
      const origin = origins.get(id);
      if (!origin) return;
      if (Math.hypot(x - origin.x, y - origin.y) > jitterPx) spoil();
    },
    up(id) {
      if (!active.delete(id)) return;
      origins.delete(id);
      // Lifting before the hold matures means it was a tap, not a hold — let
      // the tap recognizers have it.
      if (!committed) abandon();
      if (active.size === 0) {
        if (committed) gestureLock.release(name);
        clearTimers();
        armed = false;
        committed = false;
        spoiled = false;
        origins.clear();
      }
    },
    cancel() {
      abandon();
      active.clear();
      origins.clear();
      spoiled = false;
    },
    isCommitted: () => committed,
    activeCount: () => active.size,
  };
}

/**
 * Shared test for "this pointer landed on the art, not on a control".
 * Every canvas recognizer used its own inline copy of this selector list;
 * they had already drifted (one included `select`, the others didn't).
 */
export const CONTROL_SELECTOR =
  "button, a, input, textarea, select, [role='slider'], [role='menu'], [data-no-longpress]";

export function isBareCanvasTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return !target.closest(CONTROL_SELECTOR);
}
