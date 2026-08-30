export type XrHotTrigger = { id: string; label: string };

/** Read the live Hot Trigger registry instead of maintaining a second Quest-only
 * action list. Conditional controls therefore appear in XR only when MOSH has
 * actually mounted them, and custom ordering is preserved. */
export function getXrHotTriggers(root: ParentNode = document): XrHotTrigger[] {
  const seen = new Set<string>();
  const triggers: XrHotTrigger[] = [];
  for (const host of root.querySelectorAll<HTMLElement>("[data-trigger-id]")) {
    const id = host.dataset.triggerId;
    const button = host.querySelector<HTMLButtonElement>("button.hot-trigger:not(:disabled)");
    if (!id || !button || seen.has(id)) continue;
    seen.add(id);
    triggers.push({ id, label: button.getAttribute("aria-label") || button.title || id });
  }
  return triggers;
}

/** Invoke the existing React control so XR and the on-screen wheel share the
 * exact same behavior, permissions, state updates, and analytics. */
export function activateXrHotTrigger(id: string, root: ParentNode = document): boolean {
  for (const host of root.querySelectorAll<HTMLElement>("[data-trigger-id]")) {
    if (host.dataset.triggerId !== id) continue;
    const button = host.querySelector<HTMLButtonElement>("button.hot-trigger:not(:disabled)");
    if (!button) continue;
    button.click();
    return true;
  }
  return false;
}

