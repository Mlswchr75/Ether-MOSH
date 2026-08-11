# Unified Auth and Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Google OAuth return handling and provide one shared Supabase-backed Stripe entitlement flow across both Ether-MOSH domains.

**Architecture:** A dedicated PKCE callback owns OAuth code exchange and safe return navigation. Checkout accepts only product aliases, invokes the shared Supabase Edge Function under the current authenticated session, and relies on webhook-written entitlement rows for cross-domain unlocks.

**Tech Stack:** React 18, React Router 7, TypeScript, Vitest, Supabase JS 2, Stripe Checkout.

## Global Constraints

- Keep `udtrjwredttzvdixtwla` as the shared Supabase project; do not create a second identity store.
- Keep entitlement authorization server-owned and keyed by `auth.users.id`.
- Keep Lovable only as a transitional allowed origin; do not use its auth broker in the Netlify build.
- Keep checkout webhook-driven; never grant paid access from the browser return URL.
- Preserve existing renderer and shader behavior.

---

### Task 1: OAuth Callback Contract

**Files:**
- Create: `src/lib/authRedirect.ts`
- Create: `src/lib/authRedirect.test.ts`
- Create: `src/pages/AuthCallback.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.routes.test.tsx`

**Interfaces:**
- Produces: `sanitizeNextPath(raw: string | null): string`
- Produces: `buildAuthCallbackUrl(origin: string, next: string): string`

- [ ] Write failing tests proving external and protocol-relative redirects become `/`, while valid checkout paths survive.
- [ ] Run the focused tests and verify the missing helpers and route fail.
- [ ] Implement the helpers, dedicated PKCE exchange page, and `/auth/callback` route.
- [ ] Update Google and email redirects to use the callback URL.
- [ ] Run focused tests and verify they pass.

### Task 2: Checkout Contract

**Files:**
- Create: `src/lib/products.ts`
- Create: `src/lib/products.test.ts`
- Create: `src/pages/Checkout.test.tsx`
- Modify: `src/pages/Checkout.tsx`
- Modify: `src/components/StripeEmbeddedCheckout.tsx`

**Interfaces:**
- Produces: `getCheckoutProduct(alias: string | null): CheckoutProduct | null`
- Consumes: authenticated Supabase session through `useAuth()`.

- [ ] Write failing tests for known product aliases, unknown aliases, signed-out checkout, and missing payment configuration.
- [ ] Run the focused tests and verify the empty checkout page fails.
- [ ] Implement the authenticated checkout screen and constrained product lookup.
- [ ] Remove caller-controlled user ID and email from the Edge Function request.
- [ ] Run focused tests and verify they pass.

### Task 3: Entitlement Consistency

**Files:**
- Create: `src/lib/entitlements.ts`
- Create: `src/lib/entitlements.test.ts`
- Modify: `src/hooks/useEntitlements.ts`
- Modify: `src/pages/Account.tsx`
- Modify: `src/integrations/supabase/types.ts`

**Interfaces:**
- Produces: `deriveEntitlementAccess(rows, owner): { isSupporter: boolean; hasTipped: boolean }`
- Consumes: the Stripe-key-derived `getPaymentsEnvironmentSafe()` result.

- [ ] Write failing tests proving revoked/inactive rows do not unlock and active rows do.
- [ ] Run focused tests and verify the helper is missing.
- [ ] Implement the helper, surface Supabase query errors, and filter active entitlements.
- [ ] Align Account and generated type shape with the entitlement query.
- [ ] Run focused tests and verify they pass.

### Task 4: Full Verification and Publication

**Files:**
- Modify: `src/COMMIT_CHECKLIST.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: one verified commit on `consolidation/unify-feature-routes` for draft PR #36.

- [ ] Document exact Supabase allowlist, Netlify variables, and Stripe webhook checks.
- [ ] Run `npm test` and require zero failing tests.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Inspect `git diff --check` and the final scoped diff.
- [ ] Commit and publish the verified changes to a dedicated draft PR when credentials permit.
