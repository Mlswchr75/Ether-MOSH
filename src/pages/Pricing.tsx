import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useEntitlements";

const EASE = [0.22, 1, 0.36, 1] as const;

const FEATURES_FREE = [
  "105 GPU shader effects",
  "Live camera source (front / rear / webcam)",
  "Drag-and-drop or paste any image",
  "Beat sync + mic reactivity",
  "PNG still export",
  "9 preset slots (local)",
];

const FEATURES_UNLOCK = [
  "Everything in free",
  "Journey mode (directs itself from motion & sound)",
  "Seamless GIF loop capture (7-second perfect loops)",
  "Unlimited recording length (free is capped at 15s)",
  "Full-resolution screenshot exports (free is capped at 720p)",
  "All future updates included",
];

export default function Pricing() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { isSupporter, refresh } = useEntitlements();
  const unlockCardRef = useRef<HTMLDivElement>(null);

  // Returning from a successful Stripe checkout: force-refresh entitlements
  // right away instead of waiting on the webhook's realtime event, and show
  // a confirmation so a slow webhook doesn't look like a failed/missing
  // payment (which was otherwise a real "did that actually charge me?"
  // moment, and — worse — the exact state that used to let someone re-open
  // checkout and pay twice).
  useEffect(() => {
    if (params.get("checkout") !== "success") return;
    toast.success("Payment received — unlocking your account…");
    refresh();
    const next = new URLSearchParams(params);
    next.delete("checkout");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from an in-editor paywall nudge (usePaywall.purchase()) — bring
  // the unlock card into view instead of leaving the user to find it.
  useEffect(() => {
    if (params.get("unlock") !== "1") return;
    unlockCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCheckout = (priceId: string) => {
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent(`/checkout?price=${priceId}`)}`);
      return;
    }
    navigate(`/checkout?price=${priceId}`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Pricing — MOSH</title>
        <meta name="description" content="MOSH is free to use. Unlock video export and advanced features for a one-time $4.99 payment." />
      </Helmet>

      <div className="flex items-center justify-between px-6 pt-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/60 transition hover:text-accent"
        >
          ← back
        </button>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/40">
          mosh / pricing
        </span>
      </div>

      <div className="mx-auto max-w-3xl px-6 pb-24 pt-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center"
        >
          <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">pricing</h1>
          <p className="mt-4 font-sans text-4xl font-bold leading-tight tracking-tight">
            Pay once. Own it forever.
          </p>
          <p className="mx-auto mt-4 max-w-md font-mono text-xs leading-relaxed text-foreground/55">
            MOSH is free to use. One small payment unlocks video export and the full
            feature set — no subscription. Sign-in required so your unlock follows you
            to any device or browser using the same account.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15, ease: EASE }}
            className="border border-border/50 p-7"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">Free</p>
            <p className="mt-2 font-sans text-3xl font-bold tracking-tight">$0</p>
            <p className="mt-1 font-mono text-[10px] text-foreground/40">forever</p>
            <ul className="mt-6 space-y-3">
              {FEATURES_FREE.map(f => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-foreground/30" />
                  <span className="font-mono text-[11px] text-foreground/60">{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="mt-8 w-full border border-border/50 py-3 font-mono text-xs uppercase tracking-[0.3em] text-foreground/50 transition hover:border-border hover:text-foreground/70"
            >
              start free →
            </button>
          </motion.div>

          <motion.div
            ref={unlockCardRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.25, ease: EASE }}
            className="relative border border-primary/60 p-7 shadow-[0_0_40px_hsl(var(--primary)/0.15)]"
          >
            <div className="absolute -top-3 left-6 bg-background px-3">
              <span className="font-mono text-[9px] uppercase tracking-[0.35em] text-primary">
                recommended
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">MOSH Unlock</p>
            <p className="mt-2 font-sans text-3xl font-bold tracking-tight">$4.99</p>
            <p className="mt-1 font-mono text-[10px] text-foreground/40">one-time · no subscription</p>
            <ul className="mt-6 space-y-3">
              {FEATURES_UNLOCK.map(f => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  <span className="font-mono text-[11px] text-foreground/80">{f}</span>
                </li>
              ))}
            </ul>
            {isSupporter ? (
              <div className="mt-8 flex w-full items-center justify-center border border-primary/60 bg-primary/10 py-3 font-mono text-xs uppercase tracking-[0.3em] text-primary">
                unlocked
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startCheckout("mosh_supporter_once")}
                className="mt-8 flex w-full items-center justify-center border border-primary bg-primary/10 py-3 font-mono text-xs uppercase tracking-[0.3em] text-primary transition hover:bg-primary/20"
              >
                {user ? "unlock mosh — $4.99 →" : "sign in & unlock →"}
              </button>
            )}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4, ease: EASE }}
          className="mt-16 border border-border/30 p-7"
        >
          <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">
            tip jar — optional
          </h2>
          <p className="mt-2 font-mono text-xs leading-relaxed text-foreground/55">
            MOSH is built and maintained by one person. If you're getting value from it,
            a tip keeps the shaders alive.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {([
              { amount: 1, priceId: "mosh_tip_1" },
              { amount: 5, priceId: "mosh_tip_5" },
              { amount: 25, priceId: "mosh_tip_25" },
            ] as const).map(({ amount, priceId }) => (
              <button
                key={priceId}
                type="button"
                onClick={() => startCheckout(priceId)}
                className="border border-border/50 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60 transition hover:border-accent hover:text-accent"
              >
                ${amount}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="mt-14 space-y-7"
        >
          <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">faq</h2>
          {[
            { q: "Do I need an account?", a: "Yes — a quick free account keeps your unlock synced across devices and both Ether-MOSH deployments during the transition." },
            { q: "What browsers are supported?", a: "Chrome, Firefox, Edge, and Safari on desktop. Chrome and Safari on mobile. WebGL is required; the App will tell you if your browser isn't supported." },
            { q: "Will I get future updates?", a: "Yes. The one-time payment includes all future updates to MOSH — new effects, features, and improvements." },
            { q: "Is there a refund policy?", a: "Yes. 14-day no-questions-asked refund. See our refund policy for details." },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="font-mono text-xs text-foreground/80">{q}</p>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-foreground/50">{a}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </main>
  );
}
