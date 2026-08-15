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
 */
export function sizedSrc(src: string, width: number): string {
  return src.includes("?") ? `${src}&width=${width}` : `${src}?width=${width}`;
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
