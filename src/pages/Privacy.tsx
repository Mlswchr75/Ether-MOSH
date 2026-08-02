import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const LAST_UPDATED = "July 2026";

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy Policy — MOSH</title>
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
          mosh / privacy
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">privacy policy</h1>
        <p className="mt-2 font-mono text-[10px] text-foreground/40 uppercase tracking-[0.25em]">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 font-mono text-xs leading-relaxed text-foreground/70">

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              The short version
            </h2>
            <p>
              Your images and camera feed never leave your device. MOSH processes
              everything locally in your browser. The only data that touches our servers is
              what's strictly necessary for payment processing.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              What we collect
            </h2>
            <p>
              We collect minimal data:
            </p>
            <ul className="mt-3 space-y-2">
              <li>· <span className="text-foreground/90">Payment data</span> — processed by Stripe. We receive only a payment confirmation and a customer identifier. We never see your card number.</li>
              <li>· <span className="text-foreground/90">Entitlement status</span> — we store whether your account has unlocked MOSH (yes/no) in Supabase to enable access across devices.</li>
              <li>· <span className="text-foreground/90">Preset slots</span> — saved locally in your browser's localStorage. We do not have access to these.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              What we do not collect
            </h2>
            <ul className="space-y-2">
              <li>· Your images or video — processed only on your device.</li>
              <li>· Your camera feed — accessed only locally; never streamed to a server.</li>
              <li>· Audio input — processed only on your device for reactivity.</li>
              <li>· Behavioural analytics or tracking pixels.</li>
              <li>· Advertising IDs.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Third-party services
            </h2>
            <p>
              <span className="text-foreground/90">Stripe</span> — payment processing. Subject to{" "}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-foreground/60 hover:text-accent transition"
              >
                Stripe's Privacy Policy
              </a>
              .
            </p>
            <p className="mt-3">
              <span className="text-foreground/90">Supabase</span> — entitlement storage (EU region).
              Subject to{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-foreground/60 hover:text-accent transition"
              >
                Supabase's Privacy Policy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Cookies and storage
            </h2>
            <p>
              MOSH uses browser localStorage to store your preset slots and UI preferences.
              No tracking cookies are set. If you clear your browser data, your local
              presets will be deleted; your unlock status is stored server-side and can
              be restored by signing back in.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Your rights (GDPR)
            </h2>
            <p>
              If you're in the EU / EEA, you have the right to access, correct, or delete
              any personal data we hold. To exercise these rights, email us and we will
              respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Contact
            </h2>
            <p>
              Privacy enquiries: <span className="text-accent">hello@ether-mosh.com</span>
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
