import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ANALYZE_TOOL = {
  type: "function",
  function: {
    name: "analyze_artwork",
    description:
      "Deep semantic analysis of source artwork for pattern generation. Return rigorous, exhaustive, production-grade tags.",
    parameters: {
      type: "object",
      properties: {
        subjects: { type: "array", items: { type: "string" } },
        style_tags: { type: "array", items: { type: "string" } },
        palette: {
          type: "array",
          items: {
            type: "object",
            properties: {
              hex: { type: "string" },
              name: { type: "string" },
              weight: { type: "number" },
            },
            required: ["hex", "weight"],
            additionalProperties: false,
          },
        },
        shape_mix: {
          type: "object",
          properties: {
            organic: { type: "number" },
            geometric: { type: "number" },
            linear: { type: "number" },
            painterly: { type: "number" },
          },
          required: ["organic", "geometric", "linear", "painterly"],
          additionalProperties: false,
        },
        composition: {
          type: "object",
          properties: {
            density: { type: "string", enum: ["sparse", "balanced", "dense", "overwhelming"] },
            symmetry: { type: "string", enum: ["none", "radial", "bilateral", "translational"] },
            focal_point: { type: "string", enum: ["center", "off-center", "edge", "distributed"] },
          },
          required: ["density", "symmetry", "focal_point"],
          additionalProperties: false,
        },
        texture: {
          type: "object",
          properties: {
            grain: { type: "string", enum: ["smooth", "fine", "coarse", "noisy"] },
            edges: { type: "string", enum: ["clean", "soft", "rough", "torn"] },
            detail_level: { type: "string", enum: ["low", "medium", "high", "extreme"] },
          },
          required: ["grain", "edges", "detail_level"],
          additionalProperties: false,
        },
        mood: { type: "array", items: { type: "string" } },
        recommended_effects: { type: "array", items: { type: "string" } },
        tileability_notes: { type: "string" },
      },
      required: [
        "subjects",
        "style_tags",
        "palette",
        "shape_mix",
        "composition",
        "texture",
        "mood",
        "recommended_effects",
        "tileability_notes",
      ],
      additionalProperties: false,
    },
  },
} as const;

// Google's OpenAI-compatible endpoint for the Gemini API — same request/response
// shape (including tool calling) as the old Lovable AI gateway call, so this is a
// drop-in swap: different base URL and bearer key, identical body shape below.
const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const { rowId, ownerToken } = await req.json();
    if (!rowId || !ownerToken) {
      return new Response(JSON.stringify({ error: "rowId and ownerToken required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify ownership before doing any work
    const { data: row, error: rowErr } = await admin
      .from("pattern_forge_uploads")
      .select("id, owner_token, storage_path")
      .eq("id", rowId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row || row.owner_token !== ownerToken) {
      return new Response(JSON.stringify({ error: "not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Derive imageUrl server-side from storage_path — never trust client input.
    const { data: pub } = admin.storage.from("forge-uploads").getPublicUrl(row.storage_path);
    const imageUrl = pub.publicUrl;

    const resp = await fetch(GEMINI_OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "You are a senior art director analyzing artwork for production-grade seamless pattern generation. Be rigorous, exhaustive, and concrete. Always call the analyze_artwork tool exactly once with complete fields.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this artwork for pattern forge." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },

        ],
        tools: [ANALYZE_TOOL],
        tool_choice: { type: "function", function: { name: "analyze_artwork" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please retry shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await resp.text();
      console.error("Gemini API error", resp.status, t);
      await admin
        .from("pattern_forge_uploads")
        .update({ status: "failed", error: `gemini ${resp.status}` })
        .eq("id", rowId);
      return new Response(JSON.stringify({ error: "AI analysis error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      await admin
        .from("pattern_forge_uploads")
        .update({ status: "failed", error: "no tool call" })
        .eq("id", rowId);
      return new Response(JSON.stringify({ error: "No tool call returned" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const analysis = JSON.parse(toolCall.function.arguments);

    await admin
      .from("pattern_forge_uploads")
      .update({ analysis, status: "complete", error: null })
      .eq("id", rowId);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forge-analyze error", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

});
