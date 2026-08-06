# Daily satire article — generation runbook

Publishing is handled by **Shopify's native scheduler**, not an external cron.

`articleCreate` with `isPublished: false` and a **future** `publishDate` queues an
article that Shopify releases automatically on that date. Setting `isPublished: true`
together with a future `publishDate` fails with:
"Can't set isPublished to true and also set a future publish date."

So the pattern is: pre-write a batch, stagger `publishDate` one per day, and Shopify
does the rest unattended. Top the queue up before it drains.

Claude Routines were tried first and are NOT viable on this account: a fired Routine
starts a fresh session whose `allowed_tools` contains no `mcp__Shopify__*`, and the
`connectors` parameter on `create_trigger` returns
"not available for this organization."

## Per-article procedure

1. Read `brand/BRAND_VOICE.md`, Register B — Editorial. Read `brand/intake-queue.json`
   and never feature anything in its `queue`.
2. Pick a product at random (`shuf`, not first-result) from products matching
   `query: "Dyles Mavis AND tag:*"` that have 6+ tags, at least one collection other
   than "All Products", and a `featuredMedia` image.
3. Check the last 20 articles on blog `gid://shopify/Blog/102727876835`. Skip products
   featured in the last 30 days. Coin a NEW capitalized pseudo-clinical term each time.
   Used so far: Pre-Emptive Athleticism, Robe Displacement Theory,
   Latent Festival Personality Disorder, the Visible Arrival.
4. Write 700–900 words. Satirical first person, past-tense anecdote, sincere
   underneath, affectionate about the narrator's bad decisions, never mocking the
   customer. Hyper-specific mundane anchors. Long confessional or defiant title with a
   trailing concession. Second-person turn at the end. Exactly one product.
5. `articleCreate` on blog `gid://shopify/Blog/102727876835` with: `title`, kebab-case
   `handle` (term + product handle), `author` = Dyles Mavis, `body` HTML, one-sentence
   `summary`, `tags`, `image` from the product's `featuredMedia`, `isPublished: false`,
   and `publishDate` set to the target day.
6. All product and collection links carry
   `?utm_source=shopify_blog&utm_medium=blog&utm_campaign=satire-daily&utm_content=<handle>`
   Product and collection pages only, never the homepage. Escape `&` as `&amp;` in HTML.
