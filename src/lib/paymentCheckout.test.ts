import { describe, expect, it } from "vitest";
import {
  buildCheckoutSessionBase,
  checkoutIdempotencyKey,
} from "../../supabase/functions/_shared/checkout-session";
import {
  entitlementProductForAlias,
  requireCheckoutAttemptId,
  requireSingleCheckoutQuantity,
} from "../../supabase/functions/_shared/payment-policy";

describe("payment checkout policy", () => {
  it("uses dynamic payment methods with adaptive local pricing", () => {
    const session = buildCheckoutSessionBase({
      stripePriceId: "price_test",
      productAlias: "mosh_supporter_once",
      isRecurring: false,
      userId: "user_123",
      returnUrl: "https://ether-mosh.online/pricing?checkout=success",
      productDescription: "Ether-MOSH unlock",
    });

    expect(session).toMatchObject({
      line_items: [{ price: "price_test", quantity: 1 }],
      mode: "payment",
      ui_mode: "embedded_page",
      redirect_on_completion: "always",
      adaptive_pricing: { enabled: true },
      locale: "auto",
      client_reference_id: "user_123",
      submit_type: "pay",
      metadata: { userId: "user_123", priceId: "mosh_supporter_once" },
    });
    expect(session).not.toHaveProperty("payment_method_types");
  });

  it("gives retries a stable strategy-specific idempotency key", () => {
    const input = {
      environment: "live" as const,
      userId: "user_123",
      productAlias: "mosh_tip_5" as const,
      checkoutAttemptId: "123e4567-e89b-42d3-a456-426614174000",
    };
    expect(checkoutIdempotencyKey({ ...input, strategy: "managed" }))
      .toBe("mosh:live:user_123:mosh_tip_5:123e4567-e89b-42d3-a456-426614174000:managed");
    expect(checkoutIdempotencyKey({ ...input, strategy: "standard" }))
      .not.toBe(checkoutIdempotencyKey({ ...input, strategy: "managed" }));
  });

  it("rejects quantity inflation and broad entitlement prefixes", () => {
    expect(requireSingleCheckoutQuantity(undefined)).toBe(1);
    expect(() => requireSingleCheckoutQuantity(3)).toThrow("must be one");
    expect(requireCheckoutAttemptId("123e4567-e89b-42d3-a456-426614174000"))
      .toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(entitlementProductForAlias("mosh_supporter_once")).toBe("mosh_supporter");
    expect(entitlementProductForAlias("mosh_supporter_admin")).toBeNull();
  });
});
