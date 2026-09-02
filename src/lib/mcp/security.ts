import { z } from "zod";

export const MAX_PRESET_PARAMS_BYTES = 64 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 5_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function validatePresetParams(value: Record<string, unknown>): string | null {
  let nodes = 0;
  let serialized: string;

  try {
    serialized = JSON.stringify(value);
  } catch {
    return "Preset params must be valid JSON.";
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_PRESET_PARAMS_BYTES) {
    return "Preset params are too large (64 KB maximum).";
  }

  const visit = (candidate: unknown, depth: number): string | null => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) return "Preset params contain too many values.";
    if (depth > MAX_JSON_DEPTH) return "Preset params are nested too deeply.";
    if (!candidate || typeof candidate !== "object") return null;
    if (Array.isArray(candidate)) {
      for (const child of candidate) {
        const issue = visit(child, depth + 1);
        if (issue) return issue;
      }
      return null;
    }
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (key.length > 128) return "Preset param keys must be 128 characters or fewer.";
      if (FORBIDDEN_KEYS.has(key)) return "Preset params contain a reserved key.";
      const issue = visit(child, depth + 1);
      if (issue) return issue;
    }
    return null;
  };

  return visit(value, 0);
}

export const presetParamsSchema = z.record(z.string(), z.unknown()).superRefine((value, ctx) => {
  const issue = validatePresetParams(value);
  if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
});

export function safeMcpError(operation: string, error: unknown) {
  // Detailed database/provider errors stay in server logs. Returning them to
  // clients exposes schema, policy and infrastructure details useful for
  // reconnaissance.
  console.error(`[mcp:${operation}] request failed`, error);
  return {
    content: [{ type: "text" as const, text: "Request failed. Try again later." }],
    isError: true,
  };
}
