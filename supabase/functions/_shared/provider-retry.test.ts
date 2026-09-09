import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isRetryableProviderError } from "./provider-retry.ts";

/** The body Google actually returns when a model is capacity-shed. */
const HIGH_DEMAND =
  '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}';

/** The body that reads like a rate limit but is a plan boundary. */
const NO_FREE_QUOTA =
  '{"error":{"code":429,"message":"You exceeded your current quota. * Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\\nPlease retry in 23.694915671s.","status":"RESOURCE_EXHAUSTED"}}';

/** A genuine per-minute cap, which does refill. */
const PER_MINUTE_CAP =
  '{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 15, model: gemini-3.6-flash","status":"RESOURCE_EXHAUSTED"}}';

Deno.test("retries the temporary overload the provider calls temporary", () => {
  assertEquals(isRetryableProviderError(503, HIGH_DEMAND), true);
});

Deno.test("retries a cap that refills", () => {
  assertEquals(isRetryableProviderError(429, PER_MINUTE_CAP), true);
});

Deno.test("does not retry `limit: 0` — no quota is not an exhausted quota", () => {
  // The same response carries "Please retry in 23s". Believing it costs the
  // caller the wait and returns the identical refusal.
  assertEquals(isRetryableProviderError(429, NO_FREE_QUOTA), false);
});

Deno.test("retries transient upstream 5xx", () => {
  for (const status of [500, 502, 503, 504]) {
    assertEquals(isRetryableProviderError(status, ""), true, `expected ${status} retryable`);
  }
});

Deno.test("never retries a request the provider rejected on its merits", () => {
  // A retired model id (404), a malformed request (400), a bad key (401/403)
  // and an unsupported media type return the same answer however many times asked.
  for (const status of [400, 401, 403, 404, 413, 415, 422]) {
    assertEquals(isRetryableProviderError(status, ""), false, `expected ${status} final`);
  }
});

Deno.test("a 200 is never routed through the retry predicate as retryable", () => {
  assertEquals(isRetryableProviderError(200, ""), false);
});
