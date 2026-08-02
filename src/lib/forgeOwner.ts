const KEY = "forge_owner_token";

export function getOwnerToken(): string {
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(KEY, t);
  }
  return t;
}
