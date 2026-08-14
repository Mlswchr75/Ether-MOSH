# Aesthetic Rebellion — Store Audit Execution Pass

**Store:** aestheticrebellion.store (sqpch3-kt.myshopify.com)
**Executed:** 2026-08-04
**Scope:** Items 1–7 of the Aug 2026 audit handoff.

All changes were made against the Shopify Admin GraphQL API. Catalog state was
captured before and after via `bulkOperationRunQuery` and diffed; see
`verification.md` for the post-change counts.

---

## Headline correction: the GMC diagnosis in the handoff was wrong

The handoff named **inventory policy** as the root cause of the Merchant Center
disapprovals, reasoning that `totalInventory: 0` across the catalog meant Shopify
was reporting every product as `sold_out`.

Measured across all 3,845 variants, that does not hold:

| Check | Result |
|---|---|
| Variants `availableForSale: true` | 3,844 / 3,845 |
| Variants already `inventoryPolicy: CONTINUE` | 3,500 |
| Variants `DENY` | 345 — but all on **untracked** or fully-stocked items |
| Products with `tracksInventory: false` | 378 |
| Products with a null `onlineStoreUrl` | 1 (the archived duplicate) |

`totalInventory: 0` is an artifact of `tracksInventory: false` — Shopify reports
untracked items as available regardless of quantity or policy. Flipping the whole
catalog to `CONTINUE`, as the handoff recommended, would have been a no-op for
Merchant Center.

**One genuine defect existed** and was fixed: *The Everything Vault* ($69 digital
SVG bundle) was tracked, at qty 0, with `DENY` — the single unpurchasable listing
in the store. See §1 below.

**The remaining feed-side lead is GTIN.** 0 of 3,845 variants carry a barcode.
That makes `identifier_exists = false` in the Simprosys feed rules the highest-value
remaining check, and it is the one thing here not reachable from the Shopify API.

## Tooling correction

The handoff stated that `vendor`, `tags`, and `inventoryPolicy` were unreachable
and required the CSV bulk editor or a separately-provisioned access token. This
session had `graphql_query` / `graphql_mutation` against the Admin API, so every
item below was done directly — no CSV round-trip.

---

## What changed

### §1 — Inventory / availability
- `The Everything Vault` variant `49320975925475` → `inventoryPolicy: CONTINUE`.
  Now `availableForSale: true`.
- Untracking it was attempted first and rejected by Shopify: the item is stocked
  at a fulfillment service that requires shipping.
- No other inventory changes. 87 products carry `DENY` variants; all are already
  purchasable and were deliberately left alone.

### §2 — Vendor + alt text
- 30 products with `vendor: "Yoycol"` → `"Aesthetic Rebellion"`.
- 174 image alt texts across 47 products had the `Yoycol` / `by Yoycol` suffix
  stripped (31 distinct strings). Alt text remains descriptive.

### §3 — Supplier descriptions
Only **one** product still carried raw supplier copy — the archived duplicate
`9581511770339`, which held Yoycol's EU legal entity block
(`Europe Gateway International B.V.`) and a reference to the Yoycol mockup
generator. Rewritten in brand voice, with the size chart preserved as a clean
HTML table. The rest of the catalog was already clean.

### §4 — Tags and product type
- 3 products were untagged; the 2 active ones were tagged using existing store
  conventions (`aop`, `nav-guys` / `nav-girls`, `wearable art`, garment tags).
- **Additional finding:** 3 products had an empty `productType`. Because the
  Guys / Girls / Youth / Home & Living / Accessories collections route primarily
  on `TYPE`, those products were invisible to them regardless of tags. Fixed:
  - Lapel long sleeve shirt → `Button-Up Shirt`
  - Interlock zip hoodie → `Zip-Up Hoodie`
  - Word Cloud Bucket Hat → `Bucket Hat` (was missing from Accessories entirely)

### §5 — "White" placeholder option values
38 products carried a single-value `Color` option of `White`. All 38 were
resolved — 37 renamed to the print name from the product title, and the Interlock
hoodie's mixed set merged (a prior session had renamed 1 of 9 variants, leaving 8
stranded on `White`; the orphaned option value was then deleted).

**9 products were deliberately not touched.** Their `Color` option holds multiple
real garment colorways — `Navy`, `Ocean`, `Light Pink`, `Heather Kelly`,
`Team Purple`, `Blue Jean` — where `White` is a genuine choice, not a placeholder.
Bulk-renaming those would have corrupted real merchandising data.

Full mapping in `option-value-renames.md`.

### §6 — Duplicates
**No duplicates beyond the one already archived.** The groups that look like
duplicates are not:

| Group | Verdict |
|---|---|
| Lantern Pants P68KT / P68L5 / P68LB | Distinct prints — different SKU design codes and images |
| Windproof Shell P5VFJ / P64WH | Distinct prints — also differ in price ($50 vs $55) |
| Interlock Hoodie pair | Real duplicate, already archived before this pass |

These share generic supplier titles that differ only by SKU code, which is why
they read as duplicates. That is a merchandising/SEO problem worth fixing with
real print names, not a deduplication problem.

### §7 — Collections
- **Radical Optimist: 1 → 30 products.** Per owner decision the collection was
  built out rather than pulled from the nav. 30 products were selected against the
  collection's stated ethos (loungewear & intimates, affirmation-forward prints,
  radiant color, power silhouettes; dark/aggressive motifs filtered out), tagged
  `Radical Optimist` with `tagsAdd`, and the collection converted from manual to a
  smart collection ruled on that tag — so it now maintains itself.
- **`meme-ohs` deleted** (0 products, in no menu) per owner decision.
- **All five large "manual" collections converted to tag-ruled smart collections**
  — Boundless Bleeds (436), StreetsmART (290), Maximalist Motifs (269), Chromatic
  Overload (235), Transcendent Artifacts (230). Done losslessly: membership was
  snapshotted, mirrored onto a per-collection tag across 470 products / 1,460 tag
  additions, gated on exact parity, and only then converted. Post-conversion
  membership is identical product-for-product. They now maintain themselves.
- Nav state corrected: **Infinite Echo is not in the main menu at all** (the
  handoff said it was). Nav left unchanged.

---

## Not addressed (unchanged from handoff §9)

Theme-level items remain manual: the footer contact email
(`fiveatesixfrbrkfst@gmail.com` vs the registered `dyles@aestheticrebellion.store`)
and the hero/OG image filenames containing AI-generation prompt fragments. Theme
file writes to the live theme are blocked by this tooling.
