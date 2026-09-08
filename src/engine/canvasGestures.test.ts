import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  centroidOf,
  createHoldRecognizer,
  gestureLock,
  isBareCanvasTarget,
  type GesturePoint,
  type HoldRecognizer,
} from "./canvasGestures";

/** Minimal deterministic timer queue so hold timing is exercised, not slept through. */
function fakeTimers() {
  const queue = new Map<number, { fn: () => void; at: number }>();
  let next = 1;
  let now = 0;
  return {
    api: {
      setTimeout: (fn: () => void, ms: number) => {
        const handle = next++;
        queue.set(handle, { fn, at: now + ms });
        return handle;
      },
      clearTimeout: (handle: number) => { queue.delete(handle); },
    },
    advance(ms: number) {
      now += ms;
      for (const [handle, entry] of [...queue].sort((a, b) => a[1].at - b[1].at)) {
        if (entry.at <= now) { queue.delete(handle); entry.fn(); }
      }
    },
    pending: () => queue.size,
  };
}

describe("gestureLock", () => {
  beforeEach(() => gestureLock.reset());

  it("grants the lock to the first claimant and blocks the rest", () => {
    expect(gestureLock.claim("param-wheel")).toBe(true);
    expect(gestureLock.claim("screenshot")).toBe(false);
    expect(gestureLock.isBlocked("screenshot")).toBe(true);
    expect(gestureLock.isBlocked("param-wheel")).toBe(false);
  });

  it("is re-entrant for the holder", () => {
    expect(gestureLock.claim("param-wheel")).toBe(true);
    expect(gestureLock.claim("param-wheel")).toBe(true);
  });

  it("frees up after release, and ignores a release from a non-holder", () => {
    gestureLock.claim("param-wheel");
    gestureLock.release("screenshot");
    expect(gestureLock.isBlocked("screenshot")).toBe(true);
    gestureLock.release("param-wheel");
    expect(gestureLock.isBlocked("screenshot")).toBe(false);
  });

  it("blocks nobody when unheld", () => {
    expect(gestureLock.isBlocked()).toBe(false);
    expect(gestureLock.owner()).toBeNull();
  });
});

describe("createHoldRecognizer — two-finger hold", () => {
  let timers: ReturnType<typeof fakeTimers>;
  let onArm: Mock<(centroid: GesturePoint) => void>;
  let onCommit: Mock<(centroid: GesturePoint) => void>;
  let onCancel: Mock<() => void>;
  let hold: HoldRecognizer;

  beforeEach(() => {
    gestureLock.reset();
    timers = fakeTimers();
    onArm = vi.fn<(centroid: GesturePoint) => void>();
    onCommit = vi.fn<(centroid: GesturePoint) => void>();
    onCancel = vi.fn<() => void>();
    hold = createHoldRecognizer({
      fingers: 2, holdMs: 450, armMs: 180, jitterPx: 18,
      name: "param-wheel", onArm, onCommit, onCancel,
    }, timers.api);
  });

  it("commits on two still fingers held past the threshold", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    timers.advance(180);
    expect(onArm).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
    timers.advance(300);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(hold.isCommitted()).toBe(true);
  });

  it("reports the centroid of the two fingers, so the wheel opens under the hand", () => {
    hold.down(1, 100, 200);
    hold.down(2, 200, 300);
    timers.advance(500);
    expect(onCommit).toHaveBeenCalledWith({ x: 150, y: 250 });
  });

  it("does NOT commit for a quick two-finger tap — that is still the screenshot", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    timers.advance(200);
    hold.up(1);
    hold.up(2);
    timers.advance(400);
    expect(onCommit).not.toHaveBeenCalled();
    expect(gestureLock.isBlocked("screenshot")).toBe(false);
  });

  it("abandons when a finger drifts past the jitter budget — that is a swipe", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    timers.advance(180);
    hold.move(1, 100, 260);
    timers.advance(400);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("tolerates drift within budget", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    hold.move(1, 108, 206);
    timers.advance(500);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("does not commit for one finger, or for three", () => {
    hold.down(1, 100, 200);
    timers.advance(600);
    expect(onCommit).not.toHaveBeenCalled();

    hold.down(2, 160, 210);
    hold.down(3, 220, 220);
    timers.advance(600);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("stays spoiled for the rest of the sequence once a third finger lands", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    hold.down(3, 220, 220);
    hold.up(3);
    timers.advance(900);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("recovers cleanly for the next sequence after every finger lifts", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    hold.down(3, 220, 220);
    hold.up(1); hold.up(2); hold.up(3);

    hold.down(4, 100, 200);
    hold.down(5, 160, 210);
    timers.advance(500);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("stands down when another recognizer already owns the sequence", () => {
    gestureLock.claim("undo-swipe");
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    timers.advance(500);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("holds the arbitration lock while committed and frees it on lift", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    timers.advance(500);
    expect(gestureLock.isBlocked("screenshot")).toBe(true);
    hold.up(1);
    hold.up(2);
    expect(gestureLock.isBlocked("screenshot")).toBe(false);
  });

  it("leaves no timer running after cancel", () => {
    hold.down(1, 100, 200);
    hold.down(2, 160, 210);
    hold.cancel();
    expect(timers.pending()).toBe(0);
    expect(hold.activeCount()).toBe(0);
  });
});

describe("centroidOf", () => {
  it("averages points and survives an empty set", () => {
    expect(centroidOf([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
    expect(centroidOf([])).toEqual({ x: 0, y: 0 });
  });
});

describe("isBareCanvasTarget", () => {
  it("passes plain canvas targets and rejects controls", () => {
    document.body.innerHTML = `
      <div id="art"></div>
      <button id="btn"><svg id="ico"></svg></button>
      <div data-no-longpress><span id="opted-out"></span></div>`;
    expect(isBareCanvasTarget(document.getElementById("art"))).toBe(true);
    expect(isBareCanvasTarget(document.getElementById("btn"))).toBe(false);
    // SVG inside a button is an Element but not an HTMLElement — the old
    // per-recognizer copies of this check disagreed about that.
    expect(isBareCanvasTarget(document.getElementById("ico"))).toBe(false);
    expect(isBareCanvasTarget(document.getElementById("opted-out"))).toBe(false);
    expect(isBareCanvasTarget(null)).toBe(true);
  });
});
