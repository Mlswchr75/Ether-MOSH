# Supabase backend (version-controlled)

This directory is the version-controlled copy of the production database
schema and payment/AI edge functions for `ether-mosh.online` (Supabase project
ref `coyzusnfkvheplcdvctf`, "Ether-MOSH Production"). The canonical repository
is now the source of truth for this backend rather than a site-builder-managed
copy.

Migrated 2026-09-01 off the original project (`udtrjwredttzvdixtwla`, which
belonged to a different Supabase account this repo's owner didn't control)
onto a dedicated project under the owner's own Supabase org. Auth users,
profiles, presets, and entitlements were carried over as of the migration
date; anything written on the old project after that point does not exist
here.

## `migrations/`

These files are a historical record of the schema **already applied** to the
live project — not new changes to run against it. If you link the CLI to the
live project (`supabase link --project-ref coyzusnfkvheplcdvctf`), do **not**
run `supabase db push` blind: the tables already exist, so a push will fail on
"already exists" errors. Either `supabase db pull` first to reconcile the
migration history table, or use `supabase migration repair --status applied
<version>` for each file to mark them as baseline. From that point on, schema
changes should go through new migration files reviewed in this repo, same as
any other code change.

For a **fresh** Supabase project (e.g. one you own directly, outside Lovable),
these migrations apply cleanly in order and reproduce the full schema.

## `functions/`

- `create-checkout`, `payments-webhook` — Stripe checkout + webhook handling.
  Rewritten to call Stripe's API directly (via `_shared/stripe.ts`) instead of
  routing through Lovable's `connector-gateway.lovable.dev` proxy. Needs these
  secrets set on the target Supabase project (`supabase secrets set ...` or the
  dashboard):
  - `STRIPE_LIVE_SECRET_KEY` / `STRIPE_SANDBOX_SECRET_KEY` — your own Stripe secret keys
  - `PAYMENTS_LIVE_WEBHOOK_SECRET` / `PAYMENTS_SANDBOX_WEBHOOK_SECRET` — signing secrets from your Stripe webhook endpoint config
  - `PAYMENTS_ALLOWED_ORIGINS` — comma-separated checkout origins; defaults to `https://ether-mosh.online`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — provided automatically by Supabase's edge runtime, no action needed
- `forge-analyze` — AI artwork analysis for Pattern Forge. Calls one of three
  interchangeable providers directly (no site-builder AI gateway) — they all
  speak the same OpenAI-compatible chat-completions shape, so switching is a
  secret change, not a code change:
  - `AI_PROVIDER` — `gemini` (default), `openrouter`, or `groq`.
  - `AI_MODEL` — optional; overrides the provider's default model id.
  - Per-provider API key (set only the one matching `AI_PROVIDER`), never as a
    `VITE_` variable — anything with that prefix is compiled into the browser
    bundle and readable by anyone:
    - `OPENROUTER_API_KEY` — free, no card, from
      https://openrouter.ai/keys. Uses `openrouter/free`, OpenRouter's own
      auto-router (launched Feb 2026): it picks whichever currently-free model
      supports vision + tool calling + structured output and keeps working as
      individual free models rotate out, rather than pinning one name in code.
      Rate limit is 20 req/min / 200 req/day — fine for this feature's volume.
    - `GROQ_API_KEY` — free, no card, much higher throughput. No default
      model: check https://console.groq.com/docs/models for a current vision +
      tool-calling model and set `AI_MODEL` explicitly — Groq's free vision
      model is a named preview with the same retirement risk described below.
    - `GEMINI_API_KEY` (default provider) — free, no card, from
      https://aistudio.google.com/apikey. Defaults to `gemini-3.6-flash`,
      verified against this function's exact request (vision + forced tool
      call) on a free key. Which model you pick is the whole game here: the
      **pro** line needs a billed Google Cloud project, and asks for one by
      answering `429` with `limit: 0` — no quota at all rather than an
      exhausted one, so retrying can never succeed. The **flash** line is free.
      Check what your own key reaches at https://ai.dev/rate-limit. Google also
      retires model aliases on its own schedule (`gemini-2.5-pro`, pinned here
      originally, and `gemini-2.5-flash` both 404 for any account created after
      they closed to new users) — that's exactly the failure `AI_MODEL` exists
      to make a secret change instead of a redeploy.
  Images are read from storage and sent inline as a `data:` uri, never as a
  url. Gemini's OpenAI-compatible endpoint refuses a remote `image_url` with a
  bare `400 INVALID_ARGUMENT`, and every OpenAI-shaped endpoint accepts a data
  uri, so any provider added here should keep doing it this way. SVG uploads
  are rejected up front (vector does not rasterise model-side) and raw files
  over 12 MB are too, since inline bytes ride inside the JSON request body.
  - Storage image transformation is used to downscale each upload to 1600px on
    its longest edge before it is sent. That is what lets a print-resolution
    file be analysed at all: a 17MB source exceeds what an inline request can
    carry, while its downscale carries every signal the analysis reads. If
    transformation is unavailable on the plan the function falls back to the
    original and the size cap applies.
  - Provider calls retry twice on conditions the provider itself calls
    temporary (503, transient 5xx, a refillable 429). A `429` whose body names
    `limit: 0` is deliberately *not* retried — that is no quota for the model on
    that plan rather than an exhausted one, and the same response carries a
    "please retry" that will never come true.
  - SVG uploads are rejected with a clear message. Storage transformation passes
    vector through unchanged rather than rasterising it, so there is nothing to
    send; export a raster first.
- `forge-delete` — unchanged, no external dependency.

None of these functions need `LOVABLE_API_KEY`. (The MCP server integration
elsewhere in the app is untouched and still uses Lovable's MCP tooling —
that's a separate concern from payments/AI.)

## Deploying

Once secrets are set on the target project:

```
supabase functions deploy create-checkout payments-webhook forge-analyze forge-delete
```

Test against Stripe's sandbox/test-mode keys and a test webhook endpoint before
pointing `STRIPE_LIVE_SECRET_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET` at production.
