import type { CheckoutProductAlias } from "./payment-policy.ts";

type CheckoutEnvironment = "sandbox" | "live";

interface CheckoutSessionOptions {
  stripePriceId: string;
  productAlias: CheckoutProductAlias;
  isRecurring: boolean;
  customerId?: string;
  userId: string;
  returnUrl: string;
  productDescription?: string;
}

export function buildCheckoutSessionBase(options: CheckoutSessionOptions) {
  return {
    line_items: [{ price: options.stripePriceId, quantity: 1 }],
    mode: options.isRecurring ? "subscription" : "payment",
    ui_mode: "embedded_page",
    return_url: options.returnUrl,
    redirect_on_completion: "always",
    // Keep payment_method_types omitted. Stripe's dynamic payment methods can
    // then rank every eligible wallet/card/local method for this buyer.
    adaptive_pricing: { enabled: true },
    client_reference_id: options.userId,
    locale: "auto",
    submit_type: options.productAlias.startsWith("mosh_tip_") ? "donate" : "pay",
    ...(options.customerId && { customer: options.customerId }),
    ...(!options.isRecurring && options.productDescription && {
      payment_intent_data: { description: options.productDescription },
    }),
    metadata: { userId: options.userId, priceId: options.productAlias },
    ...(options.isRecurring && {
      subscription_data: { metadata: { userId: options.userId } },
    }),
  };
}

export function checkoutIdempotencyKey(options: {
  environment: CheckoutEnvironment;
  userId: string;
  productAlias: CheckoutProductAlias;
  checkoutAttemptId: string;
  strategy: "managed" | "standard";
}): string {
  return [
    "mosh",
    options.environment,
    options.userId,
    options.productAlias,
    options.checkoutAttemptId,
    options.strategy,
  ].join(":");
}
