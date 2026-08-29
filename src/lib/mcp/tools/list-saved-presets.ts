import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { safeMcpError } from "../security";

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

/** Read half of the save_preset bridge — lets a client (e.g. a sibling app) see what's already been saved, optionally filtered to its own source_type. */
export default defineTool({
  name: "list_saved_presets",
  title: "List saved presets",
  description:
    "List the signed-in user's saved_presets (RLS-scoped), optionally filtered by source_type (e.g. 'motion-weaver') to see only presets handed off from a particular tool.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return (1-50, default 10)."),
    sourceType: z.string().min(1).max(64).optional().describe("Optional exact source_type filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, sourceType }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("saved_presets")
      .select("id, name, source_type, params, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (sourceType) q = q.eq("source_type", sourceType);
    const { data, error } = await q;
    if (error) {
      return safeMcpError("list-saved-presets", error);
    }
    return {
      content: [{ type: "text", text: `${data?.length ?? 0} preset(s)\n\n${JSON.stringify(data, null, 2)}` }],
      structuredContent: { presets: data ?? [] },
    };
  },
});
