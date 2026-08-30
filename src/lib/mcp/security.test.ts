import { describe, expect, it } from "vitest";
import { MAX_PRESET_PARAMS_BYTES, presetParamsSchema, validatePresetParams } from "./security";

describe("MCP preset payload security", () => {
  it("accepts a normal effect preset", () => {
    expect(presetParamsSchema.safeParse({ layers: [{ effectId: "pixel-sort", amount: 0.8 }] }).success).toBe(true);
  });

  it("rejects oversized payloads", () => {
    const value = { data: "x".repeat(MAX_PRESET_PARAMS_BYTES) };
    expect(validatePresetParams(value)).toMatch(/too large/i);
  });

  it("rejects excessive nesting", () => {
    let value: Record<string, unknown> = {};
    for (let i = 0; i < 14; i += 1) value = { nested: value };
    expect(validatePresetParams(value)).toMatch(/nested too deeply/i);
  });

  it("rejects prototype-pollution keys", () => {
    const value = JSON.parse('{"__proto__":{"admin":true}}') as Record<string, unknown>;
    expect(validatePresetParams(value)).toMatch(/reserved key/i);
  });
});
