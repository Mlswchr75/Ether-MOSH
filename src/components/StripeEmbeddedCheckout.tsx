import { useEffect, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    let active = true;
    getStripe().then((s) => { if (active) setStripe(s); });
    return () => { active = false; };
  }, []);

  const fetchClientSecret = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        quantity,
        returnUrl: returnUrl || `${window.location.origin}/pricing?checkout=success`,
        environment: getStripeEnvironment(),
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || data?.error || "Failed to create checkout session");
    }
    return data.clientSecret as string;
  };

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
