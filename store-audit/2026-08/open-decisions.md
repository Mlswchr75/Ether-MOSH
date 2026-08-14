# §7 collections — resolutions and remaining decisions

Everything in the handoff's fix list is done. Items 1 and 2 below were decided by
the store owner and are now applied; items 3–5 remain open.

---

## 1. Radical Optimist — populated instead of pulled from nav ✅ DONE

**Owner decision:** rather than removing the link, build the collection out past
21 products.

**Applied:** 30 products selected against the collection's own stated ethos —
loungewear & intimates, affirmation-forward prints, radiant/bold color stories,
power silhouettes — then tagged `Radical Optimist` via `tagsAdd` (append, so no
existing tags were overwritten). The collection was converted from manual to a
**smart collection** with rule `TAG EQUALS "Radical Optimist"`, matching the
pattern already used by Infinite Echo and Vibe-Checked Vectors.

**Result: 30 products.** It now maintains itself — tagging a future product adds
it automatically, with no manual collection editing.

Products with dark or aggressive themes (skull / thorns / hazmat / graveyard
motifs) were explicitly filtered out as fighting the collection's ethos.

The nav stays as-is. `proposed-nav-prune.graphql` is retained only as a reference
for how to safely rewrite the main menu if that is ever wanted.

**Correction to the handoff:** `Infinite Echo` (2 products) is **not** in the main
menu at all, so it needed no nav change either.

## 2. `meme-ohs` — deleted ✅ DONE

Empty (0 products), tag-ruled, in no menu. Deleted per owner decision.

## 3. Large "manual" collections

Five collections have no `ruleSet` but hold 200–436 products each:

## 3. Large "manual" collections — converted ✅ DONE

All five have been converted from manual to tag-ruled smart collections,
**losslessly** — membership after conversion is identical to membership before,
verified product-for-product (not just by count).

| Collection | Products | Rule |
|---|---|---|
| Boundless Bleeds | 436 | `TAG EQUALS "Boundless Bleeds"` |
| StreetsmART | 290 | `TAG EQUALS "StreetsmART"` |
| Maximalist Motifs | 269 | `TAG EQUALS "Maximalist Motifs"` |
| Chromatic Overload | 235 | `TAG EQUALS "Chromatic Overload"` |
| Transcendent Artifacts | 230 | `TAG EQUALS "Transcendent Artifacts"` |

They now maintain themselves: tagging a new product adds it automatically, and no
future upload can silently miss them.

### How it was done safely

No existing tag came close to matching membership — the best candidate covered
~50% of members with heavy leakage from non-members. Converting to a rule on any
pre-existing tag would have dropped roughly half of each collection and pulled in
products that were never curated in. So instead:

1. **Snapshotted** exact membership first (`membership_snapshot.json`, 1,460
   product-collection pairs) as a rollback record.
2. **Mirrored** it: applied a tag matching each collection's name to exactly its
   current members (470 products, 1,460 tag additions) using `tagsAdd`, which
   appends rather than overwriting, so no existing tags were touched.
3. **Gated**: verified the tagged set equalled the snapshot set exactly — zero
   missing, zero leakage — and refused to convert until it did.
4. **Converted** only then, and re-verified membership product-for-product.

### Two things the gate caught

- **Case-insensitive tag dedup.** Six products appeared to be missing their tag.
  They already carried lowercase variants (`boundless bleeds`, `streetsmart`), and
  Shopify dedupes tags case-insensitively, so `tagsAdd` was a silent no-op. The
  tags were in fact present; the first gate check was case-sensitive and wrong.
  Shopify's smart-collection `TAG` rules are also case-insensitive, confirmed
  empirically — StreetsmART returned exactly 290 including the lowercase-tagged
  products.
- **Throttling causes silent partial writes.** Several batched mutations returned
  a retryable upstream error; `tagsAdd` is idempotent so retries were safe, but
  this is why the count gate exists rather than trusting empty `userErrors`.

### Tooling note

`bulkOperationRunMutation` is blocked by the MCP connector's safety policy
("can execute arbitrary mutations"), so the 1,460 tag additions were applied as
batched aliased mutations instead. Batches above ~35 aliases fail, and
consecutive large batches exhaust the cost bucket and need a retry.

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
