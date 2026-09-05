import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";
import { PUBLIC_EFFECTS } from "@/engine/effects";

const canonical = "https://ether-mosh.online/guides/audio-reactive-music-videos";
const title = "How to Make an Audio-Reactive Music Visualizer Video (Free)";
const description =
  "Learn how to create audio-reactive music videos for TikTok, Reels & YouTube — no software. Turn any song into a live glitch visualizer with Ether-MOSH, free in your browser.";
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
};

const faqs: { q: string; a: string }[] = [
  {
    q: "What is the best free music visualizer?",
    a: "Ether-MOSH is a free, browser-based music visualizer that reacts to audio in real time — no download or account required.",
  },
  {
    q: "How do I make a music visualizer for TikTok or Reels?",
    a: "Open Ether-MOSH, enable your mic or system audio, pick your effects, play your song, and record a vertical clip to share.",
  },
  {
    q: "Do I need any software or plugins?",
    a: "No. Ether-MOSH runs entirely in your browser on desktop or mobile — nothing to install.",
  },
  {
    q: "Can I use my own music?",
    a: "Yes. Play your track out loud (or through system audio) and Ether-MOSH's audio-reactive engine syncs the visuals to it. Make sure you have the rights to any music you publish.",
  },
  {
    q: "Is Ether-MOSH really free?",
    a: "Yes — the full visual instrument is free. An optional one-time Supporter upgrade adds Journey mode and cloud-saved presets.",
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

const GuideAudioReactive = () => (
  <>
    <Helmet>
      <title>{title} | Ether-MOSH</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="article" />
      <meta property="og:site_name" content="Ether-MOSH" />
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
      lastUpdated="July 22, 2026"
    >
      <section>
        <p>
          Audio-reactive music videos are everywhere on TikTok, Instagram Reels, and YouTube —
          hypnotic visuals that pulse, glitch, and warp in time with the beat. The good news: you
          don't need After Effects, a plugin, or any download to make one. This guide shows you how
          to create a music visualizer video for free, right in your browser, using{" "}
          <Link to="/" className="text-accent hover:underline">Ether-MOSH</Link> — a live glitch-art
          visual instrument that reacts to sound in real time.
        </p>
      </section>

      <section>
        <LegalH2>What is an audio-reactive music visualizer?</LegalH2>
        <p className="mt-3">
          An audio-reactive visualizer is a video whose visuals respond automatically to audio —
          bass hits trigger bursts, treble adds shimmer, the beat drives motion. Instead of static
          footage, the imagery <em>performs</em> with the music. It works for any genre — from
          lo-fi to hip-hop to EDM — and any source: your camera, an image, or purely abstract
          visuals.
        </p>
      </section>

      <section>
        <LegalH2>What you'll need</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>A device with a browser (desktop or mobile)</li>
          <li>A song or audio playing (from your phone, a speaker, or the same device)</li>
          <li>Ether-MOSH (free — no account, no install)</li>
        </ul>
      </section>

      <section>
        <LegalH2>Step-by-step: make your first audio-reactive video</LegalH2>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>
            <strong>Open Ether-MOSH</strong> and go live with your camera, or drop in an image/video as
            your source.
          </li>
          <li>
            <strong>Turn on the mic</strong> (or enable system audio) so Ether-MOSH can hear your track.
            This is what makes the visuals react to sound.
          </li>
          <li>
            <strong>Pick your effects</strong> — stack a few of the {PUBLIC_EFFECTS.length} GPU effects (try datamosh,
            RGB shift, liquid warp, and a color effect). Each layer reacts to the audio.
          </li>
          <li>
            <strong>Turn on Journey mode</strong> for hands-free, AI-driven reactivity that
            fires bursts on the beat and responds to your movement.
          </li>
          <li>
            <strong>Play your song</strong> and perform — move, adjust effects, let it react.
          </li>
          <li>
            <strong>Hit record</strong>, capture your clip, then <strong>export or share</strong>{" "}
            straight to your socials.
          </li>
        </ol>
      </section>

      <section>
        <LegalH2>Tips for videos that pop on social media</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Shoot vertical (9:16) for TikTok, Reels, and Shorts.</li>
          <li>Let the bass drive — big low-end hits create the most dramatic bursts.</li>
          <li>Less is more: 2–4 stacked effects usually looks better than 10.</li>
          <li>
            Match the effect energy to the song — dreamy tracks like subtle warps, aggressive tracks
            like glitch and datamosh.
          </li>
          <li>Record a few short takes and cut the best moments.</li>
          <li>
            Add a strong first second — the beat drop should hit visually right away to stop the
            scroll.
          </li>
        </ul>
      </section>

      <section>
        <LegalH2>Best settings by genre</LegalH2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Lo-fi / chill</strong> → subtle warps + grain</li>
          <li><strong>Hip-hop / trap</strong> → heavy datamosh on the bass</li>
          <li><strong>EDM / house</strong> → color quake + zoom blur on the drop</li>
          <li><strong>Ambient</strong> → dreamy glow + aurora</li>
        </ul>
      </section>

      <section>
        <LegalH2>Why use Ether-MOSH for music visualizers</LegalH2>
        <p className="mt-3">
          Ether-MOSH is built for exactly this — real-time, audio-reactive, GPU-powered visuals that run
          in any browser with no downloads. It's free to{" "}
          <Link to="/" className="text-accent hover:underline">start creating</Link>, works on
          mobile, and lets you record and share in a couple taps. The optional{" "}
          <Link to="/pricing" className="text-accent hover:underline">Supporter upgrade</Link>{" "}
          unlocks Journey mode and cloud-saved presets.
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
          Create your music visualizer →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default GuideAudioReactive;
