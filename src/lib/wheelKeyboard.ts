/**
 * Who owns the keyboard when the Parameters Wheel is open.
 *
 * The wheel and Editor's shortcut handler both listen on `window`. Sibling
 * listeners on the same target are not stopped by `preventDefault`, and their
 * order depends on effect mount order, so the wheel cannot defend itself —
 * Editor has to stand down explicitly. Without that, Space both activated the
 * highlighted slot and fell through to a full mosh, throwing away the very
 * stack the user opened the wheel to tune, and Escape stepped back a level
 * *and* dropped out of Performance Mode.
 *
 * Lives here rather than inline in Editor so the rule is one testable thing
 * instead of a condition a test can only re-describe.
 */
export function editorOwnsKey(key: string, paramWheelOpen: boolean): boolean {
  if (!paramWheelOpen) return true;
  // T opens the wheel, so it has to be able to close it too.
  return key === "t" || key === "T";
}
