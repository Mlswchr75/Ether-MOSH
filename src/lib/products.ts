export interface CheckoutProduct {
  alias: "mosh_supporter_once" | "mosh_tip_1" | "mosh_tip_5" | "mosh_tip_25";
  label: string;
  amount: string;
}

const PRODUCTS: Record<CheckoutProduct["alias"], CheckoutProduct> = {
  mosh_supporter_once: {
    alias: "mosh_supporter_once",
    label: "MOSH Supporter unlock",
    amount: "$4.99",
  },
  mosh_tip_1: { alias: "mosh_tip_1", label: "MOSH tip", amount: "$1.00" },
  mosh_tip_5: { alias: "mosh_tip_5", label: "MOSH tip", amount: "$5.00" },
  mosh_tip_25: { alias: "mosh_tip_25", label: "MOSH tip", amount: "$25.00" },
};

export function getCheckoutProduct(alias: string | null): CheckoutProduct | null {
  if (!alias || !(alias in PRODUCTS)) return null;
  return PRODUCTS[alias as CheckoutProduct["alias"]];
}
