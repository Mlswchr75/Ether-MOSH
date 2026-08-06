# MOSH payment unification — commit checklist

## 1. Drop these files into the `Ether-MOSH` branch (Mlswchr75/Mlswchr75)

| File in this folder          | Goes to                                  | Action  |
|-------------------------------|-------------------------------------------|---------|
| `Checkout.tsx`                 | `src/pages/Checkout.tsx`                  | new file |
| `StripeEmbeddedCheckout.tsx`   | `src/components/StripeEmbeddedCheckout.tsx` | new file |
| `Auth.tsx`                     | `src/pages/Auth.tsx`                      | overwrite (drops broken Apple/Google OAuth buttons — see note in file) |
| `App.tsx`                      | `src/App.tsx`                             | overwrite (adds `/auth` + `/checkout` routes) |
| `Pricing.tsx`                  | `src/pages/Pricing.tsx`                   | overwrite (real checkout instead of dead Stripe Payment Links) |

No new npm dependencies needed — `@stripe/react-stripe-js`, `@stripe/stripe-js`, and `@supabase/supabase-js` are already in this repo's `package.json`.

## 2. Netlify env vars — confirm these exist (Site settings → Environment variables)
- `VITE_SUPABASE_URL` = `https://udtrjwredttzvdixtwla.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = (same anon key as Lovable's `.env`)
- `VITE_PAYMENTS_CLIENT_TOKEN` = `pk_live_51TQQmiKDT4XgHVHr...` (same Stripe publishable key as Lovable — needed by `src/lib/stripe.ts`, already present in this repo, just needs the env var set)
- `VITE_PAYMENTS_LIVE` = unset or `"true"` (must NOT be `"false"`)

If any of these are missing/different, that's the actual leak — fix here before anything else.

## 3. After deploy, test on ether-mosh.netlify.app
- [ ] Click "sign in" — `/auth` loads (was a 404 before)
- [ ] Create/sign into an account
- [ ] Click a $1 tip — embedded Stripe Checkout opens (not a redirect to buy.stripe.com)
- [ ] Complete it, confirm `isSupporter`/badge updates without a refresh
- [ ] Open ether-mosh.lovable.app in the same browser, same account — supporter status should already show (same Supabase project)

## 4. Stripe cleanup — I can do this now via the Stripe API, just say go
- [ ] Deactivate the 4 static Payment Links (`plink_1Tz3srKDT4XgHVHrpK21U6ML`, `plink_1Tz3tUKDT4XgHVHrNgXoZT1m`, `plink_1Tz3tWKDT4XgHVHrUGjp9WSY`, `plink_1Tz3tYKDT4XgHVHrYQLAPJ08`) — replaced by the embedded checkout flow above
- [ ] Delete/disable the 2 stale webhook endpoints pointing at `kqgmqpyuppffqixyilwt.supabase.co` and the old Lovable project `0dc36974-f7c3-4d0d-807c-2c52cf3000be`

## 5. Not fixed yet — flagged, needs your call
- **Feature-list mismatch**: Netlify's "Unlock" tier advertises WebM export, system audio capture, upscaled export, best-frame capture, tile/mirror. Lovable's advertises GIF loops, unlimited recording, full-res exports, cloud-synced favorites. Both charge $4.99 for "supporter," but I haven't verified the actual `require()` gates in each codebase grant the same capabilities — that's a separate pass through `FxPicker.tsx` / `ExportSheet.tsx` on both sides.
- **Unrouted pages**: `Account.tsx`, `Favorites.tsx`, `Contact.tsx`, `OAuthConsent.tsx`, and all `Guide*.tsx` pages exist in the Netlify repo but have no route in `App.tsx` — dead code right now, same class of bug as `/auth` was. Worth a pass once payments are confirmed working.
