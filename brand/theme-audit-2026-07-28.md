# Theme audit + sticky search build — 2026-07-28

Store: aestheticrebellion.store

## What was asked

1. Verify recent changes across the last several themes actually reached the live theme.
2. Duplicate the live theme under a real name (not "copy of copy of").
3. Add a five-part sticky search feature.
4. **Constraint:** do not disturb the mosh/glitch effects, the product cards, or
   anything else already looking and working well.

## Theme inventory at time of audit

| Theme | ID | Role |
| --- | --- | --- |
| AR — JSON-LD staging (SEO) | 158348443875 | unpublished |
| AR — immersive gallery (build) | 158422532323 | unpublished |
| Updated copy of Allure — bugfix | 159196348643 | unpublished |
| Updated copy of MOSH glitch UI (preview) | 159218630883 | unpublished |
| Copy of AR — Live v3 | 159247204579 | unpublished |
| **Updated MOSH Build** | 159259230435 | **MAIN (live)** |
| Updated copy of Updated MOSH Build | 159291736291 | unpublished |
| CL Mosh Build | 159296454883 | unpublished |
| **AR — Search & Discovery** | **159334826211** | **unpublished (new, this session)** |

`Updated MOSH Build` was published by the owner between sessions, so it — not
`Copy of AR — Live v3` — is the correct duplication base.

## New theme

**AR — Search & Discovery** — `gid://shopify/OnlineStoreTheme/159334826211`,
duplicated from live `Updated MOSH Build`.

### Preservation check (post-change)

Every file below is byte-identical to live, verified by MD5, *after* all edits:

| File | Bytes | MD5 |
| --- | --- | --- |
| `assets/mosh-fx.js` | 8990 | `d8e1b80c9f8ecae63abdb3980aad4b4d` |
| `assets/mosh-glitch.css` | 7067 | `9c5e389e6598833092b82f46c44ec449` |
| `snippets/product-card.liquid` | 16226 | `1f31d2ad960985711b9d772e953d0955` |
| `assets/brutalist-skin.css` | 13101 | `c17dd0fdee9a2ff5cad649ad2b33ff63` |
| `snippets/ar-newsletter-widget.liquid` | 11715 | `896fcb1603c0481edf30436568e6a109` |
| `snippets/structured-data-ar.liquid` | 16626 | `8740f9831bc299b69564349e7deadadb` |
| `snippets/ar-moshfit-trigger.liquid` | 3299 | `81a00ee7c57b47caa531bf9371822128` |
| `templates/robots.txt.liquid` | 3703 | `5a9e26b9a2446f80c6fea73d7df1a189` |

## Changes made

### 1. Sticky search — four new/changed files

- `snippets/cl-sticky-search-bar.liquid` (1943 B) — markup; self-loads its own
  CSS and JS, so no layout-level asset tags were needed.
- `assets/cl-sticky-search.css` (5938 B) — accent `#FF2BD6`, matching the brand.
- `assets/cl-sticky-search.js` (10195 B) — **corrected** before install, see below.
- `layout/theme.liquid` — 6020 → 6061 B. Exactly one insertion, `+41` bytes:
  `{%- render 'cl-sticky-search-bar' -%}` after `{%- sections 'header-group' -%}`.
  The pre-edit transcription was verified against live's MD5
  (`bca34451251649a8b9c19f8f390c76b5`) so the +41 delta is provably the only change.

#### Bugs fixed in the search JS before installing

The `CL Mosh Build` draft of this script had three defects:

1. `resources[fields]` — **not a real parameter**. The correct form is
   `resources[options][fields]`. Shopify silently ignores unknown params, so the
   field list was being dropped and search fell back to titles only. Tags, body
   copy, SKUs and vendor were never actually queried.
2. `tags` — the API field is singular, `tag`. Would have been rejected.
3. Hardcoded `/search/suggest.json` — breaks under the `/de`, `/es`, `/fr` and
   `/ja` locale subfolders. Now built from `window.Shopify.routes.root`.

Also hardened: `thumb()` now handles both `?` and `&` in CDN URLs, bubble data
attributes are escaped, and the DOM guard covers all six element references.

#### Requirement 5 is only partially achievable

The spec asked to query "titles, vendor, product types, tags, variants,
**metafields**, and body descriptions."

**Shopify's Predictive Search API does not support metafields.** The supported
set is exactly: `title`, `product_type`, `variants.title`, `vendor`, `tag`,
`body`, `variants.sku`, `variants.barcode`, `author`. All eight applicable
fields are wired up; metafields are not reachable through this API at all.
Covering them would require a different mechanism (a search app, or mirroring
the metafield values into tags).

### 2. Focal collection carousel — ported forward

`blocks/ai_gen_block_d2d4f01.liquid`, 12165 → 14257 B, taken verbatim from
`AR — immersive gallery (build)` (MD5 `dc21bd40d4b2abf8f8c67886b396f054`,
confirmed after write). Schema settings are unchanged — same ids, same defaults
— so existing theme-editor settings carry over untouched.

Two real bugs in the live version are fixed by this:

1. **Visible seam in the infinite loop.** The live CSS animates
   `translateX(calc(-100% / 2))`, and a CSS transform percentage resolves
   against the element's *own* border box. The track had no width declaration,
   so it sized to the container (100%), not to its content. The loop therefore
   translated by half the *container* width while the content was twice the
   *card* run — the two match only by coincidence, so the loop jumped. The
   ported version sets `width: max-content` and drives the scroll from measured
   `offsetWidth` in a rAF loop, making the loop seamless by construction.
2. **`customElements.define` called unguarded**, which throws if the block
   appears twice on a page or the section re-renders in the theme editor. Now
   guarded by `customElements.get()`.

Incidental wins: IntersectionObserver thresholds cut from 101 to 5; `dt` capped
at 100 ms so a tab-switch no longer causes a jump; touch pause added; hover
pause moved into JS so a theme CSS override cannot defeat it. The live version's
`disconnectedCallback` also passed a fresh arrow function to
`removeEventListener`, so it removed nothing — that dead code is gone.

## Deliberately NOT ported — immersive product gallery

`AR — immersive gallery (build)` also contains `assets/ar-product-gallery.css`,
`assets/ar-product-gallery.js` and `snippets/ar-product-gallery.liquid`, wired
in by reducing `snippets/product-media.liquid` from 21334 B to a 535 B delegator
that swaps the whole product-page gallery on `template == 'product'`.

**Held back on purpose.** It is not an additive change — it replaces the entire
product media experience, and the replacement drops:

- variant→image sync (`js-product-gallery-slide-variant-{{ section.id }}`), so
  choosing a colour would no longer move the gallery to that colour's photo.
  On a POD catalogue this is the most costly regression of the set.
- the zoom modal and custom zoom cursor
- the thumbnail rail
- model/3D and XR button wiring, and the `ProductModelsJSON` payload
  `section-product.build.js` reads

That is squarely "something else that's looking and working good," so it is not
a change to make unilaterally. It remains available in theme 158422532323 and
is a clean rollback either way (the original 21334 B gallery is preserved there
as `snippets/product-media-default.liquid`).

**Owner decision needed** before this one goes anywhere near a published theme.

## Still open (carried forward)

- 7 designs still carry `· P68KT`-style placeholder titles and need real names.
- 29 physical products remain orphaned in the "Vibe-Checked Vectors" smart
  collection; re-saving products and tightening the rule both failed to evict
  them, and the rule change was reverted.
- Product weights are fabric-spec estimates, not Yoycol measurements. Overwrite
  when real figures are available.
- Aesthetic collection assignment is design-dependent and remains the owner's call.

## Note on publishing

This theme is **unpublished**. Nothing here is live until it is published from
the Shopify admin. Theme publishing and writes to the live theme are blocked
through this tooling by design.
