export interface EntitlementProductRow {
  product_id: string;
}

interface EntitlementQueryResult {
  data: EntitlementProductRow[] | null;
  error: { message: string } | null;
}

export function deriveEntitlementAccess(
  rows: EntitlementProductRow[],
  owner: boolean,
): { isSupporter: boolean; hasTipped: boolean } {
  const ids = new Set(rows.map((row) => row.product_id));
  return {
    isSupporter: owner || ids.has("mosh_supporter"),
    hasTipped: owner || ids.has("mosh_tip"),
  };
}

export function resolveEntitlementQuery(
  result: EntitlementQueryResult,
  owner: boolean,
): { isSupporter: boolean; hasTipped: boolean } {
  if (result.error) throw new Error(result.error.message);
  return deriveEntitlementAccess(result.data ?? [], owner);
}
