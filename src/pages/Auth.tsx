import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Apple, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type Mode = "signin" | "signup";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Same-origin relative path only — never let ?next= redirect off-site.
  const rawNext = params.get("next") || "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "email" | "apple" | "google">(null);

  // Redirect if already signed in
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

  const oauth = async (provider: "apple" | "google") => {
    if (busy) return;
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + next,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate(next, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${provider} sign-in failed`);
      setBusy(null);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4 py-8">
      <Helmet>
        <title>Sign in — MOSH</title>
        <meta name="description" content="Sign in to MOSH to save your favorite mosh presets and access them anywhere." />
        <link rel="canonical" href="https://ether-mosh.lovable.app/auth" />
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
        <div className="mb-6 text-center mosh-text font-sans text-3xl font-bold tracking-tight text-primary" data-text="MOSH">
          MOSH
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => oauth("apple")}
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-3 rounded-full border border-foreground/30 bg-foreground text-background px-6 py-3.5 font-mono text-sm uppercase tracking-[0.24em] transition-all hover:bg-foreground/90 active:scale-[0.98] disabled:opacity-60 min-h-[52px]"
          >
            <Apple className="h-5 w-5" aria-hidden="true" />
            {busy === "apple" ? "…" : "continue with apple"}
          </button>

          <button
            type="button"
            onClick={() => oauth("google")}
            disabled={!!busy}
            className="inline-flex items-center justify-center gap-3 rounded-full border border-foreground/25 bg-background/40 px-6 py-3.5 font-mono text-sm uppercase tracking-[0.24em] text-foreground/90 transition-all hover:bg-foreground/5 active:scale-[0.98] disabled:opacity-60 min-h-[52px]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.9 1.5l2.6-2.6C16.9 3.2 14.7 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 12s4.1 9.8 9.2 9.8c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1-.1-1.6H12z"/>
            </svg>
            {busy === "google" ? "…" : "continue with google"}
          </button>
        </div>

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
