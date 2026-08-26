import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const LAST_UPDATED = "July 2026";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Terms of Service — Ether-MOSH</title>
        <link rel="canonical" href="https://ether-mosh.online/terms" />
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
          mosh / terms
        </span>
      </div>

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-16">
        <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-accent">terms of service</h1>
        <p className="mt-2 font-mono text-[10px] text-foreground/40 uppercase tracking-[0.25em]">
          Last updated: {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 font-mono text-xs leading-relaxed text-foreground/70">

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              1. Acceptance
            </h2>
            <p>
              By accessing or using Ether-MOSH ("the App"), you agree to these Terms of Service.
              If you do not agree, do not use the App. We may update these terms at any time;
              continued use after a change constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              2. What Ether-MOSH Is
            </h2>
            <p>
              Ether-MOSH is a browser-based, audio-reactive visual instrument. It lets you load
              images or live camera feeds, apply real-time GPU shader effects, synchronise
              those effects to audio, and export stills or video. All processing happens
              locally in your browser; your images and camera feed are never transmitted to
              any server.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              3. Licence
            </h2>
            <p>
              We grant you a personal, non-exclusive, non-transferable licence to use the
              App for your own creative and commercial projects. You may not sublicence,
              resell, or redistribute the App itself or its source code. Artwork you create
              with Ether-MOSH is entirely yours.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              4. Payments
            </h2>
            <p>
              Certain features require a one-time payment ("Ether-MOSH Unlock"). Payments are
              processed securely by Stripe. We do not store your payment card details.
              All prices are in USD. Taxes may apply depending on your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              5. Your Content
            </h2>
            <p>
              You retain full ownership of any images, video, or audio you load into the App.
              We do not receive, store, or access your content — it never leaves your device.
              You are responsible for ensuring you have the right to use any content you load.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              6. Prohibited Use
            </h2>
            <p>
              You agree not to use Ether-MOSH to process content that is illegal, defamatory,
              or infringes on third-party intellectual property rights. You agree not to
              attempt to reverse-engineer, decompile, or extract the shader source code or
              any proprietary algorithms embedded in the App.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              7. Disclaimers
            </h2>
            <p>
              The App is provided "as is" without warranties of any kind. We do not warrant
              that it will be error-free, uninterrupted, or compatible with all browsers or
              devices. WebGL and camera access depend on your browser and hardware.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              8. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by law, we shall not be liable for any
              indirect, incidental, special, or consequential damages arising from your
              use of the App, including loss of data or loss of profit.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              9. Governing Law
            </h2>
            <p>
              These terms are governed by the laws of the Netherlands. Any disputes shall
              be subject to the exclusive jurisdiction of the courts of Amsterdam.
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/50">
              10. Contact
            </h2>
            <p>
              Questions about these terms: <span className="text-accent">hello@ether-mosh.com</span>
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
