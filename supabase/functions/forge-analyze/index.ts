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

// Every provider below speaks the same OpenAI-compatible chat-completions shape
// (messages, tools, tool_choice, Authorization: Bearer) — this is what makes
// swapping providers a config change, not a rewrite.
type ProviderId = "openrouter" | "groq" | "gemini";

const PROVIDERS: Record<ProviderId, { endpoint: string; apiKeyEnv: string; defaultModel?: string }> = {
  // Free, no card required. "openrouter/free" is OpenRouter's own auto-router
  // (launched Feb 2026): it picks whichever currently-free model supports
  // vision + tool calling + structured output, and keeps working as individual
  // free models rotate out from under it — the actual fix for the failure mode
  // below (a pinned model id retiring with no warning), not just a deferral of it.
  // Rate limit is tight (20 req/min, 200/day) but ample for this feature's volume.
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "openrouter/free",
  },
  // Free, no card, much higher throughput than OpenRouter's free tier — but its
  // free vision-capable model is a named preview, which can retire the same way
  // gemini-2.5-pro did below. No default model here on purpose: check
  // https://console.groq.com/docs/models for a current vision + tool-calling
  // model and set AI_MODEL explicitly rather than trusting a name pinned in code.
  groq: {
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    apiKeyEnv: "GROQ_API_KEY",
  },
  // Free tier, no card — but only on the right model. The pro line is what
  // needs billing: gemini-3.1-pro-preview answers `limit: 0` on a free key,
  // which is no quota at all rather than an exhausted one, so no amount of
  // retrying reaches it. The flash line is free, and gemini-3.6-flash is
  // verified against this function's exact request (vision + forced tool call)
  // on a free key — it is what the 404 from the retired gemini-2.5-flash names
  // as its own replacement.
  gemini: {
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    apiKeyEnv: "GEMINI_API_KEY",
    // Google retires model aliases on its own schedule, and a retired one fails
    // at call time rather than deploy time — gemini-2.5-pro, pinned here
    // originally, now 404s for any account created after it closed to new users.
    defaultModel: "gemini-3.6-flash",
  },
};

/**
 * Inline images ride inside the JSON request body, and base64 inflates bytes by
 * about a third, so the cap is on the raw file rather than the encoded string.
 */
const MAX_IMAGE_BYTES = 12_000_000;

/**
 * `btoa` needs a binary string, and spreading a whole image into
 * `String.fromCharCode` blows the argument limit on anything but a thumbnail —
 * hence the chunking.
 */
function base64(bytes: Uint8Array): string {
  const CHUNK = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Defaults to gemini because that is the provider whose key this project has
// configured, and because the free-tier path through it is measured rather than
// assumed. openrouter stays a one-variable switch for anyone who would rather
// not hold a Google key — its auto-router is the better answer to model churn,
// it just needs an OPENROUTER_API_KEY that does not exist here yet.
const AI_PROVIDER = (Deno.env.get("AI_PROVIDER") ?? "gemini") as ProviderId;
const PROVIDER = PROVIDERS[AI_PROVIDER];
if (!PROVIDER) {
  throw new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}" — expected one of ${Object.keys(PROVIDERS).join(", ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get(PROVIDER.apiKeyEnv);
    // Message references AI_PROVIDER, not PROVIDER.apiKeyEnv (or apiKey) — the
    // catch-all below logs this, and nothing that looks like a credential
    // field name should ever reach a log line, real secret or not. Which env
    // var a given provider needs is documented in supabase/README.md.
    if (!apiKey) throw new Error(`AI provider "${AI_PROVIDER}" is missing its API key`);
    const model = Deno.env.get("AI_MODEL") ?? PROVIDER.defaultModel;
    if (!model) throw new Error(`AI_MODEL must be set for provider "${AI_PROVIDER}" (it has no default)`);

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

    // The image is read server-side from storage_path and sent inline rather
    // than handed over as a url. Gemini's OpenAI-compatible endpoint will not
    // fetch a remote `image_url` — every current model answers
    // `400 INVALID_ARGUMENT` for one, even with tools stripped out and the
    // image as the only content; only a `data:` uri gets through. Every
    // OpenAI-shaped endpoint accepts a data uri, so inlining is the portable
    // choice across all three providers rather than a gemini special case.
    // Reading through the service-role client also keeps working if
    // `forge-uploads` ever stops being public, which a public-url build
    // would not.
    const { data: blob, error: dlErr } = await admin.storage
      .from("forge-uploads")
      .download(row.storage_path);
    if (dlErr || !blob) throw dlErr ?? new Error("storage object missing");

    const mime = blob.type || "image/jpeg";
    if (mime.includes("svg")) {
      // Vector never rasterises on the model's side; sending it spends a call
      // to earn an opaque 400. Say so plainly instead.
      await admin
        .from("pattern_forge_uploads")
        .update({ status: "failed", error: "svg is not analysable — upload a raster export" })
        .eq("id", rowId);
      return new Response(JSON.stringify({ error: "SVG uploads can't be analysed. Export a PNG or JPG first." }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      await admin
        .from("pattern_forge_uploads")
        .update({ status: "failed", error: `image too large (${bytes.byteLength} bytes)` })
        .eq("id", rowId);
      return new Response(JSON.stringify({ error: "Image is too large to analyse." }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const imageUrl = `data:${mime};base64,${base64(bytes)}`;

    const resp = await fetch(PROVIDER.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
      // Read and log the body before branching. A 429 used to return silently,
      // which hid the one detail that decides whether a retry is worth anything:
      // an exhausted per-minute cap says "wait", but `limit: 0` says the model
      // has no quota on this plan at all and waiting will never help.
      const t = await resp.text();
      console.error("AI provider error", AI_PROVIDER, resp.status, model, t);

      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please retry shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await admin
        .from("pattern_forge_uploads")
        .update({ status: "failed", error: `${AI_PROVIDER} ${resp.status} (${model})` })
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
