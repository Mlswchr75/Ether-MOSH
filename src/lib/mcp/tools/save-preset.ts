import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * The write half of the MCP surface, currently missing per the read-only
 * list_effects / list_recent_patterns / get_pattern trio: this is what lets
 * a sibling app (or any MCP client) hand a composition back into Ether Mosh
 * as a saved preset, instead of only ever reading from it. `source_type` is
 * free text so a caller can tag where a preset came from (e.g.
 * "motion-weaver") without a schema change on either side.
 */
export default defineTool({
  name: "save_preset",
  title: "Save a preset",
  description:
    "Save a named preset (effect stack, forge recipe, or any other tool's params blob) to the signed-in user's saved_presets, subject to RLS. Use source_type to tag where the preset came from (e.g. 'ether-mosh', 'motion-weaver') so a client can later filter list_effects/list_recent_patterns-style reads by origin.",
  inputSchema: {
    name: z.string().min(1).max(200).describe("Display name for the preset."),
    sourceType: z
      .string()
      .min(1)
      .max(64)
      .describe("Free-text tag for where this preset came from, e.g. 'ether-mosh' or 'motion-weaver'."),
    params: z
      .record(z.string(), z.unknown())
      .describe("Arbitrary JSON params for the preset (effect stack, forge macros, recipe id, seed, etc.)."),
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ name, sourceType, params }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return { content: [{ type: "text", text: `Error resolving user: ${userError?.message ?? "unknown"}` }], isError: true };
    }
    const row = {
      id: randomUUID(),
      user_id: userData.user.id,
      name,
      source_type: sourceType,
      params: params as Record<string, unknown>,
    };
    const { data, error } = await supabase
      .from("saved_presets")
      .insert(row)
      .select("id, name, source_type, params, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { preset: data },
    };
  },
});
