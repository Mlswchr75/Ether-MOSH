import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.online/vs/avsync-live";
const title = "MOSH vs AVSync.live — Browser Audio-Reactive Visuals Compared";
const description =
  "MOSH vs AVSync.live: compare browser-based audio-reactive visual instruments. 59 stackable GPU effects, live camera input, beat-synced chaos, and no install.";
const ogImage = "https://ether-mosh.online/og-image.png";

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: title,
  description,
  author: { "@type": "Organization", name: "Aesthetic Rebellion" },
  publisher: {
    "@type": "Organization",
    name: "Aesthetic Rebellion",
    logo: { "@type": "ImageObject", url: ogImage },
  },
  image: ogImage,
  mainEntityOfPage: canonical,
  keywords: "avsynclive mosh, AVSync.live alternative, browser VJ software, audio reactive visuals",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "What is the difference between MOSH and AVSync.live?",
    a: "Both run audio-reactive visuals in the browser. AVSync.live focuses on curated audio-reactive scenes, while MOSH is a performance instrument: 59 stackable GPU effects, live camera input, AI subject isolation, and beat-synced chaos you play in real time.",
  },
  {
    q: "Is MOSH a free AVSync.live alternative?",
    a: "Yes. MOSH is free to use in the browser with all effects, camera and audio reactivity, screenshots and short clips. A one-time $4.99 Supporter unlock adds GIF loops, unlimited recording length, and full-resolution exports.",
  },
  {
    q: "Does MOSH work with live music?",
    a: "Yes. MOSH listens through your microphone or system audio and drives effects from the beat, so visuals stay locked to whatever is playing in the room.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. MOSH runs in Chrome, Safari, and Edge on desktop and mobile, and can be added to your home screen as a PWA. No download, no plugins.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-sans text-lg font-semibold text-foreground">{children}</h3>
);

const rows: { feature: string; mosh: string; other: string }[] = [
  { feature: "Runs in the browser", mosh: "Yes — no install", other: "Yes" },
  { feature: "Effect count", mosh: "59 stackable GPU effects", other: "Curated scene presets" },
  { feature: "Live camera as a source", mosh: "Yes, front/rear with instant switch", other: "Limited" },
  { feature: "Beat detection", mosh: "Mic + system audio, beat-synced triggers", other: "Audio reactive" },
  { feature: "AI subject isolation", mosh: "Yes — apply effects to a person or tapped object", other: "No" },
  { feature: "Recording & export", mosh: "Clips, GIF loops, transparent stickers", other: "Screen capture" },
  { feature: "Pricing", mosh: "Free · $4.99 one-time unlock", other: "Subscription tiers" },
];

const VsAvsyncLive = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <meta name="keywords" content="avsynclive mosh, AVSync.live alternative, browser VJ software, audio reactive visuals" />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="MOSH" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <script type="application/ld+json">{JSON.stringify(articleJsonLd)}</script>
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
    </Helmet>

    <LegalLayout
      title={title}
      description={description}
      canonical={canonical}
      eyebrow="comparison"
      lastUpdated="August 2, 2026"
    >
      <section>
        <p>
          If you're looking for browser-based audio-reactive visuals, AVSync.live and{" "}
          <Link to="/" className="text-accent hover:underline">MOSH</Link> come up together. Both
          skip the install and react to sound — but they're built for different jobs. This page
          lays out the differences honestly so you can pick the right one.
        </p>
      </section>

      <section>
        <LegalH2>Side-by-side</LegalH2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border/50 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                <th className="py-2 pr-4 font-normal">Feature</th>
                <th className="py-2 pr-4 font-normal text-accent">MOSH</th>
                <th className="py-2 font-normal">AVSync.live</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.feature} className="border-b border-border/30 align-top">
                  <td className="py-3 pr-4 text-foreground/70">{r.feature}</td>
                  <td className="py-3 pr-4 text-foreground/90">{r.mosh}</td>
                  <td className="py-3 text-foreground/70">{r.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-foreground/55">
          Comparison based on publicly documented features; third-party tools change often, so
          check their site for the latest.
        </p>
      </section>

      <section>
        <LegalH2>Where MOSH is stronger</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>It's an instrument, not a player.</strong> Every effect is a control you perform live.</li>
          <li><strong>Camera-first.</strong> Point a phone at the crowd and mosh the room in real time.</li>
          <li><strong>Stackable GPU effects.</strong> 59 shaders that layer into looks nobody else has.</li>
          <li><strong>Exports built for social.</strong> Perfect GIF loops and transparent stickers, not just screen grabs.</li>
          <li><strong>One-time pricing.</strong> Free forever, with a single $4.99 unlock instead of a subscription.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Where AVSync.live might fit better</LegalH2>
        <p className="mt-3">
          If you want ready-made scenes that run unattended in the background of a stream or a bar
          screen, a curated scene player is less hands-on. MOSH rewards you for touching it — that's
          the trade.
        </p>
      </section>

      <section>
        <LegalH2>Try both in five minutes</LegalH2>
        <p className="mt-3">
          MOSH needs no account to start. Open{" "}
          <Link to="/edit" className="text-accent hover:underline">the editor</Link>, allow the
          camera and mic, and play a track. If you want deeper reading, start with{" "}
          <Link to="/guides/free-vj-software-browser" className="text-accent hover:underline">free VJ software in the browser</Link>{" "}
          or the{" "}
          <Link to="/guides/audio-reactive-music-videos" className="text-accent hover:underline">audio-reactive music video guide</Link>.
        </p>
      </section>

      <section>
        <LegalH2>Frequently Asked Questions</LegalH2>
        <div className="mt-4 space-y-6">
          {faqs.map((f) => (
            <div key={f.q}>
              <H3>{f.q}</H3>
              <p className="mt-2">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-4">
        <Link
          to="/edit"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-mono text-xs uppercase tracking-[0.25em] text-accent-foreground shadow-[0_0_24px_hsl(var(--accent)/0.35)] transition hover:brightness-110"
        >
          Open MOSH free →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default VsAvsyncLive;
