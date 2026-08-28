import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
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

    if (row.storage_path) {
      await admin.storage.from("forge-uploads").remove([row.storage_path]);
    }
    const { error: delErr } = await admin
      .from("pattern_forge_uploads")
      .delete()
      .eq("id", rowId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forge-delete error", e);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

});
