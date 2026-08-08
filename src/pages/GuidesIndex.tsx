import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout from "@/components/LegalLayout";

const canonical = "https://ether-mosh.lovable.app/guides";
const title = "Guides";
const description =
  "Tutorials and guides for making audio-reactive music videos, datamosh clips, glitch TikToks and live VJ visuals with MOSH.";

const guides = [
  {
    to: "/guides/audio-reactive-music-videos",
    title: "How to Make an Audio-Reactive Music Visualizer Video (Free)",
    blurb:
      "Turn any song into a live glitch visualizer for TikTok, Reels & YouTube — no software required.",
  },
  {
    to: "/guides/make-music-video",
    title: "How to Make an Audio-Reactive Music Video",
    blurb:
      "Step-by-step: route audio, dial in effects, record a take, and export for social.",
  },
  {
    to: "/guides/how-to-datamosh-a-video",
    title: "How to Datamosh a Video Online (Free, No Software)",
    blurb:
      "Get the classic datamosh glitch look for free in your browser — no After Effects, no plugins.",
  },
  {
    to: "/guides/free-vj-software-browser",
    title: "Free VJ Software: Make Live Visuals in Your Browser",
    blurb:
      "VJ gigs, parties, and live streams with real-time audio-reactive visuals — no download.",
  },
  {
    to: "/guides/glitch-effect-video-tiktok",
    title: "How to Make Glitch Effect Videos for TikTok (Free)",
    blurb:
      "RGB split, datamosh, and CRT scanlines that stop the scroll — free glitch editor in your browser.",
  },
];

const GuidesIndex = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={`${title} | MOSH`} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
    <LegalLayout
      title="Guides"
      description={description}
      canonical={canonical}
      eyebrow="guides"
      lastUpdated="July 23, 2026"
    >
      <ul className="space-y-6">
        {guides.map((g) => (
          <li key={g.to} className="border-t border-border/40 pt-6 first:border-none first:pt-0">
            <Link to={g.to} className="group block">
              <h2 className="font-sans text-xl font-semibold text-foreground group-hover:text-accent transition">
                {g.title}
              </h2>
              <p className="mt-2 text-foreground/80">{g.blurb}</p>
              <span className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
                read guide →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </LegalLayout>
  </>
);

export default GuidesIndex;
