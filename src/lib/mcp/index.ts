import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEffectsTool from "./tools/list-effects";
import listRecentPatternsTool from "./tools/list-recent-patterns";
import getPatternTool from "./tools/get-pattern";
import savePresetTool from "./tools/save-preset";
import listSavedPresetsTool from "./tools/list-saved-presets";

// Direct Supabase issuer (not the .lovable.cloud proxy). Build from the project
// ref that Vite inlines at build time, so this stays import-safe.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ether-mosh-mcp",
  title: "Ether Mosh MCP",
  version: "0.1.0",
  instructions:
    "Signed-in tools for Ether Mosh by Aesthetic Rebellion. Use `list_effects` to browse the GPU mosh/glitch effect catalog. Use `list_recent_patterns` and `get_pattern` to read Pattern Forge artwork analyses (subjects, palette, style tags, mood, recommended effects) as the signed-in user, subject to RLS. Use `save_preset` to hand a composition (effect stack, forge recipe, or any other tool's params) back into the signed-in user's saved presets — tag it with `sourceType` so it's identifiable later — and `list_saved_presets` to read presets back, optionally filtered by that same sourceType.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEffectsTool, listRecentPatternsTool, getPatternTool, savePresetTool, listSavedPresetsTool],
});
