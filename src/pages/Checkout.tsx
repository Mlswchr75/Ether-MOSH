import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { RequireAuth } from "@/components/RequireAuth";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { getCheckoutProduct } from "@/lib/products";
import { isPaymentsConfigured } from "@/lib/stripe";

function CheckoutContent() {
  const [params] = useSearchParams();
  const product = getCheckoutProduct(params.get("price"));

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-8 text-foreground">
      <Helmet>
        <title>Checkout — MOSH</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <section className="mx-auto w-full max-w-3xl">
        <Link to="/pricing" className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/60">
          ← back to pricing
        </Link>
        <div className="mt-10 text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-accent">secure checkout</p>
          <h1 className="mt-3 font-sans text-4xl font-bold tracking-tight">Complete your unlock</h1>
          {product ? (
            <p className="mt-3 text-sm text-foreground/60">
              {product.label} · {product.amount}
            </p>
          ) : null}
        </div>

        {!product ? (
          <div role="alert" className="mx-auto mt-10 max-w-xl border border-destructive/50 p-5 text-center text-sm">
            That checkout product is not recognized. Return to pricing and choose an available option.
          </div>
        ) : !isPaymentsConfigured() ? (
          <div role="alert" className="mx-auto mt-10 max-w-xl border border-destructive/50 p-5 text-center text-sm">
            Payments are not configured for this deployment yet. No charge has been attempted.
          </div>
        ) : (
          <div className="mt-10 overflow-hidden rounded-xl border border-border/60 bg-background/60 p-2">
            <StripeEmbeddedCheckout
              priceId={product.alias}
              returnUrl={`${window.location.origin}/pricing?checkout=success`}
            />
          </div>
        )}
      </section>
    </main>
  );
}

export default function Checkout() {
  return (
    <RequireAuth>
      <CheckoutContent />
    </RequireAuth>
  );
}
