import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Sparkles, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentsEnvironmentSafe } from "@/lib/stripe";
import { RequireAuth } from "@/components/RequireAuth";

function getPaymentsEnvironment(): "live" | "sandbox" {
  return getPaymentsEnvironmentSafe();
}

interface EntitlementRow {
  product_id: string;
  transaction_id: string | null;
  environment: string;
  created_at: string;
}

const productLabel = (id: string) =>
  id === "mosh_supporter" ? "Supporter unlock" : id === "mosh_tip" ? "Tip" : id;

function AccountContent() {
  const { user, signOut } = useAuth();
  const { isSupporter, loading: entLoading, error: entitlementError } = useEntitlements();
  const [rows, setRows] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRows([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("entitlements")
        .select("product_id,transaction_id,environment,created_at")
        .eq("user_id", user.id)
        .eq("environment", getPaymentsEnvironment())
        .order("created_at", { ascending: false });
      setRows((data ?? []) as EntitlementRow[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Account — MOSH</title>
        <meta name="description" content="Manage your MOSH account and review your Supporter unlock and tips." />
        <link rel="canonical" href="https://ether-mosh.online/account" />
      </Helmet>

      <header className="relative z-10 flex items-center justify-between px-5 pt-6">
        <Link
          to="/"
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-accent transition"
        >
          <ArrowLeft className="h-3 w-3" /> back
        </Link>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-background/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/70 backdrop-blur hover:border-foreground/40 hover:text-foreground transition"
        >
          <LogOut className="h-3 w-3" aria-hidden /> sign out
        </button>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">account</div>
        <h1 className="font-sans text-4xl md:text-5xl font-bold tracking-tight">Your account</h1>
        <p className="mt-3 text-sm text-foreground/70">Signed in as {user?.email}</p>

        <div className="mt-10 rounded-lg border border-border/50 bg-background/60 p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Plan</div>
              <div className="mt-2 flex items-center gap-2 font-sans text-2xl font-bold tracking-tight">
                {isSupporter ? (
                  <>
                    <Sparkles className="h-5 w-5 text-primary" aria-hidden /> Supporter
                  </>
                ) : (
                  "Free"
                )}
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                {isSupporter
                  ? "One-time unlock — no subscription, no recurring charges."
                  : "You're on the free tier. Unlock the extras once for $4.99."}
              </p>
            </div>
            {!isSupporter ? (
              <Link
                to="/pricing"
                className="shrink-0 rounded border border-primary bg-primary/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-primary hover:bg-primary/20 transition"
              >
                Unlock
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            Purchase history
          </div>
          {loading || entLoading ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-5 text-sm text-foreground/60">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-5 text-sm text-foreground/60">
              No purchases yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/40 rounded-lg border border-border/50 bg-background/40">
              {rows.map((r) => (
                <li key={`${r.product_id}-${r.created_at}`} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <div className="text-sm text-foreground/90">{productLabel(r.product_id)}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                      {r.transaction_id ? ` · ${r.transaction_id.slice(0, 14)}…` : null}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
                    {r.environment === "sandbox" ? "test" : "live"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {entitlementError ? (
            <p role="alert" className="mt-3 text-xs text-destructive">
              Purchase status could not be refreshed: {entitlementError}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-foreground/50">
            Invoices, receipts, and refund requests are handled by our Merchant of Record,{" "}
            <a href="https://stripe.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Stripe</a>.{" "}
            See our <Link to="/refunds" className="text-accent hover:underline">refund policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function Account() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}
