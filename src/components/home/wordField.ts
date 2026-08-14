/**
 * Placement maths for the home page's glitching word field.
 *
 * The field scatters MOSH's own vocabulary — BROWSE, MOSH, LINK, GO LIVE,
 * FORGE … — across the landing page at random sizes and orientations. The one
 * hard rule is that no two words may ever touch, and none may touch the hero
 * cluster, the nav or the footer. That rule is only as good as the geometry
 * behind it, so the geometry lives here, pure and tested, rather than inside a
 * component where it can only be verified by looking at it.
 *
 * Two subtleties drive the design:
 *
 *   1. A rotated word occupies a *larger* axis-aligned box than its own width
 *      and height. Testing the unrotated box would let a 90°-turned "GO LIVE"
 *      overlap its neighbours by most of its length, so every test runs against
 *      the rotated extent.
 *   2. Words come and go independently. Placement therefore takes the set of
 *      boxes currently on screen as an argument instead of assuming a fresh
 *      layout, which is what lets a word spawn into a gap another word just
 *      vacated without a full re-shuffle.
 */

export type Rect = { l: number; t: number; r: number; b: number };

const TAU = Math.PI * 2;

/**
 * Axis-aligned bounding box of a `w` x `h` box turned `deg` degrees.
 *
 * At 90° this swaps width and height; at 45° it is larger than either. Used for
 * every overlap test, so a tilted word reserves the space it actually covers.
 */
export function rotatedExtent(w: number, h: number, deg: number): { w: number; h: number } {
  const r = ((deg % 360) / 360) * TAU;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: w * c + h * s, h: w * s + h * c };
}

/** True when two boxes share any area once `pad` is added around each. */
export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.l - pad < b.r + pad &&
    a.r + pad > b.l - pad &&
    a.t - pad < b.b + pad &&
    a.b + pad > b.t - pad
  );
}

/** Box of the given extent centred on (cx, cy). */
export function rectAround(cx: number, cy: number, w: number, h: number): Rect {
  return { l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 };
}

export type PlaceOpts = {
  /** Field size in px. */
  W: number;
  H: number;
  /** Measured, unrotated size of the word. */
  w: number;
  h: number;
  /** Orientation in degrees. */
  deg: number;
  /** Keep-clear border around the field. */
  margin: number;
  /** Boxes already spoken for: live words plus reserved UI. */
  blocked: Rect[];
  /** Breathing room enforced between this word and everything else. */
  gap: number;
  rng: () => number;
  tries?: number;
};

/**
 * Find a centre point where the word fits inside the margins and clears
 * everything in `blocked`.
 *
 * Returns null when no free spot turned up — the caller is expected to skip
 * that spawn rather than place the word anyway. A missing word for one beat is
 * invisible; an overlapping one is the bug this module exists to prevent.
 */
export function placeWord(opts: PlaceOpts): { cx: number; cy: number; rect: Rect } | null {
  const { W, H, w, h, deg, margin, blocked, gap, rng } = opts;
  const ext = rotatedExtent(w, h, deg);

  // Too big to sit inside the margins at any position.
  if (ext.w > W - margin * 2 || ext.h > H - margin * 2) return null;

  const cxMin = margin + ext.w / 2;
  const cxMax = W - margin - ext.w / 2;
  const cyMin = margin + ext.h / 2;
  const cyMax = H - margin - ext.h / 2;

  for (let i = 0; i < (opts.tries ?? 60); i++) {
    const cx = cxMin + rng() * (cxMax - cxMin);
    const cy = cyMin + rng() * (cyMax - cyMin);
    const rect = rectAround(cx, cy, ext.w, ext.h);
    if (blocked.some(b => overlaps(rect, b, gap))) continue;
    return { cx, cy, rect };
  }
  return null;
}

/**
 * Bag shuffle over a word list: every word appears once before any repeats,
 * and a refill never replays the word that just left the screen.
 *
 * Plain random picking clusters — the same word showing three times in ten
 * seconds reads as a bug in a field this sparse.
 */
export function createWordBag(words: readonly string[], rng: () => number = Math.random) {
  let bag: string[] = [];
  let last = "";

  const refill = () => {
    bag = words.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag[bag.length - 1] === last) {
      [bag[bag.length - 1], bag[0]] = [bag[0], bag[bag.length - 1]];
    }
  };

  const take = (idx: number): string => {
    const [word] = bag.splice(idx, 1);
    last = word;
    return word;
  };

  return {
    /**
     * Draw the next word, skipping anything in `exclude` — the word the hero is
     * showing and every word already on screen. Returns null only when the pool
     * holds nothing but excluded words, which the caller should treat as "no
     * spawn this beat" rather than as a reason to repeat one.
     */
    next(exclude?: string | readonly string[]): string | null {
      const blocked = new Set(
        exclude === undefined ? [] : typeof exclude === "string" ? [exclude] : exclude,
      );

      // Two passes: the current bag, then a fresh one. The second is what keeps
      // the exclusion honest when the tail of a bag happens to hold nothing but
      // blocked words — draining and refilling beats handing back a duplicate.
      for (let pass = 0; pass < 2; pass++) {
        if (!bag.length) refill();
        for (let idx = bag.length - 1; idx >= 0; idx--) {
          if (blocked.has(bag[idx])) continue;
          return take(idx);
        }
        bag = [];
      }
      return null;
    },
  };
}
