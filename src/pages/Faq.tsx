import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import LegalLayout, { LegalH2 } from "@/components/LegalLayout";

const canonical = "https://ether-mosh.online/faq";
const title = "MOSH FAQ — Real-Time Audio-Reactive Glitch Visuals";
const description =
  "Answers about MOSH: what it is, pricing, 59 GPU effects, audio reactivity, camera and privacy, Dyes Mavis and Aesthetic Rebellion, embedding, and commercial use.";
const ogImage = "https://ether-mosh.online/og-image.png";

type Faq = { q: string; a: React.ReactNode; text: string };
type Section = { id: string; heading: string; faqs: Faq[] };

const sections: Section[] = [
  {
    id: "general",
    heading: "General & platform overview",
    faqs: [
      {
        q: "What is MOSH?",
        text:
          "MOSH is a real-time, browser-based audio-reactive visual instrument. It turns your live camera feed or uploaded images and videos into dynamic, beat-synced glitch art using advanced WebGL GPU shaders.",
        a: (
          <>
            <strong>MOSH</strong> is a real-time, browser-based audio-reactive visual instrument. It
            turns your live camera feed or uploaded images/videos into dynamic, beat-synced glitch
            art using advanced WebGL GPU shaders.
          </>
        ),
      },
      {
        q: "Is MOSH free to use?",
        text:
          "Yes. MOSH offers free access to its core real-time glitch and audio-reactive instrument in your web browser. An optional Supporter upgrade ($4.99 one-time) and physical gear at aestheticrebellion.store fund ongoing GPU shader development.",
        a: (
          <>
            Yes! MOSH offers free access to its core real-time glitch and audio-reactive instrument
            in your web browser. Optional{" "}
            <Link to="/pricing" className="text-accent hover:underline">
              Supporter upgrades
            </Link>{" "}
            ($4.99 one-time) and physical gear are available at{" "}
            <a
              href="https://aestheticrebellion.store"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              aestheticrebellion.store
            </a>{" "}
            to fund ongoing GPU shader development.
          </>
        ),
      },
      {
        q: "Who created MOSH?",
        text:
          "MOSH was built by visual artist and creative coder Dyes Mavis, as the digital visual arm of Aesthetic Rebellion.",
        a: (
          <>
            MOSH was built by visual artist and creative coder <strong>Dyes Mavis</strong>. It
            serves as the digital visual arm of <strong>Aesthetic Rebellion</strong>, a project
            bridging real-time software art and physical glitch aesthetics.
          </>
        ),
      },
      {
        q: "Do I need to install software or apps to run MOSH?",
        text:
          "No installation is required. MOSH runs natively in any modern WebGL2-enabled browser (Chrome, Safari, Firefox, Edge) on desktop and mobile.",
        a: (
          <>
            No installation is required. MOSH runs natively in any modern WebGL2-enabled web browser
            (Chrome, Safari, Firefox, Edge) across desktop and mobile devices.
          </>
        ),
      },
      {
        q: "What makes MOSH different from traditional video filters?",
        text:
          "Unlike static video filters, MOSH generates visuals dynamically in real time, processing live audio frequencies and beat pulses through custom WebGL shaders synchronously with sound.",
        a: (
          <>
            Unlike static video filters, MOSH generates visuals <em>dynamically in real time</em>.
            It processes live audio frequencies and beat pulses directly through custom WebGL
            shaders to distort and datamosh imagery synchronously with sound.
          </>
        ),
      },
    ],
  },
  {
    id: "features",
    heading: "Features & audio-reactivity",
    faqs: [
      {
        q: "How many visual GPU effects does MOSH offer?",
        text:
          "MOSH includes 59 real-time GPU effects, from datamoshing and scanline CRT overlays to liquid color bleeds, bio-flickers, and audio-reactive displacement maps.",
        a: (
          <>
            MOSH includes <strong>59 real-time GPU effects</strong>, ranging from datamoshing and
            scanline CRT overlays to liquid color bleeds, bio-flickers, and audio-reactive
            displacement maps.
          </>
        ),
      },
      {
        q: "How does audio reactivity work in MOSH?",
        text:
          "MOSH uses the Web Audio API to detect frequency bands, pitch, and beat pulses from your microphone or system audio, mapping them to shader uniforms that drive real-time visual shifts.",
        a: (
          <>
            MOSH utilizes the Web Audio API to detect frequency bands, pitch, and beat pulses from
            your microphone or playing system audio. It maps these sound parameters to shader
            uniforms, driving real-time visual shifts synced to music.
          </>
        ),
      },
      {
        q: "Can I upload my own images or videos to MOSH?",
        text:
          "Yes. You can drag and drop images, paste from the clipboard, or upload local files directly into the interface to apply live datamosh effects.",
        a: (
          <>
            Yes! You can drag and drop images, paste images from your clipboard, or upload local
            files directly into the interface to apply live datamosh effects.
          </>
        ),
      },
      {
        q: "Can I use MOSH with my device's live webcam?",
        text:
          "Yes. MOSH connects directly to front-facing or rear cameras on desktop, mobile, and tablet devices to turn your live camera feed into an audio-reactive visualizer.",
        a: (
          <>
            Yes. MOSH connects directly to front-facing or rear cameras on desktop, mobile, and
            tablet devices to turn your live camera feed into an audio-reactive visualizer.
          </>
        ),
      },
      {
        q: "Does MOSH support touch and haptic feedback?",
        text:
          "Yes. Mobile and tablet users get tactile haptic responses during interaction and preset toggles.",
        a: (
          <>
            Yes! Mobile and tablet users experience tactile haptic responses during interaction and
            preset toggles.
          </>
        ),
      },
    ],
  },
  {
    id: "how-to",
    heading: "How to use MOSH & workflows",
    faqs: [
      {
        q: "How do I start moshing with my live camera?",
        text:
          "Tap the primary MOSH button on the homepage, select Start Camera, grant camera permission in your browser, and begin manipulating live visuals.",
        a: (
          <>
            Tap the primary <strong>MOSH</strong> button on the{" "}
            <Link to="/" className="text-accent hover:underline">
              homepage
            </Link>
            , select <strong>Start Camera</strong>, grant camera permissions in your browser, and
            begin manipulating live visuals.
          </>
        ),
      },
      {
        q: "Why is my camera blocked or not working?",
        text:
          "Camera access can fail if permissions are denied or another app (Zoom, FaceTime) is using the camera. Allow permissions in your browser address bar and close conflicting apps.",
        a: (
          <>
            Camera access can fail if permissions are denied or another application (Zoom, FaceTime)
            is using it. Ensure permissions are allowed in your browser address bar and close
            conflicting apps.
          </>
        ),
      },
      {
        q: "Can I paste an image directly into MOSH?",
        text:
          "Yes. Copy any image to your clipboard and press Ctrl+V (or Cmd+V) anywhere on the MOSH homepage to start processing it instantly.",
        a: (
          <>
            Yes! Simply copy any image to your clipboard and press <code>Ctrl+V</code> (or{" "}
            <code>Cmd+V</code>) anywhere on the MOSH homepage to start processing it instantly.
          </>
        ),
      },
      {
        q: 'What is the "Forge" in MOSH?',
        text:
          "The Forge (/forge) is MOSH's experimental workspace where creators can customize, chain, and fine-tune GPU shader parameters for custom visuals.",
        a: (
          <>
            The{" "}
            <Link to="/forge" className="text-accent hover:underline">
              Forge
            </Link>{" "}
            is MOSH's experimental workspace where creators can customize, chain, and fine-tune GPU
            shader parameters for custom visuals.
          </>
        ),
      },
      {
        q: "How do I save or export my visual creations?",
        text:
          "You can record your screen or capture snapshot frames directly within MOSH to export high-resolution glitched assets for music videos, visuals, or social posts.",
        a: (
          <>
            You can record your screen or capture snapshot frames directly within MOSH to export
            high-resolution glitched assets for music videos, visuals, or social posts.
          </>
        ),
      },
    ],
  },
  {
    id: "artist",
    heading: "Artist journey & Aesthetic Rebellion",
    faqs: [
      {
        q: "What is the story behind Dyes Mavis?",
        text:
          "Dyes Mavis is a multidisciplinary digital artist and visual hacker combining analog video synthesis, raw datamoshing, and modern real-time WebGL coding. MOSH was built to give musicians and VJs instant access to studio-grade glitch instruments.",
        a: (
          <>
            <strong>Dyes Mavis</strong> is a multidisciplinary digital artist and visual hacker known
            for combining analog video synthesis, raw datamoshing techniques, and modern real-time
            WebGL coding. MOSH was built out of Dyes Mavis's desire to give musicians and VJs
            instantaneous access to studio-grade glitch instruments.
          </>
        ),
      },
      {
        q: "What is Aesthetic Rebellion?",
        text:
          "Aesthetic Rebellion is the independent creative studio and collective founded by Dyes Mavis, spanning software visual tools, sound-reactive experiments, and physical street-culture apparel.",
        a: (
          <>
            <strong>Aesthetic Rebellion</strong> is the independent creative studio and collective
            founded by Dyes Mavis. It spans software visual tools, sound reactive experiments, and
            physical street-culture apparel.
          </>
        ),
      },
      {
        q: "What can I find at aestheticrebellion.store?",
        text:
          "Fans and creators can purchase physical apparel, art prints, physical visual hardware setups, and exclusive drops designed by Dyes Mavis.",
        a: (
          <>
            At{" "}
            <a
              href="https://aestheticrebellion.store"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              aestheticrebellion.store
            </a>
            , fans and creators can purchase physical apparel, art prints, physical visual hardware
            setups, and exclusive drops designed by Dyes Mavis.
          </>
        ),
      },
      {
        q: "Can I hire Dyes Mavis for custom VJing or visual installations?",
        text:
          "Yes. Dyes Mavis collaborates with touring musicians, DJs, and brands for custom audio-reactive stage visuals, concert visuals, and visual software development.",
        a: (
          <>
            Yes! Dyes Mavis collaborates with touring musicians, DJs, and brands for custom
            audio-reactive stage visuals, concert visuals, and visual software development. Reach
            out through{" "}
            <a
              href="https://aestheticrebellion.store"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              aestheticrebellion.store
            </a>{" "}
            or the{" "}
            <Link to="/contact" className="text-accent hover:underline">
              contact page
            </Link>
            .
          </>
        ),
      },
      {
        q: "How does purchasing from aestheticrebellion.store support MOSH?",
        text:
          "Every merchandise purchase or supporter contribution directly funds server costs, GPU infrastructure, and free public updates to the MOSH WebGL engine.",
        a: (
          <>
            Every merchandise purchase or supporter contribution directly funds server costs, GPU
            infrastructure, and free public updates to the MOSH WebGL engine.
          </>
        ),
      },
    ],
  },
  {
    id: "platforms",
    heading: "Social integration & platform compatibility",
    faqs: [
      {
        q: "Can I use MOSH effects on TikTok or Instagram?",
        text:
          "Yes. Beyond the web app, MOSH shader concepts are ported into TikTok Effect House and Instagram Spark AR camera filters for direct mobile video creation.",
        a: (
          <>
            Yes! Beyond the web app, MOSH shader concepts are ported directly into{" "}
            <strong>TikTok Effect House</strong> and <strong>Instagram Spark AR</strong> camera
            filters for direct mobile video creation.
          </>
        ),
      },
      {
        q: "Can I embed MOSH inside my own website or Shopify store?",
        text:
          'Yes. Embed MOSH with an iframe: <iframe src="https://ether-mosh.lovable.app/" width="100%" height="600px" allow="camera; microphone"></iframe>',
        a: (
          <>
            Yes. You can embed MOSH using a responsive <code>&lt;iframe&gt;</code> tag on any HTML
            site or Shopify page:
            <pre className="mt-3 overflow-x-auto rounded-md border border-foreground/15 bg-foreground/5 p-3 font-mono text-[11px] leading-relaxed">
              {`<iframe src="https://ether-mosh.lovable.app/" width="100%" height="600px" allow="camera; microphone"></iframe>`}
            </pre>
          </>
        ),
      },
      {
        q: "Is there a Telegram Mini App version of MOSH?",
        text:
          "Yes. You can launch MOSH natively inside Telegram chats as an interactive WebApp using the dedicated MOSH Telegram bot setup.",
        a: (
          <>
            Yes! You can launch MOSH natively inside Telegram chats as an interactive WebApp using
            the dedicated MOSH Telegram bot setup.
          </>
        ),
      },
      {
        q: "Can I launch MOSH inside Discord?",
        text:
          "Yes. MOSH can be integrated as a custom Discord Activity, letting users generate visuals together inside voice and text channels.",
        a: (
          <>
            Yes. MOSH can be integrated as a custom Discord Activity, enabling users to generate
            visuals together inside voice and text channels.
          </>
        ),
      },
      {
        q: "Can I use visuals generated in MOSH for commercial music videos?",
        text:
          "Yes. Creators retain full ownership of visuals recorded using MOSH for commercial music videos, album art, social content, and live stage performances.",
        a: (
          <>
            Yes! Creators retain full ownership of visuals recorded using MOSH for use in commercial
            music videos, album art, social content, and live stage performances.
          </>
        ),
      },
    ],
  },
  {
    id: "technical",
    heading: "Technical specs, privacy & accounts",
    faqs: [
      {
        q: "What system requirements are needed to run MOSH smoothly?",
        text:
          "MOSH runs best on modern browsers supporting WebGL2 and GPU acceleration. Dedicated GPU power ensures higher frame rates during complex audio-reactive processing.",
        a: (
          <>
            MOSH runs best on modern browsers supporting <strong>WebGL2</strong> and GPU
            acceleration. Dedicating GPU power ensures higher frame rates during complex
            audio-reactive processing.
          </>
        ),
      },
      {
        q: "Does MOSH record or store my webcam footage on a server?",
        text:
          "No. All webcam streams and video processing occur entirely client-side inside your device's browser GPU. No video feeds are recorded or transmitted to external servers.",
        a: (
          <>
            No! All webcam streams and video processing occur <strong>entirely client-side</strong>{" "}
            inside your device's browser GPU. No video feeds are recorded or transmitted to external
            servers.
          </>
        ),
      },
      {
        q: "Do I need an account to use MOSH?",
        text:
          "No account is required to use the visualizer. Signing in via Google, Apple, or email lets you sync saved settings, shader presets, and supporter benefits across devices.",
        a: (
          <>
            No account is required to use the visualizer. However, signing in via Google, Apple, or
            email lets you sync saved settings, shader presets, and supporter benefits across
            devices.
          </>
        ),
      },
      {
        q: "Where can I review MOSH's Terms and Privacy policy?",
        text:
          "You can review full platform documentation anytime at /terms and /privacy.",
        a: (
          <>
            You can review full platform documentation anytime at{" "}
            <Link to="/terms" className="text-accent hover:underline">
              /terms
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-accent hover:underline">
              /privacy
            </Link>
            .
          </>
        ),
      },
      {
        q: "How can I request new visual effects or report bugs?",
        text:
          "Join the Aesthetic Rebellion community, reach out via the app's social share channels, or contact Dyes Mavis directly via aestheticrebellion.store.",
        a: (
          <>
            Join the Aesthetic Rebellion community, reach out via the{" "}
            <Link to="/contact" className="text-accent hover:underline">
              contact page
            </Link>
            , or contact Dyes Mavis directly via{" "}
            <a
              href="https://aestheticrebellion.store"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              aestheticrebellion.store
            </a>
            .
          </>
        ),
      },
    ],
  },
];

const allFaqs = sections.flatMap((s) => s.faqs);

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: allFaqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.text },
  })),
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://ether-mosh.lovable.app/" },
    { "@type": "ListItem", position: 2, name: "FAQ", item: canonical },
  ],
};

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-sans text-lg font-semibold text-foreground">{children}</h3>
);

const Faq = () => (
  <>
    <Helmet>
      <title>{title} | MOSH</title>
      <meta name="description" content={description} />
      <meta
        name="keywords"
        content="MOSH FAQ, audio reactive visuals, datamosh browser, Dyes Mavis, Aesthetic Rebellion, WebGL glitch"
      />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MOSH" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      <script type="application/ld+json">{JSON.stringify(breadcrumbJsonLd)}</script>
    </Helmet>

    <LegalLayout
      title="MOSH — Frequently Asked Questions"
      description={description}
      canonical={canonical}
      eyebrow="faq"
      lastUpdated="August 2, 2026"
    >
      <section>
        <p>
          Welcome to the official <strong>MOSH</strong> knowledge base. Explore answers about our
          live audio-reactive visual instrument, GPU datamoshing effects, hardware compatibility,
          and the story behind <strong>Aesthetic Rebellion</strong>.
        </p>
        <nav aria-label="FAQ sections" className="mt-5 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-foreground/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70 transition hover:border-accent/60 hover:text-accent"
            >
              {s.heading}
            </a>
          ))}
        </nav>
      </section>

      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24">
          <LegalH2>{s.heading}</LegalH2>
          <div className="mt-4 space-y-6">
            {s.faqs.map((f) => (
              <div key={f.q}>
                <H3>{f.q}</H3>
                <div className="mt-2">{f.a}</div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="pt-4">
        <Link
          to="/edit"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 font-mono text-xs uppercase tracking-[0.25em] text-accent-foreground shadow-[0_0_24px_hsl(var(--accent)/0.35)] transition hover:brightness-110"
        >
          Start moshing free →
        </Link>
      </section>
    </LegalLayout>
  </>
);

export default Faq;
