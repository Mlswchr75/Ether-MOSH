/**
 * Roaming hero phrases — the editor empty-state's ambient copy.
 *
 * One phrase at a time glitches in somewhere on screen, holds, and glitches
 * out. Two hard guarantees drive the whole design:
 *
 *   1. A phrase is never clipped by a screen edge.
 *   2. A phrase never covers the Go Live button.
 *
 * Both need the text's *rendered* size before it is placed, and that size
 * depends on the font, the weight and the negative tracking — so it is measured
 * rather than estimated, using a hidden span carrying the identical typography.
 * Estimating from character count drifts badly between "MOSH" and
 * "SELECT A FOLDER" at 2.5x scale, which is exactly when a mistake clips.
 *
 * The exception to rule 2 is deliberate: a phrase wide enough to span most of
 * the frame is allowed to sit under the button, because at that size there is
 * nowhere on screen it could go that wouldn't collide, and reading it *behind*
 * the button looks intentional rather than broken. The layer always renders
 * beneath the button, so that case needs no special z-handling.
 */
import { useEffect, useRef, useState } from "react";

const PHRASES = [
  "TAP TO GO LIVE",
  "BROWSE",
  "DROP AN IMAGE",
  "PASTE",
  "SELECT A FOLDER",
  "DEMO",
  "MOSH",
];

/** Typography shared by the measuring span and the visible phrase. Any drift
 *  between the two silently breaks the no-clipping guarantee. */
const TYPE = "font-sans font-bold tracking-tighter leading-[0.9] whitespace-nowrap";

/** Longest a single phrase is ever on screen, including its in and out. */
const LIFE_MIN = 1050;
const LIFE_MAX = 1500;
const GAP_MIN = 140;
const GAP_MAX = 380;

/** Beyond this share of the frame's width, a phrase may pass behind the button. */
const SPANS_FRAME = 0.62;

type Placement = {
  key: number;
  phrase: string;
  left: number;
  top: number;
  fontSize: number;
  life: number;
};

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export type Rect = { l: number; t: number; r: number; b: number };

/**
 * Pick a landing spot for a phrase of measured size `tw` x `th`.
 *
 * Pure and separated from the DOM so the two guarantees this component makes
 * can actually be tested: the returned box always sits inside the margins, and
 * it never intersects `blocked` unless the phrase is wide enough to be allowed
 * behind it. Returns null when neither can be satisfied — the caller skips the
 * beat rather than covering the button.
 */
export function choosePosition(opts: {
  W: number; H: number;
  tw: number; th: number;
  margin: number;
  blocked: Rect | null;
  spansFrame: boolean;
  rng: () => number;
  tries?: number;
}): { left: number; top: number } | null {
  const { W, H, tw, th, margin, blocked, spansFrame, rng } = opts;

  // Cannot be placed without clipping, at any position.
  if (tw > W - margin * 2 || th > H - margin * 2) return null;

  const leftMax = Math.max(margin, W - margin - tw);
  const topMax = Math.max(margin, H - margin - th);

  for (let i = 0; i < (opts.tries ?? 24); i++) {
    const left = margin + rng() * (leftMax - margin);
    const top = margin + rng() * (topMax - margin);
    if (!spansFrame && blocked) {
      const hits =
        left < blocked.r && left + tw > blocked.l &&
        top < blocked.b && top + th > blocked.t;
      if (hits) continue;
    }
    return { left, top };
  }
  return null;
}

export function RoamingPhrases({ buttonRef }: { buttonRef: React.RefObject<HTMLElement | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);

  const bagRef = useRef<string[]>([]);
  const lastRef = useRef<string>("");
  const keyRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    /** Bag shuffle — every phrase shows once before any repeats. */
    const nextPhrase = (): string => {
      if (!bagRef.current.length) {
        const bag = PHRASES.slice();
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        // Don't let a bag refill repeat the phrase that just left the screen.
        if (bag.length > 1 && bag[bag.length - 1] === lastRef.current) {
          [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
        }
        bagRef.current = bag;
      }
      const p = bagRef.current.pop()!;
      lastRef.current = p;
      return p;
    };

    const compute = (): Placement | null => {
      const host = hostRef.current;
      const meas = measureRef.current;
      if (!host || !meas) return null;

      const box = host.getBoundingClientRect();
      const W = box.width;
      const H = box.height;
      if (W < 80 || H < 80) return null;

      const phrase = nextPhrase();
      const margin = Math.max(10, Math.min(W, H) * 0.03);

      // Base tracks the original hero (10vw, clamped); the multiplier spans
      // "slightly smaller than before" to "quite a bit larger".
      const base = Math.min(Math.max(W * 0.1, 30), 92);
      let fontSize = base * rand(0.75, 2.5);

      meas.textContent = phrase;
      meas.style.fontSize = `${fontSize}px`;
      let m = meas.getBoundingClientRect();
      if (!m.width || !m.height) return null;

      // Scale down anything that cannot fit inside the margins. This is what
      // makes the no-clipping guarantee hold for long phrases at large sizes
      // instead of merely being unlikely.
      const maxW = W - margin * 2;
      const maxH = H - margin * 2;
      if (m.width > maxW || m.height > maxH) {
        fontSize *= Math.min(maxW / m.width, maxH / m.height);
        meas.style.fontSize = `${fontSize}px`;
        m = meas.getBoundingClientRect();
      }
      const tw = m.width;
      const th = m.height;

      const spansFrame = tw > W * SPANS_FRAME;

      const btn = buttonRef.current?.getBoundingClientRect();
      const gap = 16;
      const blocked = btn && btn.width
        ? {
            l: btn.left - box.left - gap,
            t: btn.top - box.top - gap,
            r: btn.right - box.left + gap,
            b: btn.bottom - box.top + gap,
          }
        : null;

      const spot = choosePosition({
        W, H, tw, th, margin, blocked, spansFrame, rng: Math.random,
      });
      // Nowhere clear to land this beat. Skipping is the right failure: the
      // next tick rerolls size and phrase, and covering the button is worse
      // than a short pause.
      if (!spot) return null;

      return {
        key: ++keyRef.current,
        phrase,
        left: spot.left,
        top: spot.top,
        fontSize,
        life: rand(LIFE_MIN, LIFE_MAX),
      };
    };

    if (reduced) {
      // One phrase, centred, no roaming — the animation is the whole effect,
      // so with it disabled there is nothing to gain from moving the text.
      const host = hostRef.current;
      const meas = measureRef.current;
      if (host && meas) {
        const box = host.getBoundingClientRect();
        const size = Math.min(Math.max(box.width * 0.1, 30), 92);
        meas.textContent = PHRASES[0];
        meas.style.fontSize = `${size}px`;
        const m = meas.getBoundingClientRect();
        setPlace({
          key: 1,
          phrase: PHRASES[0],
          left: Math.max(0, (box.width - m.width) / 2),
          top: Math.max(0, (box.height - m.height) / 2 - box.height * 0.18),
          fontSize: size,
          life: 0,
        });
      }
      return;
    }

    let timer: number | undefined;
    let cancelled = false;

    const beat = () => {
      if (cancelled) return;
      const next = compute();
      if (next) {
        setPlace(next);
        timer = window.setTimeout(beat, next.life + rand(GAP_MIN, GAP_MAX));
      } else {
        setPlace(null);
        timer = window.setTimeout(beat, 260);
      }
    };

    // Let layout settle so the first measurement sees real geometry.
    timer = window.setTimeout(beat, 60);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [buttonRef]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden"
      style={{
        // Inset by the safe area directly: padding on an ancestor does not
        // inset absolutely positioned children, so a notch would otherwise
        // clip a phrase the placement logic believed was safely inside.
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

      {place && (
        <div
          key={place.key}
          className="mosh-phrase"
          style={{
            left: `${place.left}px`,
            top: `${place.top}px`,
            fontSize: `${place.fontSize}px`,
            ["--life" as string]: `${place.life}ms`,
          }}
        >
          <span className={`mosh-text ${TYPE} block`} data-text={place.phrase}>
            {place.phrase}
          </span>
        </div>
      )}
    </div>
  );
}
