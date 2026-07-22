# aestheticrebellion.store — Search Console Coverage Remediation

**Source:** Google Search Console → Page Indexing export (`aestheticrebellion.store-Coverage-2026-07-22`)
**Store:** Shopify (Basic), 516 products (all active & published), 27 collections, 666 URL redirects
**Date:** 2026-07-22

---

## TL;DR — most of the "critical issues" are not broken

Google Search Console labels **every** non‑indexed URL a "critical issue," which makes a healthy store look like it's on fire. On this store, roughly **two‑thirds of the flagged URLs are Shopify behaving correctly** and need no action. The real, actionable work is small and specific. Prioritized below.

---

## 1. Product SEO backfill — DONE (applied live)

A full scan of all 516 products showed the catalog is already **thoroughly SEO‑optimized** — nearly every product has a custom SEO title, meta description, and descriptive image alt text. Only **two** recently‑imported products had blank SEO. Both were fixed directly in Shopify, including renaming them from Yoycol's generic titles to catalog style:

| Product (new title) | SEO title | Meta description | Image alt |
|---|---|---|---|
| Men's Windproof Hooded Jacket — All‑Over Print Full‑Zip Shell | ✅ added | ✅ added | ✅ replaced SKU code `ADS‑3MPSDM02‑…` |
| Flat Brim Baseball Cap — All‑Over Print Adjustable | ✅ added | ✅ added | ✅ replaced `…Yoycol` |

(Both handles/URLs were left unchanged, so no new redirects were created.)

**Secondary (valid SEO, weak image alt text ending in "Yoycol"/brand only)** — low priority, worth cleaning when convenient:
`Blue Hour Collage Cooling Sports Towel`, `Fan Bloom Full‑Zip Hoodie`, `All‑Over Print Unisex Pullover Hoodie | 310GSM Cotton`, `Exotic Bloom Duster Jacket`.

---

## 2. Redirect audit — 27 fixes applied live

The store has **666 URL redirects**. Most are legitimate old‑handle → new‑handle 301s from product renames (this is *why* GSC shows "Page with redirect: 820" instead of hundreds of 404s — a good thing). Two problem types were found and fixed:

### 2a. Redirects to the homepage `/` — 21 found, 16 fixed ✅
Deleted products were 301'd to the homepage `/`. Google treats a redirect‑to‑homepage as a **soft 404** — it won't index it and it wastes crawl budget. A server‑side filter returned **all 21** homepage‑redirects. The **16** that were real products were repointed to the closest relevant collection (or live product):

- caps/snapbacks → `/collections/accessories`
- men's apparel (hoodies, shirts, tees, joggers, pajamas) → `/collections/guys`
- women's dress → `/collections/girls`
- unisex tees/joggers → `/collections/all-products`
- party plates → `/collections/home-living`
- SVG vexel → `/collections/vector-artwork-svg-digital-assets-dylesmavis`
- **throw blanket → its live product** `/products/sandstorm-premium-throw-blanket` (it still exists — see 2c)

The remaining **5** (`/about`, `/cmd_sco`, `/ja/login`, `/ja/login_page`, `/ja/poinnf`) are bot/junk paths that never mapped to real pages — pointing them at `/` is fine, so they were left alone.

### 2b. Redirect chains — 4 found & collapsed ✅
Multi‑hop A → B → C → D redirects (from products renamed several times). Each hop leaks a little authority/crawl budget. All four found in the audited portion were resolved to their **live** product in a single hop:

- `…oversized-womens-off-shoulder-sweatshirt` (+ its `…-psychedelic` hop) → `/products/pawsitive-vibrations-off-shoulder-sweatshirt`
- `…mens-small-collar-hockey-jersey-1` (+ `morningstar-…-aop-mens-…` hop) → `/products/morningstar-at-night-hockey-jersey`
- `/products/throw` → `/products/sandstorm-premium-throw-blanket`
- `nature-inspired-womens-hoodie-dress` (+ `aviary-aop-hoodie-dress-bird-print` hop) → `/products/aviary-fieldbook-hoodie-dress`

### 2c. Misrouted redirects — fixed as part of 2a/2b
Some redirects sent a renamed product to `/` even though it still exists. The throw blanket (`/products/throw` and its old fleece handle) now correctly resolves to the live `/products/sandstorm-premium-throw-blanket`.

### Remaining: full chain sweep (optional, low priority)
Chains are **not** flagged by Google as errors and are followed automatically, so impact is minor. The 4 worst (3–4 hop) chains are fixed. A brute‑force sweep of all 666 redirects for any remaining minor chains can be done later if desired.
**Method:** Shopify admin → **Content → URL redirects → Export**; in the CSV, find any `Target` that also appears as a `Redirect from` — those are chains. Repoint each to the final live URL.

---

## 3. The real strategic issue: "Crawled/Discovered – currently not indexed" (~758 URLs)

This is the only large number worth real attention. It is **not a bug** — Google crawled or discovered these URLs and chose not to index them (yet). For a young, large print‑on‑demand catalog this is normal. Levers, in priority order:

1. **Build authority (biggest lever).** Not‑indexed at this scale is mostly a trust/age signal. Earn backlinks (press, collabs, marketplaces, social), and keep publishing. Indexing improves as the domain matures.
2. **Reduce low‑value URL sprawl.** 516 products across 27 collections + tag/filter permutations create many thin, near‑duplicate URLs competing for crawl budget. Prune dead/empty collections; avoid indexable filtered collection URLs.
3. **Strengthen internal linking.** Ensure every product is linked from at least one collection and from related‑product blocks. Orphan pages are the first to be dropped.
4. **Differentiate near‑duplicate products.** Same design on many garments → very similar pages. The custom descriptions already help; make sure titles/first paragraph differ meaningfully per product.
5. **Keep the sitemap clean.** Shopify auto‑manages `/sitemap.xml`. Don't let it list URLs that only redirect. Re‑submit in GSC after the redirect cleanup (§2).
6. **Request indexing selectively.** For your best 20–30 products/collections, use GSC's URL Inspection → Request Indexing. Don't mass‑request; prioritize money pages.
7. **Give it time + validate.** After fixes, hit **"Validate Fix"** on each issue in GSC and expect 2–4 weeks per validation cycle.

---

## 4. The genuinely broken (small) — 404 / 5xx / other 4xx (~32 URLs)

These are real but tiny: **404 (14), Server error 5xx (3), other 4xx (14)**. The CSV export only contains *counts*, not the specific URLs, so they can't be targeted from the spreadsheet alone.

**How to get the exact URLs (do this, then the 404s can be redirected):**
1. Google Search Console → **Indexing → Pages**.
2. Under "Why pages aren't indexed," click the specific reason (e.g. **Not found (404)**).
3. On the detail page click **Export** (top right) → the CSV/Sheet lists the exact URLs.
4. Send those URLs and they can be turned into proper 301 redirects (to the right product/collection) in Shopify.

Notes:
- **5xx (3)** are often transient crawl‑time timeouts on Shopify; usually self‑resolve. Only worry if they persist or hit real pages.
- **Blocked due to other 4xx (14)** — inspect a few in GSC's URL Inspection to see the actual status; often password/checkout/app URLs that don't matter.

---

## Reference: what to IGNORE (Shopify working correctly)

| GSC "issue" | Pages | Verdict |
|---|---|---|
| Alternate page with proper canonical tag | 478 | ✅ Correct. Duplicate product/collection paths + variant URLs, canonicalized properly. |
| Page with redirect | 820 | ✅ Expected. Your 666 redirects + Shopify auto‑redirects. (Clean up the bad ones per §2.) |
| Blocked by robots.txt | 95 | ✅ Intentional. Shopify blocks `/cart`, `/checkout`, filtered URLs. |
| Excluded by 'noindex' tag | 289 | ✅ Mostly intentional (internal search, filtered pages). |
| Duplicate without user‑selected canonical | 1 | ✅ Trivial. |

**Bottom line:** the catalog SEO is in great shape, two blank products are fixed, the redirect table needs a cleanup pass (homepage soft‑404s + chains), and the big "not indexed" number is a slow authority/crawl‑budget game — not an error to switch off.
