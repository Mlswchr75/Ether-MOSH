import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNextPath } from "@/lib/authRedirect";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const next = sanitizeNextPath(params.get("next"));
  const code = params.get("code");
  const providerError = params.get("error_description") || params.get("error");

  useEffect(() => {
    let active = true;

    if (providerError) {
      setErrorMessage(providerError);
      return () => {
        active = false;
      };
    }

    if (!code) {
      setErrorMessage("The sign-in response did not include an authorization code.");
      return () => {
        active = false;
      };
    }

    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (!active) return;
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      navigate(next, { replace: true });
    });

    return () => {
      active = false;
    };
  }, [code, navigate, next, providerError]);

  return (
    <main className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-2xl border border-primary/40 bg-background/70 p-7 text-center backdrop-blur">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
          secure callback
        </p>
        <h1 className="mt-3 font-sans text-3xl font-bold tracking-tight text-primary">
          Finishing sign-in
        </h1>
        {errorMessage ? (
          <>
            <p role="alert" className="mt-4 text-sm leading-relaxed text-destructive">
              {errorMessage}
            </p>
            <Link
              to={`/auth?next=${encodeURIComponent(next)}`}
              className="mt-6 inline-flex rounded-full border border-primary/60 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-primary"
            >
              try sign-in again
            </Link>
          </>
        ) : (
          <p className="mt-4 font-mono text-xs text-foreground/55">
            Exchanging the one-time code and restoring your destination…
          </p>
        )}
      </section>
    </main>
  );
}
