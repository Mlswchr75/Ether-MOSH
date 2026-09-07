/**
 * Whether a failed AI-provider response is worth another attempt.
 *
 * Free-tier vision models shed load: a request that succeeds one minute can
 * answer `503 "This model is currently experiencing high demand"` the next.
 * That is a condition the provider itself calls temporary, so failing an
 * upload on the first one hands the user a dead end for a reason that has
 * usually passed by the time they read it.
 *
 * The exception is the case that is expensive to learn the hard way. A 429 can
 * mean two opposite things, and they are distinguishable only from the body:
 *
 *   - an exhausted cap, which refills — worth waiting for
 *   - `limit: 0`, which is not an exhausted quota but *no* quota for that model
 *     on that plan
 *
 * Google returns the second with a `"Please retry in 23s"` that will never come
 * true. Retrying it spends the caller's time to earn a byte-identical refusal,
 * so it is treated as final and surfaced instead.
 */
export function isRetryableProviderError(status: number, body: string): boolean {
  if (status === 429) return !body.includes("limit: 0");
  return status === 500 || status === 502 || status === 503 || status === 504;
}
