import { describe, expect, it } from "vitest";
import { editorOwnsKey } from "./wheelKeyboard";

describe("editorOwnsKey", () => {
  it("hands Editor every key when the wheel is closed", () => {
    for (const key of [" ", "Escape", "x", "t", "ArrowUp", "Enter"]) {
      expect(editorOwnsKey(key, false)).toBe(true);
    }
  });

  it("takes Space away — the key that would mosh the stack being tuned", () => {
    expect(editorOwnsKey(" ", true)).toBe(false);
  });

  it("takes Escape away, so it steps back a level instead of also exiting Performance Mode", () => {
    expect(editorOwnsKey("Escape", true)).toBe(false);
  });

  it("keeps T live, so the key that opens the wheel can also close it", () => {
    expect(editorOwnsKey("t", true)).toBe(true);
    expect(editorOwnsKey("T", true)).toBe(true);
  });

  it("takes the single-key triggers that would fight the wheel's own model", () => {
    for (const key of ["x", "s", "z", "c", "g", "m", "a", "r", "v", "u", "l", "y", "?"]) {
      expect(editorOwnsKey(key, true)).toBe(false);
    }
  });

  it("takes the wheel's own steering keys, which Editor must never see", () => {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Backspace", "PageUp", "PageDown"]) {
      expect(editorOwnsKey(key, true)).toBe(false);
    }
  });
});
