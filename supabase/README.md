# Supabase backend (version-controlled)

This directory is the first version-controlled copy of the production database
schema and payment/AI edge functions for `ether-mosh.online` (Supabase project
ref `udtrjwredttzvdixtwla`). It didn't exist in this repo before — the schema
only lived inside Lovable's managed Supabase integration. Bringing it into git
is step one of decoupling the app from Lovable's infrastructure.

## `migrations/`

These 20 files are a historical record of the schema **already applied** to the
live project — not new changes to run against it. If you link the CLI to the
live project (`supabase link --project-ref udtrjwredttzvdixtwla`), do **not**
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
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — provided automatically by Supabase's edge runtime, no action needed
- `forge-analyze` — AI artwork analysis for Pattern Forge. Rewritten to call
  Google's Gemini API directly (via its OpenAI-compatible endpoint) instead of
  `ai.gateway.lovable.dev`. Needs:
  - `GEMINI_API_KEY` — your own Gemini API key
- `forge-delete` — unchanged, no external dependency.

None of these functions need `LOVABLE_API_KEY` anymore. (The MCP server
integration elsewhere in the app is untouched and still uses Lovable's MCP
tooling — that's a separate concern from payments/AI.)

## Deploying

Once secrets are set on the target project:

```
supabase functions deploy create-checkout payments-webhook forge-analyze forge-delete
```

Test against Stripe's sandbox/test-mode keys and a test webhook endpoint before
pointing `STRIPE_LIVE_SECRET_KEY`/`PAYMENTS_LIVE_WEBHOOK_SECRET` at production.
