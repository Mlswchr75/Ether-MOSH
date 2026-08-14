import LegalLayout, { LegalH2 } from "@/components/LegalLayout";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";

const Contact = () => (
  <LegalLayout
    title="Contact"
    description="Get in touch with the MOSH team for support, billing questions, or partnership inquiries."
    canonical="https://ether-mosh.netlify.app/contact"
    eyebrow="support"
  >
    <section>
      <p>
        Questions, bug reports, feedback, or partnership ideas — email us directly. We aim to respond
        within <strong>2 business days</strong>.
      </p>

      <a
        href="mailto:myleswhitcher@gmail.com"
        className="mt-6 inline-flex items-center gap-3 rounded border border-primary bg-primary/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.25em] text-primary hover:bg-primary/20 transition"
      >
        <Mail className="h-4 w-4" aria-hidden />
        myleswhitcher@gmail.com
      </a>
    </section>

    <section>
      <LegalH2>Billing & refunds</LegalH2>
      <p className="mt-2">
        For billing, receipts, or refund requests, you can also contact our payment provider{" "}
        <strong>Lemon Squeezy</strong>, our Merchant of Record. Look up your order at{" "}
        <a
          className="text-accent hover:underline"
          href="https://www.lemonsqueezy.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          lemonsqueezy.com
        </a>
        , or read our <Link to="/refunds" className="text-accent hover:underline">refund policy</Link>.
      </p>
    </section>

    <section>
      <LegalH2>Response time</LegalH2>
      <p className="mt-2">
        We're a small independent team. Most emails get a reply within 2 business days. Thanks for
        your patience.
      </p>
    </section>
  </LegalLayout>
);

export default Contact;
