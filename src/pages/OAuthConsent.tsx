import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";

type AnyAuthOauth = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};
const authOauth = () =>
  (supabase.auth as unknown as { oauth: AnyAuthOauth }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await authOauth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) return setError(error.message ?? "Could not load authorization");
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = approve
        ? await authOauth().approveAuthorization(authorizationId)
        : await authOauth().denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        return setError(error.message ?? "Could not complete authorization");
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        return setError("No redirect returned by the authorization server.");
      }
      window.location.href = target;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Failed to submit");
    }
  }

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Authorize — MOSH</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div
        className="w-full max-w-md rounded-2xl border border-primary/40 bg-background/60 p-6 backdrop-blur"
        style={{ boxShadow: "0 0 60px hsl(var(--primary) / 0.25)" }}
      >
        <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/60">
          authorize
        </div>
        <div className="mb-5 mosh-text text-center font-sans text-2xl font-bold tracking-tight text-primary" data-text="MOSH">
          MOSH
        </div>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 font-mono text-xs text-destructive">
            {error}
          </div>
        )}

        {!error && !details && (
          <div className="font-mono text-xs text-foreground/60">loading…</div>
        )}

        {!error && details && (
          <>
            <h1 className="mb-2 font-mono text-sm uppercase tracking-[0.2em]">
              Connect {details.client?.name ?? details.client?.client_name ?? "an app"} to your account
            </h1>
            <p className="mb-4 text-sm text-foreground/70">
              This lets {details.client?.name ?? details.client?.client_name ?? "the client"} use MOSH as you — reading your Pattern Forge uploads and effect catalog through the app's MCP tools, subject to your permissions.
            </p>
            {details.client?.redirect_uri && (
              <p className="mb-4 break-all font-mono text-[10px] uppercase tracking-widest text-foreground/40">
                redirect: {details.client.redirect_uri}
              </p>
            )}
            <p className="mb-6 font-mono text-[10px] uppercase tracking-widest text-foreground/40">
              This does not bypass RLS or backend policies.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(true)}
                className="inline-flex items-center justify-center rounded-full border border-primary/60 bg-primary/10 px-6 py-3 font-mono text-sm uppercase tracking-[0.28em] text-primary hover:bg-primary/20 disabled:opacity-60 min-h-[48px]"
              >
                {busy ? "…" : "approve"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide(false)}
                className="inline-flex items-center justify-center rounded-full border border-foreground/25 bg-background/40 px-6 py-3 font-mono text-sm uppercase tracking-[0.28em] text-foreground/80 hover:bg-foreground/5 disabled:opacity-60 min-h-[48px]"
              >
                cancel connection
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
