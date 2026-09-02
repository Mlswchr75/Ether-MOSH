import { ArrowUpRight } from "lucide-react";
import { NavLink } from "react-router-dom";

export function NewsHeader() {
  return <header className="news-header">
    <NavLink to="/" className="news-wordmark">ETHER-M<span>O</span>SH</NavLink>
    <nav aria-label="News navigation">
      <NavLink to="/news">News + Updates</NavLink>
      <NavLink to="/effects">Effects</NavLink>
      <NavLink to="/guides">Guides</NavLink>
    </nav>
    <NavLink to="/edit" className="news-open">Open MOSH <ArrowUpRight aria-hidden /></NavLink>
  </header>;
}

export function NewsFooter() {
  return <footer className="news-footer">
    <div><strong>Bad signal. Good information.</strong><span>Daily-ish dispatches from the least responsible graphics department.</span></div>
    <nav><NavLink to="/">Home</NavLink><NavLink to="/effects">Effect registry</NavLink><a href="/news/feed.xml">RSS</a><a href="https://aestheticrebellion.store" target="_blank" rel="noreferrer">Aesthetic Rebellion</a></nav>
    <small>© 2026 Aesthetic Rebellion · Satire clearly labeled · Facts sourced · Pixels unsupervised</small>
  </footer>;
}
