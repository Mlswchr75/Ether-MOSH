import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Check } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const UNLOCK_URL = "https://buy.stripe.com/7sYbJ2c9O4JE2NfbxO3gk01";
const TIP_URLS = {
  1:  "https://donate.stripe.com/fZufZifm0a3YfA1bxO3gk02",
  5:  "https://donate.stripe.com/aFacN6ehWcc63Rj31i3gk03",
  25: "https://donate.stripe.com/3cI9AU5Lqcc62NfdFW3gk04",
} as const;

const FEATURES_FREE = [
  "58 GPU shader effects",
  "Live camera source (front / rear / webcam)",
  "Drag-and-drop or paste any image",
  "Beat sync + mic reactivity",
  "PNG still export",
  "9 preset slots (local)",
];

const FEATURES_UNLOCK = [
  "Everything in free",
  "WebM video export",
  "System audio capture",
  "Upscaled export (2× / 4×)",
  "Best-frame capture mode",
  "Tile + mirror post-process",
  "All future updates included",
];

export default function Pricing() {
  const navigate = useNavigate();

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
            feature set — no subscription, no account required for the unlock.
          </p>
        </motion.div>

        {/* Plans */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {/* Free */}
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

          {/* Unlock */}
          <motion.div
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
            <a
              href={UNLOCK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 flex w-full items-center justify-center border border-primary bg-primary/10 py-3 font-mono text-xs uppercase tracking-[0.3em] text-primary transition hover:bg-primary/20"
            >
              unlock mosh — $4.99 →
            </a>
          </motion.div>
        </div>

        {/* Tip jar */}
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
            {([1, 5, 25] as const).map(amount => (
              <a
                key={amount}
                href={TIP_URLS[amount]}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-border/50 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-foreground/60 transition hover:border-accent hover:text-accent"
              >
                ${amount}
              </a>
            ))}
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className="mt-14 space-y-7"
        >
          <h2 className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/40">faq</h2>
          {[
            { q: "Do I need an account?", a: "No account is required to use MOSH or to unlock it. Your payment is linked to an email address and that's it." },
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
