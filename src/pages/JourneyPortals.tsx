import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { JourneyPortal, JourneyPortalProvider } from "@/components/journey/JourneyPortal";
import { PortalShapeGallery } from "@/components/journey/PortalShapeGallery";
import "./journey-portals.css";

const installCode = `<script type="module" src="https://ether-mosh.online/journey-portal.js"></script>

<mosh-journey-portal
  shape="rift"
  palette="2"
  cadence="7200"
  style="width:min(70vw,720px);height:420px">
</mosh-journey-portal>`;

const customCode = `<mosh-journey-portal
  clip="polygon(0 31%, 13% 18%, 29% 25%, 42% 4%, 58% 22%, 76% 10%, 100% 35%, 91% 73%, 65% 89%, 43% 76%, 16% 96%, 4% 62%)"
  intensity="0.92"
  seed="1987">
</mosh-journey-portal>`;

const JourneyPortals = () => (
  <JourneyPortalProvider config={{ seed: 1987, palette: 2, intensity: .9, cadenceMs: 6_800 }}>
    <main className="jp-page">
      <Helmet>
        <title>Forge Journey Portals — MOSH</title>
        <meta name="description" content="Put the full MOSH Forge Journey engine inside any organic shape on any website." />
        <link rel="canonical" href="https://ether-mosh.online/journey-portals" />
      </Helmet>
      <header className="jp-nav"><Link to="/live-visuals"><ArrowLeft /> Back to the signal</Link><Link to="/edit">Open MOSH <ArrowUpRight /></Link></header>
      <section className="jp-hero">
        <div className="jp-kicker">Forge Journey / portable signal architecture</div>
        <h1>Tear a hole<br/>in your <em>website.</em></h1>
        <p>The living Forge Journey engine, rendered inside any shape you can draw. No rectangular player. No canned loop. One line of code opens a window into MOSH.</p>
        <JourneyPortal shape="breach" label className="jp-hero__portal" crop={.15} />
      </section>
      <section className="jp-demo">
        <div><div className="jp-kicker">Made to escape the frame</div><h2>Six wounds.<br/>Infinite worlds.</h2><p>Use a built-in tear or supply your own CSS polygon. Each portal runs the real Journey renderer, crossfades through Forge generators, pauses offscreen, and adapts its frame rate to the device.</p></div>
        <div className="jp-specimens">
          <JourneyPortal shape="rift" className="jp-specimen jp-specimen--rift" crop={.78}/>
          <JourneyPortal shape="crater" className="jp-specimen jp-specimen--crater" crop={.38}/>
          <JourneyPortal shape="fissure" className="jp-specimen jp-specimen--fissure" crop={.58}/>
          <JourneyPortal shape="slash" className="jp-specimen jp-specimen--slash" crop={.92}/>
        </div>
      </section>
      <section className="jp-atlas">
        <div className="jp-atlas__head"><div className="jp-kicker">Custom shape atlas / twelve live cuts</div><h2>No two<br/>wounds alike.</h2><p>Every opening below is a separate, responsive CSS polygon with its own crop of the same living Journey signal. Each occupies a protected layout cell: no collisions, no clipped edges, no rectangular fallback.</p></div>
        <PortalShapeGallery />
      </section>
      <section className="jp-install">
        <div><div className="jp-kicker">Drop-in web component</div><h2>Open<br/>the portal.</h2><p>Paste the script once, then place <code>&lt;mosh-journey-portal&gt;</code> anywhere HTML works: portfolios, blogs, stream overlays, release pages, installations, and visualizers.</p></div>
        <pre><code>{installCode}</code></pre>
        <div className="jp-custom"><div><h3>Your shape, not ours.</h3><p>Add a custom <code>clip</code> polygon to make the portal fit a logo, layout, scar, edge, or impossible window of your own design.</p></div><pre><code>{customCode}</code></pre></div>
        <div className="jp-options"><span><b>shape</b> breach · rift · crater · slash · fissure · edge</span><span><b>palette</b> 0–5</span><span><b>intensity</b> 0–1</span><span><b>cadence</b> 4800–9500ms</span><span><b>seed</b> any number</span><span><b>label</b> true · false</span></div>
      </section>
      <footer className="jp-footer"><span>Forge Journey Portals / Ether-MOSH</span><Link to="/edit">Make something unstable <ArrowUpRight /></Link></footer>
    </main>
  </JourneyPortalProvider>
);

export default JourneyPortals;
