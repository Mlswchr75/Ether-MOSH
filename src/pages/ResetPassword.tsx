import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Landing page for the link in a "reset your password" email. Reuses the same
 * explicit PKCE code-exchange the OAuth callback uses (this app keeps
 * `detectSessionInUrl: false` deliberately — see supabase/client.ts — so this
 * page, not the SDK, is what turns the one-time code into a session).
 *
 * A dedicated route rather than reusing /auth/callback: that route's whole
 * job is "exchange the code, then bounce to `next`" — bolting a
 * set-new-password form onto it for one specific link type would mean
 * detecting "is this actually a recovery link" from Supabase's redirect,
 * which isn't something worth depending on. Landing here already *is* that
 * signal.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const code = params.get("code");
  const providerError = params.get("error_description") || params.get("error");

  const [status, setStatus] = useState<"exchanging" | "ready" | "error">("exchanging");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (providerError) {
      setErrorMessage(providerError);
      setStatus("error");
      return;
    }
    if (!code) {
      setErrorMessage("This reset link is missing its code — it may have already been used.");
      setStatus("error");
      return;
    }
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage(error.message);
        setStatus("error");
        return;
      }
      setStatus("ready");
    });
    return () => { active = false; };
  }, [code, providerError]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated — you're signed in");
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Reset password — MOSH</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <Link to="/" className="absolute top-6 left-6 inline-flex items-center gap-2 text-foreground/60 hover:text-foreground transition">
        <ArrowLeft className="h-4 w-4" />
        <span className="font-mono text-xs uppercase tracking-widest">back</span>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-background/60 p-6 backdrop-blur"
           style={{ boxShadow: "0 0 60px hsl(var(--primary) / 0.25)" }}>
        <div className="mb-6 text-center font-sans text-3xl font-bold tracking-tight text-primary">
          Reset password
        </div>

        {status === "exchanging" && (
          <p className="text-center font-mono text-xs text-foreground/55">Verifying your reset link…</p>
        )}

        {status === "error" && (
          <>
            <p role="alert" className="text-center text-sm leading-relaxed text-destructive">
              {errorMessage}
            </p>
            <Link
              to="/auth"
              className="mt-6 flex items-center justify-center rounded-full border border-primary/60 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-primary"
            >
              back to sign in
            </Link>
          </>
        )}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <input
              type="password" required minLength={6} autoComplete="new-password" autoFocus
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="new password"
              className="rounded-md border border-foreground/20 bg-background/40 px-4 py-3 font-mono text-sm outline-none focus:border-primary/60 min-h-[48px]"
            />
            <input
              type="password" required minLength={6} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="confirm new password"
              className="rounded-md border border-foreground/20 bg-background/40 px-4 py-3 font-mono text-sm outline-none focus:border-primary/60 min-h-[48px]"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-6 py-3 font-mono text-sm uppercase tracking-[0.28em] text-primary hover:bg-primary/20 active:scale-[0.98] disabled:opacity-60 min-h-[48px]"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {busy ? "…" : "set new password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
