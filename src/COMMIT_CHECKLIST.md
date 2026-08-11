# MOSH unified auth and payments deployment checklist

## 1. Supabase Auth URL configuration

Project: `udtrjwredttzvdixtwla`

- Site URL: `https://ether-mosh.netlify.app`
- Redirect URL: `https://ether-mosh.netlify.app/auth/callback`
- Transitional redirect URL: `https://ether-mosh.lovable.app/auth/callback`
- Remove obsolete Lovable preview URLs after the old deployment is retired.

The Google OAuth client keeps the Supabase callback URI:

`https://udtrjwredttzvdixtwla.supabase.co/auth/v1/callback`

Do not add `/auth/callback` from either application to Google as an OAuth redirect URI. Google returns to Supabase; Supabase returns to the application callback.

## 2. Netlify environment

- `VITE_SUPABASE_URL=https://udtrjwredttzvdixtwla.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` must match the transitional Lovable deployment.
- `VITE_PAYMENTS_CLIENT_TOKEN` must be the Stripe live publishable key used by the shared checkout backend.
- Do not configure `VITE_PAYMENTS_LIVE`; the application derives live versus sandbox from the publishable-key prefix.

## 3. Edge Function contract

`create-checkout` must:

- Require a valid Supabase JWT.
- Derive the paid `user_id` from the verified JWT; never trust a different caller-supplied identity.
- Accept only `mosh_supporter_once`, `mosh_tip_1`, `mosh_tip_5`, and `mosh_tip_25` aliases.
- Map aliases to Stripe Price IDs on the server.
- Create a Stripe Checkout Session in the requested environment.

`payments-webhook` must:

- Verify the Stripe signature before reading the event.
- Be the only code path that grants `mosh_supporter` or `mosh_tip`.
- Upsert idempotently by a single documented entitlement uniqueness key.
- Store the verified Supabase `user_id` from Checkout Session metadata.

## 4. Stripe live configuration

- Keep one live webhook endpoint targeting the shared `payments-webhook` Edge Function.
- Disable webhook endpoints targeting retired Supabase/Lovable backends after a successful end-to-end test.
- Keep test and live webhook secrets separate.

## 5. End-to-end acceptance test

- [ ] Start at `https://ether-mosh.netlify.app/pricing` in a signed-out browser.
- [ ] Select Supporter and complete Google sign-in.
- [ ] Confirm the browser returns to Netlify `/checkout`, never to Lovable.
- [ ] Complete a Stripe test-mode checkout and confirm one entitlement row appears for the signed-in Supabase user ID.
- [ ] Confirm Netlify unlocks after the webhook writes the row.
- [ ] Sign into `https://ether-mosh.lovable.app` with the same Google account and confirm the same unlock appears.
- [ ] Repeat in live mode with the smallest allowed purchase before retiring old endpoints.

Separate browser storage means each domain requires its own sign-in. The purchase follows the shared Supabase user ID, not a shared cookie.
