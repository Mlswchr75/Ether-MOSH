import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// NOTE: Netlify build intentionally does NOT use Lovable's Apple/Google OAuth
// (@lovable.dev/cloud-auth-js) — that SDK is tied to Lovable's own auth domain
// and isn't safe to run from a different origin, and it's not in this repo's
// package.json anyway. Email/password only, via plain supabase-js — works
// identically on both domains since they share one Supabase project.

type Mode = "signin" | "signup";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate(next, { replace: true });
    });
  }, [navigate, next]);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
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
      setBusy(false);
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
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-6 py-3 font-mono text-sm uppercase tracking-[0.28em] text-primary hover:bg-primary/20 active:scale-[0.98] disabled:opacity-60 min-h-[48px]"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {busy ? "…" : mode === "signin" ? "sign in" : "create account"}
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
