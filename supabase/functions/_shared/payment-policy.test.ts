import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseAllowedOrigins,
  requireAllowedOrigin,
  requireCheckoutProductAlias,
  requireSafeReturnUrl,
} from "./payment-policy.ts";

Deno.test("accepts only the four public checkout aliases", () => {
  assertEquals(requireCheckoutProductAlias("mosh_supporter_once"), "mosh_supporter_once");
  assertEquals(requireCheckoutProductAlias("mosh_tip_25"), "mosh_tip_25");
  assertThrows(() => requireCheckoutProductAlias("price_admin"), Error, "Unknown checkout product");
  assertThrows(() => requireCheckoutProductAlias(null), Error, "Unknown checkout product");
});

Deno.test("allows only configured request origins", () => {
  const allowed = parseAllowedOrigins("https://ether-mosh.online, http://localhost:8080");
  assertEquals(requireAllowedOrigin("https://ether-mosh.online", allowed), "https://ether-mosh.online");
  assertEquals(requireAllowedOrigin("http://localhost:8080", allowed), "http://localhost:8080");
  assertThrows(() => requireAllowedOrigin("https://evil.example", allowed), Error, "not allowed");
});

Deno.test("keeps checkout returns on the initiating allowed origin", () => {
  assertEquals(
    requireSafeReturnUrl("/pricing?checkout=success", "https://ether-mosh.online"),
    "https://ether-mosh.online/pricing?checkout=success",
  );
  assertThrows(
    () => requireSafeReturnUrl("https://evil.example/paid", "https://ether-mosh.online"),
    Error,
    "Invalid returnUrl",
  );
});
