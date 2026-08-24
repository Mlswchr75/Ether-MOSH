import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const FORM_NAME = "account-deletion";

function encodeForm(values: Record<string, string>) {
  return new URLSearchParams(values).toString();
}

export default function DeleteAccount() {
  const { user, signOut } = useAuth();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const canSubmit = useMemo(() => confirmation.trim().toUpperCase() === "DELETE" && !!user && !busy, [confirmation, user, busy]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canSubmit) return;
    setBusy(true);
    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm({
          "form-name": FORM_NAME,
          email: user.email ?? "",
          user_id: user.id,
          requested_at: new Date().toISOString(),
          reason: reason.trim(),
        }),
      });
      if (!response.ok) throw new Error(`Deletion request failed (${response.status})`);
      setSubmitted(true);
      toast.success("Account deletion requested");
      await signOut();
    } catch (error) {
      console.error("[account-delete] request failed", error);
      toast.error("Couldn't submit the deletion request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background px-5 py-8 text-foreground">
      <Helmet>
        <title>Delete account — Ether-MOSH</title>
        <meta name="description" content="Request deletion of your Ether-MOSH account and associated account data." />
        <link rel="canonical" href="https://ether-mosh.online/delete-account" />
      </Helmet>

      <div className="mx-auto max-w-2xl">
        <Link to={user ? "/account" : "/"} className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-foreground/55 hover:text-accent">
          <ArrowLeft className="h-3.5 w-3.5" /> back
        </Link>

        <div className="mt-12 rounded-2xl border border-red-500/30 bg-red-950/10 p-6 md:p-8">
          <div className="flex items-center gap-3 text-red-300">
            <AlertTriangle className="h-5 w-5" aria-hidden />
            <span className="font-mono text-[11px] uppercase tracking-[0.28em]">permanent account deletion</span>
          </div>
          <h1 className="mt-4 font-sans text-3xl font-bold tracking-tight md:text-4xl">Delete your Ether-MOSH account</h1>

          <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/70">
            <p>This page is the official account-deletion request path for Ether-MOSH. Requests are reviewed and completed within <strong className="text-foreground">7 days</strong>.</p>
            <p>For security, we may re-verify account ownership using the account email before destructive processing. A forged form submission by itself is not sufficient authorization to delete an account.</p>
            <p>When processed, we delete your Ether-MOSH authentication account and account-linked entitlement data. Local presets, Sticker Vault items, and browser-only preferences live on your device and can be removed immediately by clearing Ether-MOSH site/app storage.</p>
            <p>Payment processors may retain transaction records they are legally required to keep for tax, fraud-prevention, chargeback, or accounting obligations. Those records are not used to keep your Ether-MOSH account active.</p>
          </div>

          {submitted ? (
            <div className="mt-8 rounded-xl border border-emerald-400/30 bg-emerald-950/20 p-5 text-sm text-emerald-100">Your deletion request was submitted and you have been signed out. The request will be completed within 7 days.</div>
          ) : !user ? (
            <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm text-foreground/70">Sign in first so we can securely match the deletion request to the correct account.</p>
              <Link to="/auth?next=/delete-account" className="mt-4 inline-flex rounded-full border border-primary/50 bg-primary/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-primary hover:bg-primary/20">sign in to continue</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/65">Signed in as <span className="text-foreground">{user.email}</span></div>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/50">Optional reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 p-3 text-sm outline-none focus:border-red-400/50" placeholder="Anything you'd like us to know" />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/50">Type DELETE to confirm</span>
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-3 font-mono text-sm uppercase outline-none focus:border-red-400/50" />
              </label>
              <button type="submit" disabled={!canSubmit} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-red-400/50 bg-red-500/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.22em] text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30">
                <Trash2 className="h-4 w-4" aria-hidden /> {busy ? "submitting…" : "request account deletion"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-foreground/45">Need help before deleting? Visit <Link to="/contact" className="text-accent hover:underline">support</Link>. For details about data handling and retention, read the <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.</p>
      </div>
    </main>
  );
}
