import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  entitlementProductForAlias,
  parseAllowedOrigins,
  requireAllowedOrigin,
  requireCheckoutAttemptId,
  requireCheckoutProductAlias,
  requireSafeReturnUrl,
  requireSingleCheckoutQuantity,
} from "./payment-policy.ts";

Deno.test("accepts only the four public checkout aliases", () => {
  assertEquals(requireCheckoutProductAlias("mosh_supporter_once"), "mosh_supporter_once");
  assertEquals(requireCheckoutProductAlias("mosh_tip_25"), "mosh_tip_25");
  assertThrows(() => requireCheckoutProductAlias("price_admin"), Error, "Unknown checkout product");
  assertThrows(() => requireCheckoutProductAlias(null), Error, "Unknown checkout product");
});

Deno.test("maps only exact checkout aliases to entitlements", () => {
  assertEquals(entitlementProductForAlias("mosh_supporter_once"), "mosh_supporter");
  assertEquals(entitlementProductForAlias("mosh_tip_5"), "mosh_tip");
  assertEquals(entitlementProductForAlias("mosh_supporter_admin"), null);
  assertEquals(entitlementProductForAlias("mosh_tip_unlimited"), null);
});

Deno.test("requires one fixed-price item and a UUID checkout attempt", () => {
  assertEquals(requireSingleCheckoutQuantity(undefined), 1);
  assertEquals(requireSingleCheckoutQuantity(1), 1);
  assertThrows(() => requireSingleCheckoutQuantity(2), Error, "must be one");
  assertEquals(
    requireCheckoutAttemptId("123e4567-e89b-42d3-a456-426614174000"),
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assertThrows(() => requireCheckoutAttemptId("retry-me"), Error, "Invalid checkout attempt");
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
