import Stripe from "https://esm.sh/stripe@22.0.2";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import {
  parseAllowedOrigins,
  requireAllowedOrigin,
  requireCheckoutAttemptId,
  requireCheckoutProductAlias,
  requireSafeReturnUrl,
  requireSingleCheckoutQuantity,
} from "../_shared/payment-policy.ts";
import {
  buildCheckoutSessionBase,
  checkoutIdempotencyKey,
} from "../_shared/checkout-session.ts";

const allowedOrigins = parseAllowedOrigins(Deno.env.get("PAYMENTS_ALLOWED_ORIGINS"));

function corsHeaders(origin?: string) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Resolve the caller from their JWT. Never trust a client-supplied userId.
async function getCaller(req: Request): Promise<{ id: string; email?: string; token: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined, token };
}

async function hasSupporterEntitlement(
  token: string,
  userId: string,
  environment: StripeEnv,
): Promise<boolean> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await supabase
    .from("entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", "mosh_supporter")
    .eq("environment", environment)
    .limit(1);
  if (error) throw new Error("Unable to verify existing access");
  return (data?.length ?? 0) > 0;
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (!customer.metadata?.userId || customer.metadata.userId === options.userId) {
        if (options.userId && customer.metadata?.userId !== options.userId) {
          await stripe.customers.update(customer.id, {
            metadata: { ...customer.metadata, userId: options.userId },
          });
        }
        return customer.id;
      }
      // Never reassign a customer already bound to another app account. A
      // fresh customer is safer than exposing that customer's saved methods.
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

async function createCheckoutSession(options: {
  productAlias: ReturnType<typeof requireCheckoutProductAlias>;
  checkoutAttemptId: string;
  customerEmail?: string;
  userId: string;
  returnUrl: string;
  environment: StripeEnv;
}) {
  const stripe = createStripeClient(options.environment);

  const prices = await stripe.prices.list({
    lookup_keys: [options.productAlias],
    active: true,
    limit: 1,
  });
  if (!prices.data.length) throw new Error("Price not found");
  const stripePrice = prices.data[0];
  const isRecurring = stripePrice.type === "recurring";

  const customerId = options.customerEmail || options.userId
    ? await resolveOrCreateCustomer(stripe, {
        email: options.customerEmail,
        userId: options.userId,
      })
    : undefined;

  let productDescription: string | undefined;
  if (!isRecurring) {
    const productId = typeof stripePrice.product === "string"
      ? stripePrice.product
      : (stripePrice.product as any).id;
    const product = await stripe.products.retrieve(productId);
    productDescription = product.name;
  }

  const base = buildCheckoutSessionBase({
    stripePriceId: stripePrice.id,
    productAlias: options.productAlias,
    isRecurring,
    customerId,
    userId: options.userId,
    returnUrl: options.returnUrl,
    productDescription,
  }) as unknown as Stripe.Checkout.SessionCreateParams;

  // Digital goods: let Stripe handle tax compliance, fraud, disputes and
  // transaction support end-to-end. Falls back to tax calculation only if
  // the seller account isn't eligible for full compliance handling.
  try {
    const session = await stripe.checkout.sessions.create({
      ...base,
      managed_payments: { enabled: true },
    } as Stripe.Checkout.SessionCreateParams, {
      idempotencyKey: checkoutIdempotencyKey({ ...options, strategy: "managed" }),
    });
    return session.client_secret;
  } catch (e) {
    console.warn("managed payments unavailable, falling back to tax calculation:", e);
    const session = await stripe.checkout.sessions.create({
      ...base,
      automatic_tax: { enabled: true },
    } as Stripe.Checkout.SessionCreateParams, {
      idempotencyKey: checkoutIdempotencyKey({ ...options, strategy: "standard" }),
    });
    return session.client_secret;
  }
}

Deno.serve(async (req) => {
  let requestOrigin: string;
  try {
    requestOrigin = requireAllowedOrigin(req.headers.get("origin"), allowedOrigins);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Origin rejected" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const responseHeaders = corsHeaders(requestOrigin);
  if (req.method === "OPTIONS") return new Response(null, { headers: responseHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: responseHeaders });
  }
  const caller = await getCaller(req);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const body = await req.json();
    const productAlias = requireCheckoutProductAlias(body.productAlias ?? body.priceId);
    const checkoutAttemptId = requireCheckoutAttemptId(body.checkoutAttemptId);
    requireSingleCheckoutQuantity(body.quantity);
    const environment: StripeEnv = body.environment === "live" ? "live" : "sandbox";
    if (
      productAlias === "mosh_supporter_once" &&
      await hasSupporterEntitlement(caller.token, caller.id, environment)
    ) {
      return new Response(JSON.stringify({ error: "Supporter access is already unlocked" }), {
        status: 409,
        headers: { ...responseHeaders, "Content-Type": "application/json" },
      });
    }
    const clientSecret = await createCheckoutSession({
      productAlias,
      checkoutAttemptId,
      // Identity comes from the verified JWT only — client values are ignored.
      customerEmail: caller.email,
      userId: caller.id,
      returnUrl: requireSafeReturnUrl(body.returnUrl, requestOrigin),
      environment,
    });

    return new Response(JSON.stringify({ clientSecret }), {
      status: 200,
      headers: { ...responseHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Checkout failed" }),
      { status: 400, headers: { ...responseHeaders, "Content-Type": "application/json" } },
    );
  }
});
