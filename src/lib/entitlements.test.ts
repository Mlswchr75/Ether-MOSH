import { describe, expect, it } from "vitest";
import { deriveEntitlementAccess, resolveEntitlementQuery } from "./entitlements";

describe("entitlement access", () => {
  it("derives supporter and tip access from webhook-owned product grants", () => {
    expect(
      deriveEntitlementAccess(
        [{ product_id: "mosh_supporter" }, { product_id: "mosh_tip" }],
        false,
      ),
    ).toEqual({ isSupporter: true, hasTipped: true });
  });

  it("keeps the owner comp account unlocked with no purchase rows", () => {
    expect(deriveEntitlementAccess([], true)).toEqual({
      isSupporter: true,
      hasTipped: true,
    });
  });

  it("throws query failures instead of disguising them as no purchase", () => {
    expect(() =>
      resolveEntitlementQuery(
        { data: null, error: new Error("row-level policy rejected the query") },
        false,
      ),
    ).toThrow("row-level policy rejected the query");
  });
});
