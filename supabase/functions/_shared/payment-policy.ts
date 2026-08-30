export const CHECKOUT_PRODUCT_ALIASES = [
  "mosh_supporter_once",
  "mosh_tip_1",
  "mosh_tip_5",
  "mosh_tip_25",
] as const;

export type CheckoutProductAlias = (typeof CHECKOUT_PRODUCT_ALIASES)[number];

const checkoutProducts = new Set<string>(CHECKOUT_PRODUCT_ALIASES);

export function requireCheckoutProductAlias(value: unknown): CheckoutProductAlias {
  if (typeof value !== "string" || !checkoutProducts.has(value)) {
    throw new Error("Unknown checkout product");
  }
  return value as CheckoutProductAlias;
}

export function parseAllowedOrigins(configured: string | undefined): Set<string> {
  const raw = configured?.trim() || "https://ether-mosh.online";
  const origins = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return new Set(origins.map((value) => new URL(value).origin));
}

export function requireAllowedOrigin(rawOrigin: string | null, allowedOrigins: Set<string>): string {
  if (!rawOrigin) throw new Error("Missing request origin");
  let origin: string;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    throw new Error("Invalid request origin");
  }
  if (!allowedOrigins.has(origin)) throw new Error("Request origin is not allowed");
  return origin;
}

export function requireSafeReturnUrl(rawUrl: unknown, allowedOrigin: string): string {
  if (typeof rawUrl !== "string" || !rawUrl) {
    return `${allowedOrigin}/pricing?checkout=success`;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, allowedOrigin);
  } catch {
    throw new Error("Invalid returnUrl");
  }
  if (parsed.origin !== allowedOrigin) throw new Error("Invalid returnUrl");
  return parsed.toString();
}
