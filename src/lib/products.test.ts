import { describe, expect, it } from "vitest";
import { getCheckoutProduct } from "./products";

describe("checkout products", () => {
  it("maps the supporter alias without accepting a raw Stripe price ID", () => {
    expect(getCheckoutProduct("mosh_supporter_once")).toEqual({
      alias: "mosh_supporter_once",
      label: "MOSH Supporter unlock",
      amount: "$4.99",
    });
    expect(getCheckoutProduct("price_live_secret_value")).toBeNull();
  });

  it.each([
    ["mosh_tip_1", "$1.00"],
    ["mosh_tip_5", "$5.00"],
    ["mosh_tip_25", "$25.00"],
  ])("accepts the known tip alias %s", (alias, amount) => {
    expect(getCheckoutProduct(alias)?.amount).toBe(amount);
  });
});
