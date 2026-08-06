import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";

interface LegalLayoutProps {
  title: string;
  description: string;
  canonical: string;
  lastUpdated?: string;
  eyebrow?: string;
  children: React.ReactNode;
}

const LegalLayout = ({
  title,
  description,
  canonical,
  lastUpdated = "July 18, 2026",
  eyebrow = "legal",
  children,
}: LegalLayoutProps) => (
  <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
    <Helmet>
      <title>{title} — MOSH</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={`${title} — MOSH`} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
    </Helmet>

    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 -left-40 h-[60vmin] w-[60vmin] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 h-[55vmin] w-[55vmin] rounded-full bg-accent/20 blur-[120px]" />
      <div className="absolute inset-0 scanline opacity-30" />
    </div>

    <header className="relative z-10 flex items-center justify-between px-5 pt-6">
      <Link
        to="/"
        className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-accent transition"
      >
        <ArrowLeft className="h-3 w-3" /> back to home
      </Link>
      <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_hsl(var(--accent))]" />
        mosh
      </div>
    </header>

    <article className="relative z-10 mx-auto max-w-3xl px-5 py-12 md:py-16">
      <div className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-accent">{eyebrow}</div>
      <h1 className="font-sans text-4xl md:text-5xl font-bold leading-[0.95] tracking-tight">{title}</h1>
      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
        last updated · {lastUpdated}
      </div>
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">{children}</div>
    </article>

    <SiteFooter />
  </main>
);

export const LegalH2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{children}</h2>
);

export default LegalLayout;
