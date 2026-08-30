import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";
import { entitlementProductForAlias } from "../_shared/payment-policy.ts";

let _supabase: ReturnType<typeof createClient<any>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

// Human-readable price id (lookup_key) -> entitlement product id
function productFromPriceId(priceId: string | null | undefined): string | null {
  return entitlementProductForAlias(priceId);
}

async function resolvePriceLookupKeys(env: StripeEnv, sessionId: string): Promise<string[]> {
  const stripe = createStripeClient(env);
  const items = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 20,
    expand: ["data.price"],
  });
  return items.data
    .map((i: any) => i?.price?.lookup_key ?? i?.price?.metadata?.lovable_external_id ?? null)
    .filter((v: string | null): v is string => !!v);
}

async function grantEntitlements(session: any, env: StripeEnv) {
  const userId = session?.metadata?.userId;
  if (!userId) {
    console.warn("checkout session without metadata.userId — nothing to grant");
    return;
  }

  const metadataProduct = productFromPriceId(session?.metadata?.priceId);
  const lookupKeys: string[] = metadataProduct
    ? [session.metadata.priceId]
    : await resolvePriceLookupKeys(env, session.id);

  const rows = lookupKeys
    .map((key) => productFromPriceId(key))
    .filter((p): p is string => !!p)
    .map((product_id) => ({
      user_id: userId,
      product_id,
      transaction_id: session.id,
      customer_id: typeof session.customer === "string" ? session.customer : null,
      environment: env,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    console.warn("no resolvable products on session", session.id);
    return;
  }

  const { error } = await getSupabase()
    .from("entitlements")
    .upsert(rows, { onConflict: "transaction_id,product_id" });
  if (error) throw new Error(`Entitlements upsert failed: ${error.message}`);
}

// Refund / chargeback -> revoke immediately.
async function revokeByPaymentIntent(paymentIntentId: string, env: StripeEnv, reason: string) {
  if (!paymentIntentId) return;
  const stripe = createStripeClient(env);
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 10,
  });
  const sessionIds = sessions.data.map((s: any) => s.id);
  if (sessionIds.length === 0) return;

  const { error, count } = await getSupabase()
    .from("entitlements")
    .delete({ count: "exact" })
    .in("transaction_id", sessionIds)
    .eq("environment", env);
  if (error) {
    throw new Error(`Entitlements revoke failed: ${error.message}`);
  }
  console.log(`Revoked ${count ?? 0} entitlement row(s) (${reason})`);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.payment_status !== "unpaid") await grantEntitlements(session, env);
      break;
    }
    case "checkout.session.async_payment_succeeded":
      await grantEntitlements(event.data.object, env);
      break;
    case "checkout.session.async_payment_failed":
      console.log("async payment failed for session", event.data.object?.id);
      break;
    case "charge.refunded":
    case "charge.dispute.created": {
      const obj = event.data.object;
      const paymentIntent = typeof obj.payment_intent === "string"
        ? obj.payment_intent
        : obj.payment_intent?.id;
      await revokeByPaymentIntent(paymentIntent, env, event.type);
      break;
    }
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("Webhook received with invalid env:", rawEnv);
    return new Response(JSON.stringify({ received: false, error: "invalid env" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await handleWebhook(req, rawEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
