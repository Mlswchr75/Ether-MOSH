# Open decisions — §7 collections and related

Everything in the handoff's fix list is done. These four items were left for a
human decision because they are business calls, not data errors, and two of them
are outward-facing.

---

## 1. Radical Optimist in the main nav

**State:** 1 product, manual collection, currently linked in the main menu under
`Collections` (last item). The handoff recommended pulling it until it has 8–10+
products.

**Why not done automatically:** Shopify has no "remove one menu item" mutation.
`menuUpdate` replaces the entire menu, so dropping this one link means rewriting
all 7 top-level items and 20 children. That is a bigger, riskier operation on live
storefront navigation than the handoff anticipated (it assumed an admin toggle).

The exact mutation is written and ready in `proposed-nav-prune.graphql` — it
preserves every other item's ID, title, type and target. It needs a yes.

**Correction to the handoff:** `Infinite Echo` (2 products) is **not** in the main
menu at all, so no nav change is needed for it.

## 2. `meme-ohs` — empty collection

0 products, tag-rule based on the tag `meme-ohs`, not in any menu. The handoff
said "delete or repurpose if there's no plan to populate it." Deleting a
collection is destructive and depends entirely on whether this is a planned drop.
Left in place.

## 3. Large "manual" collections

Five collections have no `ruleSet` but hold 200–436 products each:

| Collection | Products |
|---|---|
| Boundless Bleeds | 436 |
| StreetsmART | 290 |
| Maximalist Motifs | 269 |
| Chromatic Overload | 235 |
| Transcendent Artifacts | 230 |

Maintaining these by hand does not scale — new uploads will silently miss them.
Converting to tag-based smart collections is the fix, but picking the tag rules is
a merchandising decision. Worth doing before the next product batch.

## 4. Generic supplier titles

Five products still carry supplier-style titles that differ only by an internal
SKU code:

- `All-Over Print Lantern Pants — Poly Waffle · P68KT / P68L5 / P68LB`
- `All-Over Print Windproof Hooded Shell — 140gsm · P5VFJ / P64WH`

These are genuinely different prints (confirmed — different images, and the shells
differ in price), but the titles read as duplicates to both shoppers and search
engines, and they were the reason the duplicate scan flagged them. Giving each the
kind of print name the rest of the catalog uses would fix the SEO problem and make
their `Color` option values meaningful — those are currently the generic
`All-Over Print` placeholder for exactly this reason.

## 5. Mislabeled option (small)

`Urban Brushstroke Artist Zip Jacket` has an option **named "Print" holding sizes**
(S–5XL). The PDP reads "Print: S". Fixing means renaming the option, which touches
variant structure, so it was not done silently.

---

## Still manual (handoff §9, unchanged)

- Footer contact email shows `fiveatesixfrbrkfst@gmail.com`; registered store
  email is `dyles@aestheticrebellion.store`.
- Hero / OG image filenames contain raw AI-generation prompt fragments
  (`Hispanic_female_model_instead_hyperrealistic_8k_ci...jpg`,
  `Firefly_Gemini_Flash_Analyze_the_uploaded_garment...png`).

Both live in theme settings. Writes to the live theme are blocked by this tooling.

## Highest-value remaining GMC action

0 of 3,845 variants have a barcode. Confirm `identifier_exists = false` is set
**globally** in Simprosys feed rules, then force a re-sync and request review.
This is now the most likely remaining cause of the Merchant Center problem, since
the availability theory did not survive measurement.
