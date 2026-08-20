# Sitewide Forge + Journey storefront background

## Purpose

Run Ether-MOSH's Forge (procedural, camera-free) + Journey (auto-evolving
composition/effect director) as an animated background behind every page of
the Aesthetic Rebellion Shopify store, without hurting page speed, SEO, or
readability of actual store content (prices, buttons, product text).

## Non-goals

- No camera/mic input, no auth, no Supabase/Stripe calls, no analytics
  dependency. This is a self-contained visual generator with zero network
  calls after its own script loads.
- Not an interactive instrument on the storefront — visitors don't control
  it. It just runs.
- Not present in this design: syncing the background's palette to the
  product/collection being viewed. Out of scope for v1; the seed/palette are
  independent of what's on the page.

## Architecture

Two separately-built, lazy-loaded bundles, both compiled from the existing
Ether-MOSH engine source (`src/engine/*`) via a new dedicated Vite config —
**not** the full app (no React, no router, no auth, no Supabase, no Stripe).

### Bundle A — `mosh-bg-lite.js` (first paint)

- New entry point: `src/embed/backgroundLite.ts`.
- Pulls in only: `forgeSource.ts`, `forgeGenerators/*`, `forgeCompose.ts`,
  `forgeKaleidoscope.ts`, `forgePalettes.ts` (incl. `seededPalette`),
  `seed.ts`.
- On load: creates a `<canvas>` inside `#mosh-bg-root` (see Shopify
  integration below), sized to `window.innerWidth/innerHeight` with
  `devicePixelRatio` capped at 1.5, and starts a `requestAnimationFrame`
  loop calling `paintForgeSource` each frame.
- A lightweight local timer (not the full `journeyDirector`, which is
  effect-stack/GPU-specific) swaps the active generator and re-derives a
  palette via `seededPalette` every 20-40s (randomized interval within that
  band, itself seed-derived so it's deterministic per session). This gives
  "journey-lite" behavior — motion and evolving composition — without
  pulling in the WebGL effect system.
- Seed: `randomSeed()` (already exists in `seed.ts`) called once per page
  load — new seed every session, per the "random per session" decision.
  Not persisted (no localStorage/cookie) — every fresh pageview session
  gets its own look, consistent with existing Forge behavior elsewhere in
  the app.
- No error can escape this module to the rest of the page: the whole boot
  sequence is wrapped in try/catch; failure means no background renders,
  nothing else breaks.

### Bundle B — `mosh-bg-full.js` (upgrade)

- New entry point: `src/embed/backgroundFull.ts`.
- Pulls in: `Renderer.ts` (`MoshRenderer`, Three.js), `effects.ts`,
  `effectRegistry.ts`, `compose.ts`, `artDirector.ts`, `journeyDirector.ts`,
  `modulators.ts`, plus the same Forge modules as Bundle A (Forge output is
  the WebGL source texture the effect pipeline processes).
- Bundle A, after its first successful frame, schedules Bundle B's load via
  `requestIdleCallback` (with a `setTimeout(…, 2500)` fallback for browsers
  without it) using a dynamic `import()` — code-split, never blocking
  initial page render.
- On successful init (WebGL context created, first frame rendered), Bundle
  B's canvas is inserted, opacity-transitioned in over ~600ms, and Bundle
  A's canvas + rAF loop are torn down and removed once the transition
  completes.
- Runs the real `journeyDirector` against the Forge source, cycling
  composition and the full effect catalog over time — this is "real"
  Journey mode.
- **Capability capping (not fallback):** device class is read once at boot
  via a simple heuristic (`matchMedia('(pointer: coarse)')` OR viewport
  width < 768 OR `navigator.hardwareConcurrency <= 4` treated as "capped").
  Capped devices still run the full WebGL engine, but with: render-target
  resolution capped lower, max concurrent effect layers reduced (e.g. 2
  instead of 4), and the costliest effect categories
  (`dimension`/recursive-zoom effects) excluded from Journey's random pool.
  This is a *parameter*, not a code fork — same bundle, different config
  object passed to `journeyDirector`/`MoshRenderer` at init.
- If Bundle B fails to load or throws during init (WebGL unavailable,
  context creation failure, any exception), catch it, discard Bundle B
  entirely, and leave Bundle A running indefinitely. The storefront must
  never end up with a blank or broken background.
- `prefers-reduced-motion` is explicitly **not** checked — animates for all
  visitors, per explicit decision in brainstorming.

## Shopify integration (`aesthetic-rebellion-theme` repo)

In `layout/theme.liquid`, immediately after `<body>` opens:

```liquid
<div id="mosh-bg-root" aria-hidden="true"
     style="position:fixed;inset:0;z-index:-1;overflow:hidden;isolation:isolate;">
  <div id="mosh-bg-scrim"
       style="position:absolute;inset:0;z-index:1;
              background:rgba(10,8,14,0.72);backdrop-filter:blur(18px);
              -webkit-backdrop-filter:blur(18px);"></div>
</div>
<script type="module" src="{{ 'mosh-bg-lite.js' | asset_url }}" defer></script>
```

- `mosh-bg-lite.js` and (once built) `mosh-bg-full.js` are committed as
  static files under `aesthetic-rebellion-theme/assets/`, served from
  Shopify's own CDN — no third-party origin in the request path.
- `isolation: isolate` on `#mosh-bg-root` guards against the surrounding
  theme's own stacking contexts fighting the `z-index: -1` placement; this
  needs a real visual check against the live theme during implementation,
  since Shopify themes vary in how their own layout establishes stacking
  contexts. Flagged as a verification step, not assumed correct by
  construction.
- The scrim's opacity/blur values (0.72 / 18px) are a starting point tuned
  for legibility, not a hard requirement — expect to adjust after seeing it
  against real product/collection/cart pages.
- Canvas elements themselves are created by the JS bundles at runtime
  inside `#mosh-bg-root`, below the scrim (`z-index: 0` implicit, scrim is
  `z-index: 1`).

## Data flow

None beyond the local render loop. No requests to Supabase, no auth, no
analytics beacon, nothing that touches cart/checkout/order state. The two
script tags are the only new network requests, both same-origin (Shopify's
own asset CDN).

## Error handling summary

1. Bundle A boot failure → caught, no background, rest of page unaffected.
2. Bundle B load/init failure → caught, discarded, Bundle A keeps running.
3. Bundle B runtime failure after mount (an exception inside the render
   loop) → caught per-frame; on failure, tear down Bundle B and remount
   Bundle A rather than leaving a frozen/broken WebGL canvas on screen.
4. Neither bundle may block, delay, or throw in a way that affects First
   Contentful Paint or any other page functionality (nav, cart, checkout).

## Testing / verification plan

No unit-test framework exists in the theme repo (Liquid + vanilla JS), so
this is manual verification against a Shopify CLI theme dev preview:

- Lite version paints within ~1 frame of script execution.
- Full engine swap-in happens without a visible pop (opacity transition
  covers it) somewhere in the 2-4s range after load.
- Text/prices/buttons stay legible over the scrim on a real product page,
  collection page, and cart drawer.
- Chrome DevTools mobile throttling (CPU 4x slowdown + Slow 4G) confirms
  the capped config kicks in and frame rate stays acceptable rather than
  the page becoming unresponsive.
- Killing network mid-load (block the `mosh-bg-full.js` request) confirms
  Bundle A keeps running indefinitely with no console errors surfacing to
  the user.
- Lighthouse/PageSpeed run before/after on the homepage and a product page
  to confirm no regression to Core Web Vitals (LCP in particular, since
  the scrim + canvas sit behind above-the-fold content).

## Build

New `vite.bg.config.ts` in the Ether-MOSH repo with two entries
(`backgroundLite`, `backgroundFull`), output to `dist-bg/`. Output files
copied into `aesthetic-rebellion-theme/assets/` as part of finishing the
implementation (manual copy for v1 — no CI pipeline wiring the two repos
together yet; that's a reasonable future improvement but out of scope
here).
