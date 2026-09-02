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

export default defineTool({
  name: "list_recent_patterns",
  title: "List recent Pattern Forge uploads",
  description:
    "List recent Pattern Forge uploads visible to the signed-in user (RLS-scoped) with their AI artwork analysis (subjects, palette, style tags, mood, recommended effects). Owner tokens are never returned.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Max rows to return (1-50, default 10)."),
    status: z
      .enum(["pending", "complete", "failed"])
      .optional()
      .describe("Optional status filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("pattern_forge_uploads")
      .select("id, filename, uploaded_at, status, analysis, outputs_count")
      .order("uploaded_at", { ascending: false })
      .limit(limit ?? 10);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) {
      return safeMcpError("list-recent-patterns", error);
    }
    return {
      content: [
        { type: "text", text: `${data?.length ?? 0} upload(s)\n\n${JSON.stringify(data, null, 2)}` },
      ],
      structuredContent: { uploads: data ?? [] },
    };
  },
});
