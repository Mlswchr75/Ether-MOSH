import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.online/guides/free-vj-software-browser";
const title = "Free VJ Software: Make Live Visuals in Your Browser";
const description =
  "Looking for free VJ software? MOSH runs live, audio-reactive visuals in your browser — no download. Perfect for gigs, parties, and live streams.";
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
  keywords: "free VJ software, VJ software, live visuals",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "Is there free VJ software?",
    a: "Yes — MOSH is free VJ software that runs in your browser with real-time, audio-reactive visuals. No download, no license, no watermark.",
  },
  {
    q: "Can I VJ from a browser?",
    a: "Absolutely. MOSH uses your GPU through WebGL, so you can VJ from any modern laptop with just a browser tab.",
  },
  {
    q: "Does MOSH react to music?",
    a: "Yes. Enable your mic or route system audio and every effect layer reacts to the beat in real time.",
  },
  {
    q: "Can I use it with a projector or live stream?",
    a: "Yes — put MOSH into fullscreen and use your OS to project or screen-share into OBS/Zoom/Meet for live streams and events.",
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

const GuideFreeVJSoftware = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <meta name="keywords" content="free VJ software, VJ software, live visuals" />
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
      eyebrow="guide"
      lastUpdated="July 23, 2026"
    >
      <section>
        <p>
          Great live visuals used to mean an expensive VJ software license, a beefy laptop, and
          hours of setup. Not anymore. This guide walks through how to VJ a full set with free,
          browser-based tools — using{" "}
          <Link to="/" className="text-accent hover:underline">MOSH</Link>, an audio-reactive
          glitch instrument that runs anywhere a browser does.
        </p>
      </section>

      <section>
        <LegalH2>What is VJing (and what is VJ software)?</LegalH2>
        <p className="mt-3">
          VJing is real-time visual performance — improvising imagery live in sync with music, the
          same way a DJ mixes tracks. VJ software is the instrument that lets you trigger, layer,
          and manipulate those visuals on the fly. It powers club nights, festival stages, art
          installations, and increasingly, Twitch and TikTok live streams.
        </p>
      </section>

      <section>
        <LegalH2>What to look for in free VJ software</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Real-time GPU rendering (not slow CPU rendering)</li>
          <li>Audio reactivity out of the box</li>
          <li>Effect stacking / layer blending</li>
          <li>Fullscreen output for projectors and screen-share</li>
          <li>Works offline / no upload of your footage</li>
          <li>No watermark or hard time limit</li>
        </ul>
      </section>

      <section>
        <LegalH2>Why MOSH works as free browser VJ software</LegalH2>
        <p className="mt-3">
          MOSH ticks every box above and costs nothing to run. It uses WebGL for GPU-accelerated
          glitch, warp, and color effects, listens to your mic or system audio for reactivity, and
          runs in a plain browser tab — meaning your MacBook, Windows laptop, or even a Chromebook
          becomes a VJ rig. All processing happens locally; nothing gets uploaded.
        </p>
      </section>

      <section>
        <LegalH2>How to VJ a live set with MOSH</LegalH2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>
            <strong>Open <Link to="/edit" className="text-accent hover:underline">the MOSH editor</Link></strong>{" "}
            and go live with your camera or load a video/image source.
          </li>
          <li>
            <strong>Enable system audio</strong> so MOSH reacts to whatever's playing through your
            device — the DJ's mix, your playlist, or a live mic feed.
          </li>
          <li>
            <strong>Build effect stacks</strong> — pair a warp with a color effect and a glitch on
            top. Save the ones that feel right as presets for later.
          </li>
          <li>
            <strong>Turn on Journey mode</strong> for hands-free, AI-driven reactivity that pops
            on the beat while you focus on manual controls.
          </li>
          <li>
            <strong>Go fullscreen and enable performance mode</strong> to hide the UI and give the
            renderer maximum GPU headroom.
          </li>
          <li>
            <strong>Project or screen-share</strong> the tab — plug into a projector via HDMI, or
            share the tab into OBS for a Twitch/YouTube live stream.
          </li>
        </ol>
      </section>

      <section>
        <LegalH2>Live performance tips</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Prep 3–5 presets before the set so you always have somewhere to go.</li>
          <li>Change one thing per song section — don't stack every effect at once.</li>
          <li>Use the mic input if system audio routing is tricky at a venue.</li>
          <li>Bring a mini HDMI adapter — every venue is different.</li>
          <li>Test the full chain (laptop → projector, laptop → OBS) before the show.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Ready for bigger shows</LegalH2>
        <p className="mt-3">
          MOSH is <Link to="/" className="text-accent hover:underline">free to start</Link>. When
          you're ready for the full kit, the one-time{" "}
          <Link to="/pricing" className="text-accent hover:underline">Supporter upgrade</Link>{" "}
          unlocks Journey mode and cloud-saved presets so your setlist follows you across
          gigs.
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
          Start VJing in your browser →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default GuideFreeVJSoftware;
