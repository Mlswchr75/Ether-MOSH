import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { EFFECTS } from "../../../engine/effects";

export default defineTool({
  name: "list_effects",
  title: "List effects",
  description:
    "List every GPU mosh/glitch effect available in Ether Mosh, with id, display name, category, and one-line description.",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe("Optional category filter (e.g. 'corruption'). Case-insensitive."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ category }) => {
    const cat = category?.toLowerCase();
    const rows = EFFECTS
      .filter((e) => (cat ? String(e.category).toLowerCase() === cat : true))
      .map((e) => ({
        id: e.id,
        name: e.name,
        category: e.category,
        description: e.blurb,
      }));
    return {
      content: [{ type: "text", text: `${rows.length} effect(s)\n\n${JSON.stringify(rows, null, 2)}` }],
      structuredContent: { effects: rows },
    };
  },
});
