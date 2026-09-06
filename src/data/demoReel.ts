/**
 * Frames for the home-screen film reel — featured images from the Aesthetic
 * Rebellion catalogue, used as ready-made source material for the instrument.
 *
 * Backed by a static snapshot (`public/demo-reel.json`, regenerated with
 * `node tools/build-demo-reel.mjs`) so the landing page ships no credentials
 * and pays no request latency. Everything downstream goes through
 * `loadDemoFrames`, so swapping in a live Storefront query later means
 * rewriting this one function.
 */

export type DemoFrame = {
  /** Short human-readable product name, for alt text and the frame caption. */
  label: string;
  /** Full-resolution Shopify CDN url. */
  src: string;
  /** Storefront product page, opened when a frame is moshed. */
  productUrl: string;
};

let cache: Promise<DemoFrame[]> | null = null;

/**
 * Fetches the frame pool once per session. Failure is not fatal — the reel
 * simply never spawns, leaving the rest of the page intact.
 */
export function loadDemoFrames(): Promise<DemoFrame[]> {
  cache ??= fetch("/demo-reel.json")
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then((rows: DemoFrame[]) => (Array.isArray(rows) ? rows.filter((r) => r?.src && r?.productUrl) : []))
    .catch(() => []);
  return cache;
}

/**
 * Shopify's CDN resizes on demand. Reel thumbnails only ever paint a few
 * hundred pixels wide, so asking for the 1024px original would waste most of
 * the transfer — but the editor still gets the full-size url.
 *
 * Vector frames are handed back untouched: the CDN's raster transforms don't
 * apply to SVG, and an svg scales to whatever box it lands in anyway, so the
 * parameter would be a request the origin has to reject rather than serve.
 */
export function sizedSrc(src: string, width: number): string {
  if (/\.svg$/i.test(src.split("?")[0])) return src;
  return src.includes("?") ? `${src}&width=${width}` : `${src}?width=${width}`;
}

/**
 * Frames whose image the browser refused to paint.
 *
 * The pool is a snapshot of a catalogue that keeps moving, and it is fetched
 * over a CDN across whatever connection the visitor happens to have — so a url
 * in it can stop resolving for reasons no amount of regenerating fixes: a
 * product image swapped out since the snapshot, a blocked request, a dropped
 * connection mid-scroll. Whatever the cause, a frame that cannot paint has
 * nothing to offer the reel: it can't be looked at and it can't be moshed.
 *
 * Module-level and never cleared, so one failure is enough for the rest of the
 * session — the reel respawns constantly, and re-requesting a url that just
 * failed only buys another broken frame.
 */
const deadFrames = new Set<string>();

/** Records a frame the browser could not load. Idempotent. */
export function markFrameDead(src: string): void {
  deadFrames.add(src);
}

export function isFrameDead(src: string): boolean {
  return deadFrames.has(src);
}

/**
 * The pool minus everything known broken. Called when a reel is being cast
 * rather than held in state, so each new reel picks up every failure seen so
 * far without the pool identity changing under the director mid-flight.
 */
export function liveFrames(pool: readonly DemoFrame[]): DemoFrame[] {
  return deadFrames.size === 0 ? pool.slice() : pool.filter((f) => !deadFrames.has(f.src));
}

/** Test seam — the set is process-wide, so suites have to be able to reset it. */
export function resetDeadFrames(): void {
  deadFrames.clear();
}

/** Fisher-Yates over a copy — callers pass in the shared pool. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
