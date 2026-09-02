/** Correlates a safe user-facing failure with the detailed local console log. */
export function createSupportReference(scope: string): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
    : Date.now().toString(36).slice(-8);
  return `${scope.toUpperCase()}-${suffix}`;
}
