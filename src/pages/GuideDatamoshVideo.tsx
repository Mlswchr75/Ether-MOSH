import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.lovable.app/guides/how-to-datamosh-a-video";
const title = "How to Datamosh a Video Online (Free, No Software)";
const description =
  "Learn how to datamosh a video for free in your browser — no plugins or After Effects. Create the classic datamosh glitch effect in seconds with MOSH.";
const ogImage = "https://ether-mosh.lovable.app/og-image.jpg";

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
  keywords: "how to datamosh, datamosh online, datamosh video free",
};

const faqs: { q: string; a: string }[] = [
  {
    q: "What is datamoshing?",
    a: "Datamoshing is a glitch technique that corrupts video compression so pixels from one scene 'bleed' into the next, creating hypnotic smears and pixel drift.",
  },
  {
    q: "Can I datamosh a video online for free?",
    a: "Yes. MOSH runs in your browser and includes a real-time datamosh effect — no upload, no download, no account required.",
  },
  {
    q: "Do I need After Effects or a plugin?",
    a: "No. MOSH replicates the datamosh look with GPU shaders in the browser, so you don't need After Effects, Premiere, or any plugin.",
  },
  {
    q: "Does it work on mobile?",
    a: "Yes — MOSH works on modern iOS and Android browsers. You can datamosh a clip from your phone's camera and record the result directly.",
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

const GuideDatamoshVideo = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <meta name="keywords" content="how to datamosh, datamosh online, datamosh video free" />
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
          Datamoshing is one of the most iconic glitch aesthetics on the internet — the smeared,
          melting frames you've seen in Kanye videos, indie music clips, and countless TikToks.
          The classic tutorial says you need After Effects and a hex editor. You don't. This guide
          shows you how to datamosh a video for free, right in your browser, using{" "}
          <Link to="/" className="text-accent hover:underline">MOSH</Link>.
        </p>
      </section>

      <section>
        <LegalH2>What is datamoshing?</LegalH2>
        <p className="mt-3">
          Datamoshing exploits the way modern video codecs compress footage: instead of storing
          every frame in full, they store the <em>changes</em> between frames. When you strip out
          the keyframes and let the "motion" data play against the wrong image, pixels smear,
          bleed, and melt — a look that feels equal parts nostalgic VHS and futuristic decay.
        </p>
      </section>

      <section>
        <LegalH2>Why the datamosh look is so popular</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Instantly reads as "art film" or "underground music video"</li>
          <li>Turns ordinary footage into something dreamlike and emotional</li>
          <li>Perfect for hip-hop, lo-fi, hyperpop, and shoegaze aesthetics</li>
          <li>Reliably stops the scroll on TikTok, Reels, and YouTube Shorts</li>
        </ul>
      </section>

      <section>
        <LegalH2>Datamosh a video free in your browser with MOSH</LegalH2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>
            <strong>Open MOSH</strong> at{" "}
            <Link to="/edit" className="text-accent hover:underline">the editor</Link>.
          </li>
          <li>
            <strong>Add your source</strong> — go live with your camera, or drop in a video/image
            clip you want to mosh.
          </li>
          <li>
            <strong>Apply the datamosh effect</strong>, then stack{" "}
            <em>blockShift</em> on top for that signature macroblock drift.
          </li>
          <li>
            <strong>Tune intensity</strong> — pull the amount down for a subtle bleed, or push it
            up for full pixel meltdown.
          </li>
          <li>
            <strong>Record or export</strong> your clip and share it straight to socials.
          </li>
        </ol>
      </section>

      <section>
        <LegalH2>Tips for a clean datamosh</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Motion is fuel — footage with movement moshes far better than static shots.</li>
          <li>Use contrasting colors so the smear reads clearly on small screens.</li>
          <li>Layer datamosh with a subtle RGB shift for that VHS-tape edge.</li>
          <li>Cut the moment right on a beat drop for maximum impact.</li>
          <li>Keep clips short — 3–7 seconds of mosh hits harder than a full minute.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Works on mobile too</LegalH2>
        <p className="mt-3">
          MOSH runs on modern iPhone and Android browsers. You can shoot vertically, apply the
          datamosh effect live, and record the result without ever leaving your phone. No app to
          install, no upload, no watermark.
        </p>
      </section>

      <section>
        <LegalH2>Why MOSH is the fastest way to datamosh</LegalH2>
        <p className="mt-3">
          MOSH is free to <Link to="/" className="text-accent hover:underline">start using</Link>,
          runs in-browser on your GPU, and gives you real-time datamosh instead of a slow render.
          The optional{" "}
          <Link to="/pricing" className="text-accent hover:underline">Supporter upgrade</Link>{" "}
          unlocks the Smart AI director and cloud-saved presets for even faster workflows.
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
          Datamosh your video now →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default GuideDatamoshVideo;
