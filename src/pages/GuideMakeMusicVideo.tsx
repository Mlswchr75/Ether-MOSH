import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.netlify.app/guides/make-music-video";
const title = "How to Make an Audio-Reactive Music Video";
const description =
  "Step-by-step guide to creating audio-reactive music visualizers for YouTube, TikTok, and Reels using MOSH's glitch instrument, live effects, and recording tools.";

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: title,
  description,
  totalTime: "PT15M",
  tool: [{ "@type": "HowToTool", name: "MOSH glitch instrument" }],
  step: [
    { "@type": "HowToStep", name: "Open the MOSH editor", text: "Go to /edit, allow camera or mic access, and pick a source." },
    { "@type": "HowToStep", name: "Route your audio", text: "Enable mic or system audio so the visuals react to the track in real time." },
    { "@type": "HowToStep", name: "Dial in effects", text: "Layer glitch, feedback, and palette effects until they hit on the beats you care about." },
    { "@type": "HowToStep", name: "Record a take", text: "Hit record, perform the visual through the song, and stop when done." },
    { "@type": "HowToStep", name: "Export for social", text: "Export in 9:16 for TikTok/Reels or 16:9 for YouTube and upload with the original audio." },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is MOSH a music visualizer?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. MOSH is a live audio-reactive glitch instrument. It listens to your mic or system audio and drives visuals in real time, which you can record and export as a music video.",
      },
    },
    {
      "@type": "Question",
      name: "What format should I export for TikTok or Reels?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Export as 9:16 vertical WebM or MP4. For YouTube use 16:9. MOSH's export sheet includes both presets.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need a camera?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. MOSH ships with a procedural source, so you can create visuals without a webcam. Camera and images add extra texture if you want them.",
      },
    },
  ],
};

const GuideMakeMusicVideo = () => (
  <>
    <Helmet>
      <title>{title} — MOSH</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={`${title} — MOSH`} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="article" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={`${title} — MOSH`} />
      <meta name="twitter:description" content={description} />
      <script type="application/ld+json">{JSON.stringify(howToJsonLd)}</script>
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
    </Helmet>

    <LegalLayout
      title={title}
      description={description}
      canonical={canonical}
      eyebrow="guide"
    >
      <section>
        <p>
          A music visualizer used to mean a plugin ticking along in the background of Winamp. Today
          it's the visual half of your release — the loop on TikTok, the static-but-not-static
          YouTube upload, the Reel that gets shared because it <em>feels</em> like the track. MOSH is
          a live <strong>glitch instrument</strong> built for exactly that: point it at your audio,
          play with the effects like you'd play a synth, and record the take.
        </p>
        <p className="mt-3">
          This guide walks through making an audio-reactive music video end-to-end, from opening the
          editor to exporting a file that's ready for upload.
        </p>
      </section>

      <section>
        <LegalH2>What you'll need</LegalH2>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>A browser (Chrome, Edge, or Safari 17+)</li>
          <li>The track you want to visualize — playing from Spotify, a DAW, or a local file</li>
          <li>Optional: a webcam or an image to use as a source layer</li>
        </ul>
      </section>

      <section>
        <LegalH2>1. Open the editor</LegalH2>
        <p className="mt-2">
          Head to <Link to="/edit" className="text-accent hover:underline">/edit</Link>. On first
          load MOSH will ask for camera and mic permissions. You can skip the camera and use the
          built-in procedural source if you'd rather not appear on video — the visuals hold up
          either way.
        </p>
      </section>

      <section>
        <LegalH2>2. Route your audio into MOSH</LegalH2>
        <p className="mt-2">
          Two options, depending on where the track lives:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Mic</strong> — the simplest path. Play the track from a speaker; MOSH picks it up
            through the mic. Fine for testing.
          </li>
          <li>
            <strong>System audio</strong> — capture the browser tab (or your whole system) so MOSH
            reacts to the exact waveform. Much cleaner for final takes.
          </li>
        </ul>
        <p className="mt-2">
          The audio HUD shows the bass / mid / treble bands lighting up when it's working.
        </p>
      </section>

      <section>
        <LegalH2>3. Play the glitch instrument</LegalH2>
        <p className="mt-2">
          This is where MOSH is different from a preset visualizer. You aren't picking a template —
          you're performing the visual. Stack effects (feedback, displacement, chroma, tile,
          palette), map them onto the beat, and shuffle when you want a hard cut. Try to land big
          gestures on the moments in the song that already carry weight — drops, breaks, the first
          hook.
        </p>
      </section>

      <section>
        <LegalH2>4. Record a take</LegalH2>
        <p className="mt-2">
          Hit record, play the song from the top, and perform the visual through it. Don't chase
          perfection on take one — the fastest path to a good music video is three loose takes and
          picking the best. Stop recording when the song ends.
        </p>
      </section>

      <section>
        <LegalH2>5. Export for the platform you're posting to</LegalH2>
        <p className="mt-2">
          Open the export sheet and choose the aspect ratio that matches where it's going:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>TikTok, Reels, Shorts</strong> — 9:16 vertical</li>
          <li><strong>YouTube</strong> — 16:9 landscape</li>
          <li><strong>Twitter / X</strong> — 1:1 square or 16:9</li>
        </ul>
        <p className="mt-2">
          Upload the exported video with the original track's audio. If you recorded via system
          audio, the audio is already baked in; otherwise mux it in a lightweight editor like
          CapCut before posting.
        </p>
      </section>

      <section>
        <LegalH2>Tips for videos that get watched</LegalH2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Front-load the strongest visual gesture in the first 1.5 seconds.</li>
          <li>Keep the palette tight — two or three colours read better on a phone.</li>
          <li>Match the intensity to the section. Verse = restraint, chorus = go.</li>
          <li>Loop-friendly endings get replayed, and replays are the whole game on TikTok.</li>
        </ul>
      </section>

      <section>
        <LegalH2>Ready to make one?</LegalH2>
        <p className="mt-2">
          <Link to="/edit" className="text-accent hover:underline">Open the editor</Link> and put a
          track on. First takes are usually the best ones.
        </p>
      </section>
    </LegalLayout>
  </>
);

export default GuideMakeMusicVideo;
