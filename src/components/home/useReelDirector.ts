/**
 * Decides what the film reel does and when. One reel is alive at a time: it
 * glitches in somewhere random, scrolls one way for half a minute or more,
 * glitches out, and after a beat of empty screen a different reel takes its
 * place — different frames, different spot, different heading.
 *
 * Pure planning lives in `planReel` so the randomisation can be tested without
 * running timers.
 */
import { useEffect, useRef, useState } from "react";
import { shuffle, type DemoFrame } from "@/data/demoReel";

/** How long the spawn and despawn glitches run, in ms. Matches the CSS. */
export const GLITCH_IN_MS = 780;
export const GLITCH_OUT_MS = 620;

/** Empty-screen pause between one reel leaving and the next arriving, in ms. */
const GAP_MIN_MS = 2_000;
const GAP_MAX_MS = 6_000;

/** How long a reel holds before it glitches out. */
const LIFETIME_MIN_MS = 30_000;
const LIFETIME_MAX_MS = 90_000;

const SPEED_MIN = 95;
const SPEED_MAX = 210;

const FRAMES_MIN = 14;
const FRAMES_MAX = 20;

/**
 * Strip rotations in degrees. Paired with `sign` these cover all eight
 * headings: horizontal, vertical, and both diagonals in both directions.
 */
const ANGLES = [0, 90, 34, -34] as const;

export type ReelPhase = "gap" | "in" | "hold" | "out";

export type ReelPlan = {
  /** Changes every spawn; used as a React key to force a clean remount. */
  id: number;
  frames: DemoFrame[];
  /** Rotation of the whole strip. */
  angle: number;
  /** Travel along the strip's own long axis: +1 one way, -1 the other. */
  sign: 1 | -1;
  /** Strip centre as a percentage of the panel, so reels land all over. */
  cx: number;
  cy: number;
  /** Scroll rate in px/sec. */
  speed: number;
  lifetimeMs: number;
};

type Rand = () => number;

const between = (rand: Rand, min: number, max: number) => min + rand() * (max - min);
const pick = <T,>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)];

/**
 * Builds one reel's parameters. `id` is supplied by the caller so plans stay
 * comparable in tests, and `rand` is injectable for the same reason.
 */
export function planReel(pool: readonly DemoFrame[], id: number, rand: Rand = Math.random): ReelPlan {
  const count = Math.round(between(rand, FRAMES_MIN, FRAMES_MAX));
  return {
    id,
    frames: shuffle(pool).slice(0, Math.min(count, pool.length)),
    angle: pick(rand, ANGLES),
    sign: rand() < 0.5 ? -1 : 1,
    // The strip runs far longer than the viewport, so it bleeds off both ends
    // wherever it is centred; this offset is what moves it around the screen.
    cx: between(rand, 22, 78),
    cy: between(rand, 22, 78),
    speed: between(rand, SPEED_MIN, SPEED_MAX),
    lifetimeMs: between(rand, LIFETIME_MIN_MS, LIFETIME_MAX_MS),
  };
}

/**
 * Runs the spawn/hold/despawn cycle while `active` is true. Going inactive —
 * the panel scrolled away, the tab hidden, reduced motion — tears the current
 * reel down; coming back starts a fresh one rather than resuming mid-life.
 */
export function useReelDirector(pool: readonly DemoFrame[], active: boolean) {
  const [plan, setPlan] = useState<ReelPlan | null>(null);
  const [phase, setPhase] = useState<ReelPhase>("gap");
  const nextId = useRef(0);

  useEffect(() => {
    if (!active || pool.length === 0) {
      setPlan(null);
      setPhase("gap");
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    const at = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const spawn = () => {
      const next = planReel(pool, nextId.current++);
      setPlan(next);
      setPhase("in");
      at(GLITCH_IN_MS, () => {
        setPhase("hold");
        at(next.lifetimeMs, () => {
          setPhase("out");
          at(GLITCH_OUT_MS, () => {
            setPlan(null);
            setPhase("gap");
            at(between(Math.random, GAP_MIN_MS, GAP_MAX_MS), spawn);
          });
        });
      });
    };

    // First reel arrives almost immediately — the panel should not look empty
    // to someone who just scrolled down to it.
    at(300, spawn);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pool, active]);

  return { plan, phase };
}
