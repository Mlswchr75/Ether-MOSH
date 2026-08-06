import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// NOTE: Netlify build intentionally does NOT use Lovable's Apple/Google OAuth
// (@lovable.dev/cloud-auth-js) — that SDK is tied to Lovable's own auth domain
// and isn't safe to run from a different origin, and it's not in this repo's
// package.json anyway.
//
// Google instead goes through Supabase's own OAuth endpoint, which is
// origin-agnostic: it works from netlify.app, lovable.app, or a custom domain
// as long as the origin is in the Supabase redirect allowlist. That keeps this
// build free of any Lovable dependency.
//
// Identity is keyed on the Google `sub`, which is stable per Google account
// across OAuth clients — so users who originally signed up through Lovable's
// broker resolve to the same auth.users row, and their entitlements (keyed on
// user_id) carry over untouched.

type Mode = "signin" | "signup";
type Busy = null | "email" | "google";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate(next, { replace: true });
    });
  }, [navigate, next]);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy("email");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + next },
        });
        if (error) throw error;
        toast.success("Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("welcome back");
        navigate(next, { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "auth failed");
    } finally {
      setBusy(null);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy("google");
    try {
      // signInWithOAuth builds the authorize URL client-side and does not talk
      // to the server, so a disabled provider would not surface as an error
      // here — it would only show up as raw 400 JSON after the redirect.
      // skipBrowserRedirect lets us pre-flight the URL first.
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + next,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("no redirect url returned");

      // A configured provider answers /authorize with a 302 to Google, which
      // redirect:"manual" reports as an opaque response. An unconfigured one
      // answers with a CORS-readable 400. Anything inconclusive (offline,
      // blocked) falls through to the normal redirect rather than blocking.
      let configured = true;
      try {
        const probe = await fetch(data.url, { redirect: "manual" });
        if (probe.type === "cors" && probe.status >= 400) configured = false;
      } catch {
        /* inconclusive — continue */
      }

      if (!configured) {
        toast.error("google sign-in isn't enabled yet — use email below");
        setBusy(null);
        return;
      }
      window.location.assign(data.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "google sign-in failed");
      setBusy(null);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Sign in — MOSH</title>
        <meta name="description" content="Sign in to MOSH to unlock supporter features and sync them across devices." />
        <link rel="canonical" href="https://ether-mosh.netlify.app/auth" />
      </Helmet>

      <Link to="/" className="absolute top-6 left-6 inline-flex items-center gap-2 text-foreground/60 hover:text-foreground transition">
        <ArrowLeft className="h-4 w-4" />
        <span className="font-mono text-xs uppercase tracking-widest">back</span>
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-primary/40 bg-background/60 p-6 backdrop-blur"
           style={{ boxShadow: "0 0 60px hsl(var(--primary) / 0.25)" }}>
        <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/60">
          {mode === "signin" ? "sign in to" : "join"}
        </div>
        <div className="mb-6 text-center font-sans text-3xl font-bold tracking-tight text-primary">
          MOSH
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={!!busy}
          className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-foreground/25 bg-background/40 px-6 py-3.5 font-mono text-sm uppercase tracking-[0.24em] text-foreground/90 transition-all hover:bg-foreground/5 active:scale-[0.98] disabled:opacity-60 min-h-[52px]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.9 3.2 14.7 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 12s4.1 9.8 9.2 9.8c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1-.1-1.6H12z"/>
          </svg>
          {busy === "google" ? "…" : "continue with google"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-foreground/15" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40">or email</span>
          <div className="h-px flex-1 bg-foreground/15" />
        </div>

        <form onSubmit={onEmail} className="flex flex-col gap-3">
          <input
            type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
            className="rounded-md border border-foreground/20 bg-background/40 px-4 py-3 font-mono text-sm outline-none focus:border-primary/60 min-h-[48px]"
          />
          <input
            type="password" required minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="rounded-md border border-foreground/20 bg-background/40 px-4 py-3 font-mono text-sm outline-none focus:border-primary/60 min-h-[48px]"
          />
          <button
            type="submit"
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-6 py-3 font-mono text-sm uppercase tracking-[0.28em] text-primary hover:bg-primary/20 active:scale-[0.98] disabled:opacity-60 min-h-[48px]"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {busy === "email" ? "…" : mode === "signin" ? "sign in" : "create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 block w-full text-center font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/50 hover:text-foreground/80 transition"
        >
          {mode === "signin" ? "no account? sign up →" : "have an account? sign in →"}
        </button>
      </div>
    </main>
  );
}
