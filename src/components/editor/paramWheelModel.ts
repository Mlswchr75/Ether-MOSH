import type { ReactNode } from "react";

/**
 * The Parameters Wheel's content model.
 *
 * Kept separate from the component so the tree of nodes — every control that
 * used to live in the below-the-fold menu rack — can be built and tested as
 * plain data, without a DOM or a rendered wheel.
 */

export type WheelScalar = {
  value: number;
  min: number;
  max: number;
  /** Quantization when scrubbing. Omit for continuous. */
  step?: number;
  /** Value shown in the hub while engaged. */
  format?: (value: number) => string;
  set: (value: number) => void;
  /** Long-press on the slot restores this. */
  reset?: () => void;
};

export type WheelItem = {
  id: string;
  label: string;
  /** Two or three characters shown in the slot itself; the full label lives in the hub. */
  glyph?: ReactNode;
  /** Fires on tap in a browser ring — auditions without keeping. */
  preview?: () => void;
  /** Fires on long-press — audition and keep in one gesture. */
  commit?: () => void;
  /** Secondary line under the slot — usually the live value. */
  detail?: string;
  /** Drills into another node. */
  branch?: string;
  /** Fires immediately on tap. */
  action?: () => void;
  /** Binds the outer arc scrubber when tapped. */
  scalar?: WheelScalar;
  /** Renders as engaged/on. */
  active?: boolean;
  tone?: "accent" | "danger";
  disabled?: boolean;
};

/**
 * How a node fills the wheel.
 *
 * `ring` is the default: one ring of at most eight, paging when it overflows.
 *
 * `browser` is for a list far longer than anything it contains — the effect
 * catalogue, which is 117 entries deep while any single effect has at most a
 * handful of parameters. It puts the list on the *outermost* ring, where the
 * circumference is greatest and roughly twice as many fit per page, and puts
 * the selected entry's own parameters on a ring *inward* of it. Branching
 * outward would waste the big ring on three items and strand the long list on
 * the small one; this way each ring gets the population it suits.
 */
export type WheelLayout = "ring" | "browser";

export type WheelNode = {
  id: string;
  title: string;
  subtitle?: string;
  /** Hub tap goes here. Absent on the root, where the hub closes the wheel. */
  parent?: string;
  items: WheelItem[];
  layout?: WheelLayout;
  /** `browser` only: the selected entry's own controls, drawn on the inner ring. */
  inner?: WheelItem[];
  /** `browser` only: what the commit button in the hub does, when there is something to commit. */
  onCommit?: () => void;
  /** `browser` only: label for the commit button — names what would be kept. */
  commitLabel?: string;
};

export type WheelTree = Record<string, WheelNode>;

/** Slots one ring-layout page can hold, chevrons included. */
export const PAGE_SIZE = 8;
/**
 * Slots one browser page can hold. The outermost ring has the most
 * circumference to spend, so it carries roughly twice a normal ring — 12
 * entries plus two chevrons — while still leaving every neighbour further
 * apart than a 44px touch target on a phone.
 */
export const BROWSER_PAGE_SIZE = 14;

export function pageCount(items: number, size = PAGE_SIZE): number {
  if (items <= size) return 1;
  return Math.ceil(items / (size - 2));
}

/**
 * The slice of a node's items shown on `page`, plus whether chevrons are
 * needed. Paging rather than piling everything onto one ring is deliberate:
 * pie-menu breadth past ~8 items measurably costs accuracy, while extra depth
 * costs only reaction time (docs/MOBILE_UX_AUDIT.md §8).
 */
export function pageSlice(items: WheelItem[], page: number, size = PAGE_SIZE): {
  items: WheelItem[];
  pages: number;
  page: number;
  paged: boolean;
} {
  const pages = pageCount(items.length, size);
  if (pages === 1) return { items, pages: 1, page: 0, paged: false };
  const perPage = size - 2;
  const clamped = ((page % pages) + pages) % pages;
  const start = clamped * perPage;
  return {
    items: items.slice(start, start + perPage),
    pages,
    page: clamped,
    paged: true,
  };
}

/** Value → 0..1 within a scalar's range. */
export function scalarFraction(scalar: WheelScalar): number {
  const span = scalar.max - scalar.min;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (scalar.value - scalar.min) / span));
}

/** 0..1 → a value snapped to the scalar's step and clamped to its range. */
export function scalarFromFraction(scalar: WheelScalar, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  const raw = scalar.min + clamped * (scalar.max - scalar.min);
  if (!scalar.step) return raw;
  const snapped = Math.round((raw - scalar.min) / scalar.step) * scalar.step + scalar.min;
  return Math.min(scalar.max, Math.max(scalar.min, snapped));
}

export function formatScalar(scalar: WheelScalar): string {
  if (scalar.format) return scalar.format(scalar.value);
  const span = scalar.max - scalar.min;
  if (scalar.step && scalar.step >= 1) return String(Math.round(scalar.value));
  return scalar.value.toFixed(span > 20 ? 0 : 2);
}

/**
 * Walk from a node up to the root, nearest-last, for the hub's breadcrumb.
 * Defensive against a malformed tree: a cycle returns what it has rather than
 * spinning, because this runs during render.
 */
export function breadcrumb(tree: WheelTree, nodeId: string): WheelNode[] {
  const trail: WheelNode[] = [];
  const seen = new Set<string>();
  let current: string | undefined = nodeId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node: WheelNode | undefined = tree[current];
    if (!node) break;
    trail.unshift(node);
    current = node.parent;
  }
  return trail;
}

export type WheelAnchor = { x: number; y: number };

/**
 * Clamp the wheel's centre so the whole ring stays on screen, with a margin
 * for the safe area.
 *
 * Summoning at the gesture's own centroid rather than at a fixed viewport
 * centre is the point of the whole surface: the finger is already somewhere
 * the thumb can comfortably reach, because that is where the user put it. A
 * viewport-centred wheel puts half its circumference in the stretch zone,
 * where tap accuracy measurably collapses (docs/MOBILE_UX_AUDIT.md §8).
 *
 * When the viewport is too small for the wheel plus its margins in an axis,
 * that axis centres instead — an unsatisfiable clamp would otherwise invert
 * and throw the wheel off screen entirely.
 */
export function clampAnchor(
  x: number, y: number, size: number, width: number, height: number, inset = 8,
): WheelAnchor {
  const half = size / 2 + inset;
  return {
    x: width <= size + inset * 2 ? width / 2 : Math.min(width - half, Math.max(half, x)),
    y: height <= size + inset * 2 ? height / 2 : Math.min(height - half, Math.max(half, y)),
  };
}

/**
 * Wheel diameter for a viewport. Capped shorter against height than width so
 * a phone in portrait keeps the ring inside the comfortable thumb arc rather
 * than stretching it to the top of the screen.
 */
export function wheelSizeFor(width: number, height: number): number {
  return Math.min(width * 0.86, height * 0.72, 520);
}
