import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Refund() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Refund Policy — MOSH</title>
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
          mosh / refunds
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">refund policy</h1>

        <div className="mt-10 space-y-10 font-mono text-xs leading-relaxed text-foreground/70">

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              The short version
            </h2>
            <p>
              We offer a no-questions-asked refund within <span className="text-foreground/90">14 days</span> of
              purchase, as long as you haven't exported more than a handful of files.
              After 14 days, all sales are final — MOSH is a digital product and
              access is granted immediately.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Eligibility
            </h2>
            <ul className="space-y-3">
              <li>
                <span className="text-foreground/90">Within 14 days of purchase</span> — eligible for a full refund.
                Contact us with your order email and we'll process it within 3 business days.
              </li>
              <li>
                <span className="text-foreground/90">After 14 days</span> — not eligible for a refund.
                If you're having a technical issue, please contact support first — we'll do
                our best to fix it.
              </li>
              <li>
                <span className="text-foreground/90">Tips</span> — voluntary support payments ($1 / $5 / $25)
                are non-refundable, as these are donations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              How to request a refund
            </h2>
            <p>
              Email <span className="text-accent">hello@ether-mosh.com</span> with the subject line
              "Refund Request" and include the email address used at checkout.
              We will confirm receipt within 1 business day.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              Technical issues
            </h2>
            <p>
              If MOSH doesn't work on your device (GPU incompatibility, browser bug,
              etc.), please tell us before requesting a refund. We'll prioritise fixing
              the issue for you, and issue a refund regardless of the 14-day window if
              we can't resolve it.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
