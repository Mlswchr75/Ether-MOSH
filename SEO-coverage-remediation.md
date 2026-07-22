# aestheticrebellion.store — Search Console Coverage Remediation

**Source:** Google Search Console → Page Indexing export (`aestheticrebellion.store-Coverage-2026-07-22`)
**Store:** Shopify (Basic), 516 products (all active & published), 27 collections, 666 URL redirects
**Date:** 2026-07-22

---

## TL;DR — most of the "critical issues" are not broken

Google Search Console labels **every** non‑indexed URL a "critical issue," which makes a healthy store look like it's on fire. On this store, roughly **two‑thirds of the flagged URLs are Shopify behaving correctly** and need no action. The real, actionable work is small and specific. Prioritized below.

---

## 1. Product SEO backfill — DONE (applied live)

A full scan of all 516 products showed the catalog is already **thoroughly SEO‑optimized** — nearly every product has a custom SEO title, meta description, and descriptive image alt text. Only **two** recently‑imported products had blank SEO. Both were fixed directly in Shopify:

| Product | SEO title | Meta description | Image alt |
|---|---|---|---|
| All‑Over Print Men's Hooded Zipper Windproof Jacket | ✅ added | ✅ added | ✅ replaced SKU code `ADS‑3MPSDM02‑…` |
| Baseball Cap With Flat Brim | ✅ added | ✅ added | ✅ replaced `…Yoycol` |

**Secondary (valid SEO, weak image alt text ending in "Yoycol"/brand only)** — low priority, worth cleaning when convenient:
`Blue Hour Collage Cooling Sports Towel`, `Fan Bloom Full‑Zip Hoodie`, `All‑Over Print Unisex Pullover Hoodie | 310GSM Cotton`, `Exotic Bloom Duster Jacket`.

> Note: the two fixed products still carry Yoycol's generic *product titles*. Their SEO tags are now correct, but giving them distinctive names (matching the rest of the catalog) would help further. Optional merchandising task.

---

## 2. Redirect audit — action needed

The store has **666 URL redirects**. Most are legitimate old‑handle → new‑handle 301s from product renames (this is *why* GSC shows "Page with redirect: 820" instead of hundreds of 404s — a good thing). But a 100‑redirect sample (15% of all redirects) surfaced two recurring problems:

### 2a. Redirects to the homepage `/` — ~18% of redirects (est. ~120 store‑wide)
Deleted products are being 301'd to the homepage `/`. Google treats a redirect‑to‑homepage as a **soft 404** — it won't index it and it wastes crawl budget. Examples found:
`/products/unisex-snapback-cap-all-over-printing`, `/products/280gsm-custom-hoodie-…`, `/about`, `/cmd_sco`, `/products/mess-with-the-moose-…`, and ~15 more in the sample.

**Fix:** point each to the closest relevant **collection** (or a real replacement product) instead of `/`. E.g. a deleted snapback → `/collections/hats`; a deleted hoodie → `/collections/hoodies`. Where no relevant page exists, letting it 404/410 is actually better than a soft‑404 homepage redirect.

### 2b. Redirect chains — ~4% of redirects (est. ~25+ store‑wide)
A → B → C hops. Browsers/Google follow them but each hop leaks authority and crawl budget; Google flags long chains. Confirmed chains in‑sample:

- `…oversized-womens-off-shoulder-sweatshirt` → `…-psychedelic` → `pawsitive-vibrations-…`
- `…mens-small-collar-hockey-jersey-1` → `morningstar-at-night-aop-mens-hockey-jersey` → `morningstar-at-night-aop-hockey-jersey`
- `nature-inspired-womens-hoodie-dress` → `aviary-aop-hoodie-dress-bird-print` → `aviary-aop-womens-hoodie-dress`

**Fix:** repoint the first hop directly to the final destination, so every redirect is a single hop.

### 2c. Misrouted redirects — live products sent to the homepage
Some redirects send a renamed product to `/` even though the product still exists under its new handle. Confirmed:
`/products/throw` → `sandstorm-all-over-print-throw-blanket-plush-velvet-fleece` → `/`, but that throw blanket is **live** at `/products/sandstorm-premium-throw-blanket`. Both redirects should point to the live URL.

**How to get the complete list & fix at scale:**
Shopify admin → **Content → URL redirects → Export**. Sort/filter the CSV by `Target = /` to see every homepage redirect, and use a spreadsheet to find any `Target` that also appears as a `Redirect from` (chains). Bulk‑edit via re‑import, or fix in the admin.

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
