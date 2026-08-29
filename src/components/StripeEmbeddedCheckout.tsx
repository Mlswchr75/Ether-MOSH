import { useCallback, useEffect, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { createSupportReference } from "@/lib/supportReference";

interface StripeEmbeddedCheckoutProps {
  priceId: string;
  quantity?: number;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({
  priceId,
  quantity,
  returnUrl,
}: StripeEmbeddedCheckoutProps) {
  // getStripe() resolves to `null` — not a rejection — when Stripe.js itself
  // fails to load (network drop, an ad-blocker blocking js.stripe.com). Left
  // unhandled, EmbeddedCheckoutProvider just gets a `null` stripe instance
  // and the user sees nothing with no explanation of why.
  const [stripe, setStripe] = useState<Stripe | null | "loading">("loading");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getStripe()
      .then((s) => { if (active) setStripe(s); })
      .catch((error: unknown) => {
        if (!active) return;
        setCheckoutError(error instanceof Error ? error.message : "Unable to initialize payments.");
      });
    return () => { active = false; };
  }, []);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          quantity,
          returnUrl: returnUrl || `${window.location.origin}/pricing?checkout=success`,
          environment: getStripeEnvironment(),
        },
      });
      if (error || !data?.clientSecret) {
        const reference = createSupportReference("pay");
        console.error(`[checkout:${reference}] session creation failed`, error ?? data?.error ?? "Missing client secret");
        throw new Error(`Payments could not be started. Try again; if it continues, contact support with ${reference}.`);
      }
      return data.clientSecret as string;
    } catch (error: unknown) {
      const message = error instanceof Error && error.message.startsWith("Payments could not be started.")
        ? error.message
        : "Payments could not be started. Please try again.";
      setCheckoutError(message);
      throw error;
    }
  }, [priceId, quantity, returnUrl]);

  if (checkoutError) {
    return (
      <div role="alert" className="space-y-4 p-6 text-center text-sm text-destructive">
        <p>Checkout could not be started: {checkoutError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded border border-current px-4 py-2 font-mono text-xs uppercase tracking-[0.2em]"
        >
          Retry checkout
        </button>
      </div>
    );
  }

  if (stripe === "loading") {
    return <div className="p-6 text-center text-sm text-foreground/60">Loading payment form…</div>;
  }

  if (stripe === null) {
    return (
      <div role="alert" className="p-6 text-center text-sm text-destructive">
        Payments failed to load. If you're using an ad blocker or privacy extension, try disabling
        it for this site, or check your network connection and reload the page.
      </div>
    );
  }

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={stripe} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
