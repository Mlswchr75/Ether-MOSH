import Stripe from "https://esm.sh/stripe@22.0.2";
import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Resolve the caller from their JWT. Never trust a client-supplied userId.
async function getCaller(req: Request): Promise<{ id: string; email?: string } | null> {
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
  return { id: data.user.id, email: data.user.email ?? undefined };
}

// Only allow post-payment redirects back to the origin that initiated checkout.
function safeReturnUrl(rawUrl: unknown, req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(origin).origin;
  } catch {
    throw new Error("Invalid request origin");
  }
  if (typeof rawUrl !== "string" || !rawUrl) return `${allowedOrigin}/pricing?checkout=success`;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, allowedOrigin);
  } catch {
    throw new Error("Invalid returnUrl");
  }
  if (parsed.origin !== allowedOrigin) throw new Error("Invalid returnUrl");
  return parsed.toString();
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
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

async function createCheckoutSession(options: {
  priceId: string;
  quantity?: number;
  customerEmail?: string;
  userId?: string;
  returnUrl: string;
  environment: StripeEnv;
}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.priceId)) throw new Error("Invalid priceId");
  const stripe = createStripeClient(options.environment);

  const prices = await stripe.prices.list({ lookup_keys: [options.priceId] });
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

  const base = {
    line_items: [{ price: stripePrice.id, quantity: options.quantity || 1 }],
    mode: isRecurring ? "subscription" : "payment",
    ui_mode: "embedded_page",
    return_url: options.returnUrl,
    ...(customerId && { customer: customerId }),
    ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
    ...(options.userId && {
      metadata: { userId: options.userId, priceId: options.priceId },
      ...(isRecurring && {
        subscription_data: { metadata: { userId: options.userId } },
      }),
    }),
  } as unknown as Stripe.Checkout.SessionCreateParams;

  // Digital goods: let Stripe handle tax compliance, fraud, disputes and
  // transaction support end-to-end. Falls back to tax calculation only if
  // the seller account isn't eligible for full compliance handling.
  try {
    const session = await stripe.checkout.sessions.create({
      ...base,
      managed_payments: { enabled: true },
    } as Stripe.Checkout.SessionCreateParams);
    return session.client_secret;
  } catch (e) {
    console.warn("managed payments unavailable, falling back to tax calculation:", e);
    const session = await stripe.checkout.sessions.create({
      ...base,
      automatic_tax: { enabled: true },
    } as Stripe.Checkout.SessionCreateParams);
    return session.client_secret;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  const caller = await getCaller(req);
  if (!caller) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const body = await req.json();
    const environment: StripeEnv = body.environment === "live" ? "live" : "sandbox";
    const clientSecret = await createCheckoutSession({
      priceId: body.priceId,
      quantity: body.quantity,
      // Identity comes from the verified JWT only — client values are ignored.
      customerEmail: caller.email,
      userId: caller.id,
      returnUrl: safeReturnUrl(body.returnUrl, req),
      environment,
    });

    return new Response(JSON.stringify({ clientSecret }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Checkout failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

