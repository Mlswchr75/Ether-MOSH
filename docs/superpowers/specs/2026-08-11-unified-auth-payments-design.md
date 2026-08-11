# Unified Auth and Payments Design

## Goal

Make Google sign-in return to the Ether-MOSH origin that initiated it and make a single Stripe Supporter purchase unlock the same Supabase user on both the Netlify and transitional Lovable deployments.

## Architecture

Supabase remains the sole identity and entitlement authority. Each domain maintains its own browser session, but both authenticate against the same Supabase project, producing the same `auth.users.id`. Stripe Checkout is created by the shared `create-checkout` Edge Function, while only the shared Stripe webhook grants entitlements.

The browser sends Google OAuth to a dedicated `/auth/callback` route with a sanitized relative `next` path. That route exchanges the PKCE code, stores the session, and returns the user to `next`. Supabase must allowlist each callback origin; the application never falls back to a Lovable broker.

## Components

- `src/lib/authRedirect.ts`: validates relative return paths and builds callback URLs.
- `src/pages/Auth.tsx`: starts Google or email verification flows using the callback URL.
- `src/pages/AuthCallback.tsx`: exchanges the PKCE code and redirects safely.
- `src/pages/Checkout.tsx`: requires authentication, validates the product alias, and embeds Stripe Checkout.
- `src/lib/products.ts`: maps public product aliases to the four allowed purchase products.
- `src/hooks/useEntitlements.ts`: treats query failures as errors, filters to active grants, and refreshes after checkout.
- `src/lib/stripe.ts`: derives one environment consistently from the Stripe publishable key.
- `src/integrations/supabase/types.ts`: reflects the entitlement fields already consumed by the live app.

## Data Flow

1. The user selects an unlock or tip.
2. If signed out, the app stores the checkout path in `next` and starts authentication.
3. Google returns to `/auth/callback`; the callback exchanges the PKCE code and returns to the checkout path.
4. Checkout invokes the shared Edge Function with the authenticated session and a constrained product alias.
5. Stripe completes payment. The shared webhook writes the entitlement for the Supabase user ID.
6. Both domains query that same entitlement row and unlock the same account.

## Security and Failure Behavior

- Return paths must start with one `/`, never `//`, and never accept an external origin.
- Checkout accepts only known product aliases; raw Stripe price IDs are not trusted from the URL.
- The Edge Function—not caller-supplied `userId` or email—must derive identity from the authenticated JWT.
- A missing payment key displays a configuration error instead of rendering a blank page.
- Entitlement query failures remain distinguishable from a legitimate free account.
- The owner email shortcut remains for the existing comp-account behavior, but purchases remain keyed by Supabase user ID.

## Production Configuration

The shared Supabase project must use `https://ether-mosh.netlify.app` as its Site URL and allow:

- `https://ether-mosh.netlify.app/auth/callback`
- `https://ether-mosh.lovable.app/auth/callback` during transition

Google keeps the Supabase callback URI. Stripe must send live events to the single shared `payments-webhook` function. Netlify and Lovable must use the same Supabase project variables and the same live Stripe publishable key.

## Verification

- Unit tests cover return-path sanitization, callback URL creation, product validation, and payment environment selection.
- Route tests cover `/auth/callback` and `/checkout` without falling into the 404 page.
- Checkout tests cover unauthenticated redirect, invalid product handling, missing configuration, and the valid embedded checkout path.
- Entitlement tests cover active grants and surfaced query errors.
- Full tests and a production build must pass before publication.
