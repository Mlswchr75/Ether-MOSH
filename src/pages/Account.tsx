import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Sparkles, LogOut, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentsEnvironmentSafe } from "@/lib/stripe";
import { RequireAuth } from "@/components/RequireAuth";

interface EntitlementRow {
  product_id: string;
  transaction_id: string | null;
  environment: string;
  created_at: string;
}

const productLabel = (id: string) => id === "mosh_supporter" ? "Supporter unlock" : id === "mosh_tip" ? "Tip" : id;

function AccountContent() {
  const { user, signOut } = useAuth();
  const { isSupporter, loading: entLoading, error: entitlementError } = useEntitlements();
  const [rows, setRows] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRows([]); setLoading(false); return; }
    void (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("entitlements")
        .select("product_id,transaction_id,environment,created_at")
        .eq("user_id", user.id)
        .eq("environment", getPaymentsEnvironmentSafe())
        .order("created_at", { ascending: false });
      setRows((data ?? []) as EntitlementRow[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Account — Ether-MOSH</title>
        <meta name="description" content="Manage your Ether-MOSH account, purchases, privacy, and account deletion." />
        <link rel="canonical" href="https://ether-mosh.online/account" />
      </Helmet>

      <header className="relative z-10 flex items-center justify-between px-5 pt-6">
        <Link to="/" className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground transition hover:text-accent">
          <ArrowLeft className="h-3 w-3" /> back
        </Link>
        <button type="button" onClick={signOut} className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-background/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/70 backdrop-blur transition hover:border-foreground/40 hover:text-foreground">
          <LogOut className="h-3 w-3" aria-hidden /> sign out
        </button>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">account</div>
        <h1 className="font-sans text-4xl font-bold tracking-tight md:text-5xl">Your account</h1>
        <p className="mt-3 text-sm text-foreground/70">Signed in as {user?.email}</p>

        <div className="mt-10 rounded-lg border border-border/50 bg-background/60 p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Plan</div>
              <div className="mt-2 flex items-center gap-2 font-sans text-2xl font-bold tracking-tight">
                {isSupporter ? <><Sparkles className="h-5 w-5 text-primary" aria-hidden /> Supporter</> : "Free"}
              </div>
              <p className="mt-2 text-sm text-foreground/70">
                {isSupporter ? "One-time unlock — no subscription, no recurring charges." : "You're on the free tier. Unlock the extras once for $4.99."}
              </p>
            </div>
            {!isSupporter && <Link to="/pricing" className="shrink-0 rounded border border-primary bg-primary/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-primary transition hover:bg-primary/20">Unlock</Link>}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Purchase history</div>
          {loading || entLoading ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-5 text-sm text-foreground/60">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-background/40 p-5 text-sm text-foreground/60">No purchases yet.</div>
          ) : (
            <ul className="divide-y divide-border/40 rounded-lg border border-border/50 bg-background/40">
              {rows.map((row) => (
                <li key={`${row.product_id}-${row.created_at}`} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <div className="text-sm text-foreground/90">{productLabel(row.product_id)}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString()}{row.transaction_id ? ` · ${row.transaction_id.slice(0, 14)}…` : null}
                    </div>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">{row.environment === "sandbox" ? "test" : "live"}</span>
                </li>
              ))}
            </ul>
          )}
          {entitlementError && <p role="alert" className="mt-3 text-xs text-destructive">Purchase status could not be refreshed: {entitlementError}</p>}
          <p className="mt-3 text-xs text-foreground/50">
            Payment processing, receipts, and card details are handled by our payment provider. Ether-MOSH does not receive your full card number. See our <Link to="/refunds" className="text-accent hover:underline">refund policy</Link> or <Link to="/contact" className="text-accent hover:underline">contact support</Link> for billing help.
          </p>
        </div>

        <div className="mt-12 rounded-lg border border-red-500/25 bg-red-950/10 p-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-red-300/80">Privacy & account control</div>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/65">
            You can request permanent deletion of your Ether-MOSH account and account-linked data from inside the app. Requests are completed within 7 days.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/delete-account" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-red-200 transition hover:bg-red-500/20">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> delete account
            </Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/65 transition hover:border-white/30 hover:text-foreground">privacy policy</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Account() {
  return <RequireAuth><AccountContent /></RequireAuth>;
}
