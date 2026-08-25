import { Link } from "react-router-dom";

const SiteFooter = () => (
  <footer className="relative z-10 border-t border-border/40 px-5 py-8 mt-16 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
    <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        <span>© 2026 Aesthetic Rebellion · Ether-MOSH</span>
      </div>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Link to="/live-visuals" className="hover:text-accent transition">visual services</Link>
        <Link to="/pricing" className="hover:text-accent transition">pricing</Link>
        <Link to="/guides" className="hover:text-accent transition">guides</Link>
        <Link to="/terms" className="hover:text-accent transition">terms</Link>
        <Link to="/privacy" className="hover:text-accent transition">privacy</Link>
        <Link to="/refunds" className="hover:text-accent transition">refunds</Link>
        <Link to="/contact" className="hover:text-accent transition">contact</Link>
        <a href="mailto:myleswhitcher@gmail.com" className="hover:text-accent transition normal-case tracking-normal">
          myleswhitcher@gmail.com
        </a>
      </nav>
    </div>
  </footer>
);

export default SiteFooter;
