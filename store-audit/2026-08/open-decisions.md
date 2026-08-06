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
