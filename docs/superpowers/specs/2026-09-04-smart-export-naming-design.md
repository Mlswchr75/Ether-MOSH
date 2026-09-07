# Smart Export Naming — Design Spec

## Overview

Every MOSH export currently gets a generic, non-descriptive filename (`mosh-1755649234.png`, `mosh-7s_loop.gif`). This feature replaces the generic/timestamp part of each filename with a short, content-aware, SEO-rich keyword slug generated from what's actually on screen at export time — the active effect stack, palette (Forge), generator, kaleidoscope state, and audio/intensity energy. No AI call, no pixel analysis: purely `$0`, instant, deterministic, derived from state MOSH already holds.

Example: `mosh-1755649234.png` → `mosh-neon-glitchcore-dreamwave-4f2a.png`

## Scope

**In scope** — 10 export surfaces, matched against the current codebase (verified 2026-09-04, `Ether-MOSH @ d8c796f`):

| # | Surface | File | Current filename |
|---|---|---|---|
| 1 | Screenshot | `Editor.tsx` (`takeScreenshot`) | `mosh-${Date.now()}.png` |
| 2 | Share | `Editor.tsx` (`shareCurrent`) | `mosh-${Date.now()}.jpg` |
| 3 | GIF loop | `Editor.tsx` (`captureGif`) | `mosh-${Date.now()}_${dur}s_loop.gif` |
| 4 | Video recording | `Editor.tsx` (`toggleRecord`) | `mosh-${Date.now()}.${rec.extension()}` |
| 5 | Best-frame still | `Editor.tsx` (`exportBestStill`) | `mosh-${Date.now()}_${still\|tileable-remaster}.png` |
| 6 | Print-ready 5K/8K | `Editor.tsx` (`exportPrintStill`) → `src/engine/printExport.ts` | `${baseName}_${w}x${h}_${dpi}dpi_print-ready.${ext}` — `baseName` is currently the first 3 active (non-hidden) effect ids joined by `-`, or `forge-<seed>`, or `visual` |
| 7 | Forge PNG export | `ForgePanel.tsx` | `ether-mosh-forge-${seed}_${size}x${size}_${dpi}dpi[_seamless-tile].png` |
| 8 | Seamless tileable | `SeamlessPanel.tsx` | `mosh-${Date.now()}_tileable_${dpi}dpi.png` |
| 9 | Motif Maestro tile/repeat | `MotifMaestroPanel.tsx` | `motif-maestro-${seed}-${tile\|repeat}_${dpi}dpi.png` |
| 10 | Platform deliverables (Reels/TikTok/Shorts) | `Editor.tsx` (`exportDeliverable`) → `src/engine/deliverables.ts` (`deliverableFilename`) | `mosh-${spec.id}-${timestamp}.${ext}` |

**Out of scope**: the 2 Lottie sticker exports in `StickerCapture.tsx` (`.json`/`.gif`) — different content type (a traced vector sticker shape, not the moshed visual), and the Favorites CSV/JSON exports in `Favorites.tsx` — metadata dumps, not visual material.

**Important integration principle**: surface #6 (print-ready) already has a crude precursor (`baseName` from raw effect ids). This feature **replaces that computation**, not the surrounding filename convention. At every surface, `generateSmartName()` produces only the descriptive keyword slug — each site's own dimensions/DPI/suffix/extension formatting is untouched. This is a narrow, additive change: no site's filename *structure* changes, only the part that was `Date.now()` or a crude id/effect-id join.

## Architecture

One new module: `src/engine/smartName.ts`

```ts
export type NameContext = {
  /** Active, non-hidden effect ids currently stacked (any source mode). */
  activeEffectIds: string[];
  /** Forge-only: current palette, generator, kaleidoscope fold count. */
  forge?: {
    palette: [string, string, string];
    generatorId: string;
    kaleidoscopeFolds: number | null;
  };
  /** 0..1 — live audio energy if mic/device-audio is on, else the manual intensity slider. */
  energy: number;
};

export function generateSmartName(ctx: NameContext): string; // returns slug only, no extension, no prefix
```

`buildNameContext()`, a small companion helper in the same module, assembles a `NameContext` from `useStore.getState()` — this is what each of the 10 call sites actually calls, so they don't each hand-assemble the context.

Each call site's existing filename template swaps its `Date.now()` / crude-baseName piece for `generateSmartName(buildNameContext())`, wrapped in the existing `mosh-` (or `ether-mosh-`/`motif-maestro-`) prefix each site already uses. Surface #6 additionally reuses the existing `safeName()` slugifier from `printExport.ts` as a defense-in-depth pass (smart names are already filename-safe by construction, but running it through the same sanitizer the rest of that path already trusts costs nothing and guarantees consistency). Surface #10 (`deliverableFilename`) keeps `spec.id` (the platform identifier, e.g. `reels`/`tiktok` — functionally meaningful, used elsewhere for validation) and only replaces the raw ISO timestamp suffix with the smart slug: `mosh-${spec.id}-${smartSlug}.${ext}`.

## Keyword Bank & Selection Algorithm

Organized as weighted category tables, each tied to a `NameContext` signal:

| Signal | Example terms |
|---|---|
| **Color mood** (Forge only — from palette hex → hue/saturation/lightness) | neon, pastel, vaporwave, cyberpunk, monochrome, iridescent, holographic, duotone, chromatic |
| **Effect category** (dominant category among `activeEffectIds`) | corruption→glitchcore, datamosh, vhsglitch · color→chromaticwave, prism, colorshift · geometry→kaleidoscope, fractal, sacredgeometry · atmosphere→dreamcore, liminal, hazyvibes · dimension→depthwarp, dimensional |
| **Forge generator** (Forge only) | driftField→liquidmotion · shatterField→shatteredglass · pourBloom→paintpour · volumetricBloom→volumetricglow · kaleidoscope folds set→mandala |
| **Energy** (`ctx.energy`) | high→ravevisuals, beatdrop, hyperpop · low→ambientvibes, lofi, dreamy |

**Selection**: score every bank entry against which signals are active (continuous, not just discrete category membership — e.g. a highly saturated palette scores both `neon` and `cyberpunk` higher than a muted one), pick the top 2–3 non-redundant terms via weighted-random among near-ties, join with `-`, append a 4-char random hex id.

**Forge signals are conditional on live mode, not on which button was pressed.** Surfaces 1, 2, 3, 4, 5, 6, 8, and 10 are all mode-agnostic — the first six already gate on `isForge` for paywall purposes (confirming Forge is a real, supported path for them), and Seamless tileable (8) has no mode check at all, operating on whatever's currently on canvas. `buildNameContext()` includes the `forge` sub-object whenever `useStore.getState().sourceMode === "forge"` at export time, regardless of which of the 10 surfaces triggered it. Only surfaces 7 (Forge PNG) and 9 (Motif Maestro) are Forge-exclusive by nature — both read `forge.seed` directly with no non-Forge fallback. When `forge` isn't populated (non-Forge mode), selection falls back to `activeEffectIds` + `energy` only — typically 1–2 terms rather than the fuller 2–3 a Forge context can draw on. Even a single well-chosen term beats `Date.now()`.

**No-signal fallback**: blank canvas / no effects / default state → small always-available pool (`aesthetic`, `moodboard`, `visualart`) so the slug is never empty.

## Testing

Pure unit tests on `generateSmartName()` and `buildNameContext()` — synthetic `NameContext` fixtures (all-corruption stack, all-geometry stack, Forge + kaleidoscope, no-signal blank state), asserting the output contains an expected-category term and matches `/^[a-z0-9-]+$/`. No visual/snapshot testing needed.

## Non-goals / explicitly deferred

- No AI vision call, no pixel/canvas color analysis — everything comes from live app state.
- No dedup against past export names — the random id suffix makes collisions negligible.
- No change to any of the 10 sites' dimensions, DPI, quality, or paywall/gating logic — only the descriptive-name portion of the filename changes.
- Lottie sticker exports and Favorites CSV/JSON exports are untouched.
