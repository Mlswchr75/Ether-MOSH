# Post-change verification

Full catalog re-exported via `bulkOperationRunQuery` after all mutations
(524 products / 3,845 variants / 3,510 images) and checked:

| Check | Before | After |
|---|---|---|
| Products with `vendor != "Aesthetic Rebellion"` | 30 | **0** |
| Image alt texts containing `Yoycol` | 174 | **0** |
| Descriptions containing `Yoycol` | 1 | **0** |
| Descriptions containing the EU-rep legal block | 1 | **0** |
| Variants `availableForSale: false` | 1 | **0** |
| Products with no tags | 3 | 1 (archived duplicate only) |
| Products with empty `productType` | 3 | 1 (archived duplicate only) |
| Products with placeholder single-value `Color: White` | 38 | **0** |

The 69 variants that still carry a `White` color value all belong to the 9
products where `White` is one of several real colorways, plus the archived
duplicate. That is the intended end state.

Every mutation returned an empty `userErrors` array.

## Method note

Counts come from the Admin API, not the storefront. Two things this pass could
**not** verify from inside Shopify:

1. Whether Merchant Center actually recovers. That depends on the Simprosys feed
   re-sync and the GTIN / `identifier_exists` setting, neither of which is
   visible here.
2. Whether the print names chosen in §5 match the artist's intent for each
   design — they were derived from existing product titles.
