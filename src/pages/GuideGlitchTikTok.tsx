import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.netlify.app/guides/glitch-effect-video-tiktok";
const title = "How to Make Glitch Effect Videos for TikTok (Free)";
const description =
  "Make viral glitch effect videos for TikTok & Reels free — no app to download. Add RGB glitch, datamosh, and distortion to your clips with MOSH in your browser.";
const ogImage = "https://ether-mosh.netlify.app/og-image.png";

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
  keywords: "glitch effect video, TikTok glitch effect, glitch video editor",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "How do I add a glitch effect to a video?",
    a: "Open MOSH in your browser, drop in your clip (or go live with your camera), pick a glitch effect like RGB shift or datamosh, and record the result.",
  },
  {
    q: "Is there a free glitch video editor?",
    a: "Yes — MOSH is a free glitch video editor that runs in your browser. No download, no watermark, no time limit on free effects.",
  },
  {
    q: "Do I need an app to make glitch TikToks?",
    a: "No. MOSH works on iOS and Android through the browser, so you can film, glitch, and export a TikTok without installing anything.",
  },
  {
    q: "What's the best glitch effect for TikTok?",
    a: "RGB split and datamosh are the two most viral looks. Layer them for maximum stop-the-scroll energy.",
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

const GuideGlitchTikTok = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <meta name="keywords" content="glitch effect video, TikTok glitch effect, glitch video editor" />
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
          Glitch effect videos are one of the most-watched aesthetics on TikTok and Reels — a
          split-second of RGB shatter or a datamosh smear on a beat drop is enough to stop the
          scroll. This guide shows how to make glitch videos for TikTok for free, right in your
          browser, using <Link to="/" className="text-accent hover:underline">MOSH</Link>.
        </p>
      </section>

      <section>
        <LegalH2>Why glitch videos go viral</LegalH2>
        <p className="mt-3">
          The algorithm rewards videos that hold attention in the first second. Glitch effects are
          purpose-built for that: unexpected motion, high visual contrast, and a hint of "is my
          screen broken?" curiosity. Add them on a beat and you get instant hooks that keep people
          watching until the end.
        </p>
      </section>

      <section>
        <LegalH2>The main glitch looks</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>RGB split</strong> — red/green/blue channels shift apart for a 3D chromatic tear.</li>
          <li><strong>Datamosh</strong> — pixels melt and bleed between frames for a hypnotic smear.</li>
          <li><strong>Scanlines / CRT</strong> — retro TV rolling lines with static and grain.</li>
          <li><strong>Pixel sort</strong> — rows of the image get sorted into liquid neon streaks.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Make a glitch TikTok in MOSH — step by step</LegalH2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>
            <strong>Open MOSH</strong> at{" "}
            <Link to="/edit" className="text-accent hover:underline">the editor</Link> on your
            phone or laptop.
          </li>
          <li>
            <strong>Set your source</strong> — go live with your front camera, or drop in an
            existing clip you want to glitch.
          </li>
          <li>
            <strong>Shoot vertical (9:16)</strong> so it's ready to post to TikTok, Reels, and
            Shorts without cropping.
          </li>
          <li>
            <strong>Stack your glitch effects</strong> — try RGB shift plus datamosh plus a subtle
            scanline. Keep it to 2–3 effects for a clean look.
          </li>
          <li>
            <strong>Turn on Journey mode</strong> so glitches fire automatically on the beat if
            you're playing music.
          </li>
          <li>
            <strong>Record your clip</strong>, export it, and upload straight to TikTok, Instagram,
            or YouTube Shorts.
          </li>
        </ol>
      </section>

      <section>
        <LegalH2>Tips to stop the scroll</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Put the biggest glitch in the first second — that's your hook.</li>
          <li>Sync the glitch to the beat, not the vocals.</li>
          <li>Keep clips under 15 seconds; loop-friendly cuts get replayed.</li>
          <li>Use trending sounds — MOSH reacts to whatever's playing.</li>
          <li>Contrast helps: bright faces or neon colors read best through heavy glitch.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Why MOSH beats a glitch filter app</LegalH2>
        <p className="mt-3">
          Filter apps give you one canned look. MOSH gives you 105 stackable GPU effects, live
          audio reactivity, and no watermark — all{" "}
          <Link to="/" className="text-accent hover:underline">free in your browser</Link>. The
          optional <Link to="/pricing" className="text-accent hover:underline">Supporter upgrade</Link>{" "}
          adds Journey mode and cloud-saved presets so your signature glitch is one tap
          away every time.
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
          Make your glitch TikTok →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default GuideGlitchTikTok;
