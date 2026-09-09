/**
 * The home page's glitching word field.
 *
 * MOSH's vocabulary — BROWSE, MOSH, LINK, GO LIVE, FORGE … — flashes across the
 * page at random sizes, in random orientations, in the same brutalist display
 * face as the hero. Words appear and decay independently, so the field is never
 * the same twice.
 *
 * The invariant: nothing ever overlaps. Not two words, not a word and the hero,
 * not a word and the nav. That is enforced rather than hoped for:
 *
 *   - Every word is measured at its real size before it is placed, because
 *     estimating from character count drifts badly between "MOSH" and
 *     "DROP AN IMAGE" at 3x scale — exactly when a mistake is most visible.
 *   - Placement tests the *rotated* footprint (see `wordField.ts`), so a
 *     turned word reserves the tall box it actually sweeps.
 *   - A word holds its box until it dies, then releases it. New words are only
 *     ever placed into space nothing currently claims.
 *   - When no free spot turns up, the spawn is skipped. A missing word for one
 *     beat is invisible; an overlapping one is the bug this exists to prevent.
 */
import { useEffect, useRef, useState } from "react";
import { createWordBag, placeWord, type Rect } from "./wordField";

/**
 * The instrument's own verbs. These are what MOSH does, not marketing copy.
 *
 * "DROP AN IMAGE" is deliberately absent: it belongs to the hero, which shows
 * it half the time. Leaving it in the field put the same phrase on screen twice
 * at once, which is the exact duplication this work set out to remove.
 */
export const FIELD_WORDS = [
  "BROWSE",
  "PASTE",
  "MOSH",
  "LINK",
  "GO LIVE",
  "FORGE",
  "INSTALL",
  "UPLOAD",
  "START CAMERA",
  "WARP",
  "DEMO",
  "EXPORT",
  "GLITCH",
  "SYNC",
] as const;

/** Typography shared by the ruler and the rendered word. Drift between the two
 *  silently breaks the no-overlap guarantee, so there is exactly one copy. */
const TYPE = "font-sans font-black uppercase tracking-tighter leading-[0.9] whitespace-nowrap";

/** Orientations, weighted: mostly upright, with verticals for the edges and the
 *  occasional upside-down word for the datamoshed feel. */
const ANGLES: Array<{ deg: number; weight: number }> = [
  { deg: 0, weight: 46 },
  { deg: 90, weight: 18 },
  { deg: -90, weight: 18 },
  { deg: 180, weight: 6 },
  { deg: 45, weight: 4 },
  { deg: -45, weight: 4 },
  { deg: 12, weight: 2 },
  { deg: -12, weight: 2 },
];

/** Size classes as a multiple of the field's base size. Small words dominate so
 *  the big ones land as events rather than noise. */
const SCALES: Array<{ mul: number; weight: number }> = [
  { mul: 0.34, weight: 30 },
  { mul: 0.55, weight: 26 },
  { mul: 0.9, weight: 20 },
  { mul: 1.5, weight: 14 },
  { mul: 2.4, weight: 7 },
  { mul: 3.6, weight: 3 },
];

const LIFE_MIN = 1700;
const LIFE_MAX = 4200;
// Every beat is a React state update (new/expired words) plus a handful of
// getBoundingClientRect reads — real, necessary work, run forever while this
// field is mounted. 360ms vs. the original 320ms is a ~12% cut to how often
// that recurs, small enough that word turnover (each word already lives
// 1.7-4.2s regardless of tick rate) reads the same, but it compounds over
// any stretch of time the field is running.
const BEAT_MS = 360;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

type Live = {
  key: number;
  word: string;
  cx: number;
  cy: number;
  deg: number;
  fontSize: number;
  life: number;
  dieAt: number;
  rect: Rect;
  dim: number;
  accent: boolean;
};

/**
 * Anything the field must not cover carries this attribute. Marking the DOM
 * beats passing refs or copying coordinates: an element declares its own
 * keep-out where it is written, and nothing has to be kept in sync as the page
 * changes.
 */
export const KEEP_OUT_ATTR = "data-mosh-keepout";

/** Spread onto any element the word field must route around: `{...KEEP_OUT}`. */
export const KEEP_OUT = { [KEEP_OUT_ATTR]: "" } as const;

interface GlitchWordFieldProps {
  /** Word the hero is showing right now; never duplicated into the field. */
  exclude?: string;
  words?: readonly string[];
}

export function GlitchWordField({ exclude, words = FIELD_WORDS }: GlitchWordFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [live, setLive] = useState<Live[]>([]);

  // The beat reads these rather than closing over props, so changing the hero
  // word does not tear down and restart the field.
  const liveRef = useRef<Live[]>([]);
  const excludeRef = useRef(exclude);
  const keyRef = useRef(0);

  liveRef.current = live;
  excludeRef.current = exclude;

  // Drop a word the instant the hero takes it, rather than at the next beat.
  // The hero's swap animation is shorter than a beat, so waiting would leave
  // the duplicate legible on screen for a moment — the one thing this field is
  // not allowed to do.
  useEffect(() => {
    if (!exclude) return;
    setLive(prev => (prev.some(l => l.word === exclude)
      ? prev.filter(l => l.word !== exclude)
      : prev));
  }, [exclude]);

  useEffect(() => {
    const host = hostRef.current;
    const meas = measureRef.current;
    if (!host || !meas) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const bag = createWordBag(words);

    /**
     * Boxes currently spoken for: every marked element plus every live word.
     *
     * The keep-out geometry (`box`, `reserved`) is measured once per beat and
     * passed in rather than re-queried per spawn — nothing marked keep-out
     * moves mid-beat, and re-running `querySelectorAll` plus a
     * `getBoundingClientRect()` per element on every spawn attempt was a
     * synchronous-layout tax paid twice a beat for geometry that hadn't
     * changed. Only live-word rects (already in memory, no DOM read) vary
     * between the two spawn attempts within one beat.
     */
    const claimed = (reserved: Rect[]): Rect[] => reserved.concat(liveRef.current.map(l => l.rect));

    /**
     * Word/fontSize → measured {w, h}, so repeat spawns of the same word at
     * the same size skip the DOM write+read entirely.
     *
     * Measuring width means writing `textContent`/`fontSize` onto the hidden
     * ruler and immediately reading `getBoundingClientRect()` — a genuine
     * forced synchronous layout, up to twice per spawn, up to twice a beat,
     * every 320ms, for as long as the field is mounted. The vocabulary is a
     * fixed 14 words and fontSize is `base * one of 6 SCALES`, where `base`
     * only changes on resize (which already tears down and restarts this
     * effect's whole live set) — so the real key space is small and stable
     * within a session, and a cache converges after the first handful of
     * beats. Keying on the exact fontSize float means a post-resize `base`
     * naturally misses instead of reading a stale, wrong-viewport width.
     */
    const measureCache = new Map<string, { w: number; h: number }>();
    const measure = (word: string, fontSize: number): { w: number; h: number } => {
      const key = `${word} ${fontSize}`;
      const cached = measureCache.get(key);
      if (cached) return cached;
      meas.textContent = word;
      meas.style.fontSize = `${fontSize}px`;
      const r = meas.getBoundingClientRect();
      const result = { w: r.width, h: r.height };
      measureCache.set(key, result);
      return result;
    };

    /**
     * The keep-out elements themselves — queried once, not every beat.
     *
     * Every `{...KEEP_OUT}` element on the home page (BioFlicker's band, the
     * quadrant marks, the hero's own chrome) is part of the same synchronous
     * render as this field; none are conditionally mounted or unmounted
     * later. So the *set* of elements is fixed for the field's whole
     * lifetime — only their positions move, as they animate in — and
     * re-running `document.querySelectorAll` to rediscover that same set on
     * every 320ms beat, forever, was pure repeated tree-walking for a result
     * that never changes.
     */
    const keepOutEls = Array.from(document.querySelectorAll<HTMLElement>(`[${KEEP_OUT_ATTR}]`));

    /** Keep-out boxes relative to `host`, measured once per beat. */
    const measureReserved = (box: DOMRect): Rect[] => {
      const reserved: Rect[] = [];
      for (const el of keepOutEls) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        reserved.push({
          l: r.left - box.left,
          t: r.top - box.top,
          r: r.right - box.left,
          b: r.bottom - box.top,
        });
      }
      return reserved;
    };

    const spawn = (now: number, box: DOMRect, reserved: Rect[]): Live | null => {
      const W = box.width;
      const H = box.height;
      if (W < 120 || H < 120) return null;

      // Nothing already on screen, and not whatever the hero is shouting.
      const taken = liveRef.current.map(l => l.word);
      if (excludeRef.current) taken.push(excludeRef.current);
      const word = bag.next(taken);
      if (word === null) return null;

      const margin = Math.max(8, Math.min(W, H) * 0.02);
      const gap = Math.max(10, Math.min(W, H) * 0.018);

      // Base tracks the viewport so the field reads the same on a phone and a
      // 4K display; the size class multiplies it.
      const base = Math.min(Math.max(W * 0.045, 15), 54);
      let fontSize = base * pickWeighted(SCALES).mul;
      const deg = pickWeighted(ANGLES).deg;

      let m = measure(word, fontSize);
      if (!m.w || !m.h) return null;

      // Shrink anything that cannot fit inside the margins. Without this the
      // long words simply never place at the big size classes, and the field
      // quietly loses half its vocabulary on narrow screens.
      const maxW = W - margin * 2;
      const maxH = H - margin * 2;
      if (m.w > maxW || m.h > maxH) {
        fontSize *= Math.min(maxW / m.w, maxH / m.h) * 0.98;
        m = measure(word, fontSize);
      }

      const spot = placeWord({
        W, H,
        w: m.w,
        h: m.h,
        deg,
        margin,
        blocked: claimed(reserved),
        gap,
        rng: Math.random,
      });
      if (!spot) return null;

      // The CSS life cycle ends on opacity 0 and holds there, so the element is
      // given slightly more life than the timer that removes it. Without the
      // headroom, any drift between the two — a throttled timer, a slow frame —
      // leaves an invisible word sitting on a box no other word may use.
      const life = rand(LIFE_MIN, LIFE_MAX);
      return {
        key: ++keyRef.current,
        word,
        cx: spot.cx,
        cy: spot.cy,
        deg,
        fontSize,
        life: life * 1.08,
        dieAt: now + life,
        rect: spot.rect,
        // Bigger words carry more weight, so they sit brighter; the small ones
        // recede into the visualiser instead of fighting the hero for attention.
        dim: fontSize > base * 1.2 ? rand(0.5, 0.82) : rand(0.24, 0.46),
        accent: Math.random() < 0.28,
      };
    };

    // How many words the field carries at once, by area — a phone gets a
    // handful, a desktop a crowd, and neither ends up feeling different.
    const targetCount = (box: DOMRect) =>
      Math.max(3, Math.min(11, Math.round((box.width * box.height) / 118000)));

    if (reduced) {
      // The glitching is the whole effect; with it off, place one calm set and
      // leave it alone rather than swapping words on a timer.
      const box = host.getBoundingClientRect();
      const reserved = measureReserved(box);
      const initial: Live[] = [];
      liveRef.current = initial;
      for (let i = 0; i < targetCount(box); i++) {
        const next = spawn(performance.now(), box, reserved);
        if (next) {
          initial.push({ ...next, life: 0 });
          liveRef.current = initial;
        }
      }
      setLive(initial.slice());
      return;
    }

    let timer: number | undefined;
    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      const now = performance.now();
      const box = host.getBoundingClientRect();
      const reserved = measureReserved(box);

      // Retire expired words first — that frees their boxes for this same beat,
      // so a vacated gap can be refilled immediately. A word the hero has since
      // taken over goes with them: excluding at spawn only holds until the
      // headline swaps, and the duplicate is visible the moment it does.
      let next = liveRef.current.filter(
        l => l.dieAt > now && l.word !== excludeRef.current,
      );
      const target = targetCount(box);

      // At most two spawns per beat: the field should fill in visibly rather
      // than snapping to full the moment it mounts.
      for (let i = 0; i < 2 && next.length < target; i++) {
        liveRef.current = next;
        const born = spawn(now, box, reserved);
        if (!born) break;
        next = next.concat(born);
      }

      liveRef.current = next;
      setLive(next);
      timer = window.setTimeout(beat, BEAT_MS);
    };

    // Let layout settle so the first measurement sees real geometry.
    timer = window.setTimeout(beat, 120);

    // A resize invalidates every stored box. Clearing is the honest response:
    // holding boxes measured against the old viewport is how overlaps appear.
    const ro = new ResizeObserver(() => {
      liveRef.current = [];
      setLive([]);
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [words]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-[8] overflow-hidden"
      style={{
        // Inset by the safe area directly: padding on an ancestor does not
        // inset absolutely positioned children, so a notch would otherwise clip
        // a word the placement logic believed was safely inside.
        top: "env(safe-area-inset-top, 0px)",
        right: "env(safe-area-inset-right, 0px)",
        bottom: "env(safe-area-inset-bottom, 0px)",
        left: "env(safe-area-inset-left, 0px)",
      }}
    >
      {/* Hidden ruler. Deliberately without .mosh-text: that class animates a
          transform, and transforms are included in getBoundingClientRect. */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className={`${TYPE} pointer-events-none absolute left-0 top-0 opacity-0`}
        style={{ visibility: "hidden", contain: "layout" }}
      />

      {live.map(l => (
        <div
          key={l.key}
          className="absolute"
          style={{
            left: `${l.cx}px`,
            top: `${l.cy}px`,
            // Rotation lives on this wrapper because the .mosh-phrase child
            // animates transform, and the later animation would otherwise win.
            transform: `translate(-50%, -50%) rotate(${l.deg}deg)`,
          }}
        >
          <div
            className="mosh-phrase"
            style={{
              position: "relative",
              fontSize: `${l.fontSize}px`,
              opacity: l.dim,
              ["--life" as string]: `${l.life}ms`,
            }}
          >
            <span
              className={`mosh-text ${TYPE} block`}
              data-text={l.word}
              style={l.accent ? { color: "hsl(var(--accent))" } : undefined}
            >
              {l.word}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
