import LegalLayout, { LegalH2 } from "@/components/LegalLayout";
import { Github, Linkedin, Twitter, Instagram, Music } from "lucide-react";
import { JourneyPortal, JourneyPortalProvider } from "@/components/journey/JourneyPortal";
import { PortalShapeGallery } from "@/components/journey/PortalShapeGallery";
import "./about.css";

const About = () => (
  <JourneyPortalProvider config={{ seed: 0xD71E5, palette: 3, intensity: .86, cadenceMs: 7_600 }}>
  <LegalLayout
    title="About Aesthetic Rebellion"
    description="The artistic journey, influences, and endeavors of Myles Whitcher and the Aesthetic Rebellion collective."
    canonical="https://ether-mosh.online/about"
    eyebrow="about"
  >
    <section className="about-portal-section about-portal-section--intro">
      <JourneyPortal shape="edge" className="about-portal about-portal--intro" crop={.18} />
      <p>
        <strong>Aesthetic Rebellion</strong> is the creative practice of Myles Whitcher — a digital artist,
        filmmaker, and instrument designer obsessed with glitch aesthetics, real-time synthesis, and the
        radical potential of destruction as a medium.
      </p>
      <p className="mt-4">
        Our work sits at the intersection of art, performance, and technology. We believe that the tools
        we create should empower artists to experiment fearlessly, to embrace chaos, and to find beauty
        in the unexpected artifacts of digital systems.
      </p>
    </section>

    <section className="about-portal-section about-portal-section--journey">
      <JourneyPortal shape="fissure" className="about-portal about-portal--journey" crop={.62} />
      <LegalH2>Artistic journey</LegalH2>
      <p className="mt-2">
        What began as an obsession with datamoshing — the deliberate corruption of video files to create
        surreal, glitched imagery — has evolved into a full creative ecosystem. From early experiments with
        codec artifacts and found digital materials, the practice expanded into real-time performance tools,
        audio-reactive instruments, and a curated collection of products that celebrate maximalist design.
      </p>
      <p className="mt-4">
        MOSH, the audio-reactive visual instrument at the heart of Aesthetic Rebellion, represents the
        culmination of years spent wrestling with WebGL, shader design, and the question: <em>what does
        it mean to perform with an instrument that thrives on controlled chaos?</em>
      </p>
    </section>

    <section className="about-portal-section about-portal-section--influences">
      <JourneyPortal shape="crater" className="about-portal about-portal--influences" crop={.83} />
      <LegalH2>Influences & inspirations</LegalH2>
      <p className="mt-2">
        The work draws from:
      </p>
      <ul className="mt-3 space-y-2 list-inside list-disc">
        <li><strong>Digital preservation & glitch art:</strong> Artists like Rosa Menkman, who reframe artifacts as aesthetics</li>
        <li><strong>Audiovisual performance:</strong> The tradition of live VJ culture, projection mapping, and experimental cinema</li>
        <li><strong>Maximalism:</strong> Defiant, unapologetic design that refuses minimalist restraint</li>
        <li><strong>Generative systems:</strong> Algorithmic art, procedural generation, and the beauty of emergence</li>
        <li><strong>Physics & motion:</strong> The work of artists exploring real-time synthesis, GPU computing, and computational aesthetics</li>
        <li><strong>Remix culture:</strong> The idea that creative freedom means being able to start anywhere — with any image, any sound</li>
      </ul>
    </section>

    <section className="about-portal-section about-portal-section--endeavors">
      <JourneyPortal shape="slash" className="about-portal about-portal--endeavors" crop={.4} />
      <LegalH2>Endeavors</LegalH2>
      <p className="mt-2">
        <strong>MOSH (Audio-Reactive Visual Instrument)</strong><br />
        A real-time, GPU-accelerated instrument for live performance and creative exploration. 107 effects.
        Beat-synced chaos. Built in the browser. Free to use.
      </p>
      <p className="mt-4">
        <strong>Aesthetic Rebellion Catalogue</strong><br />
        A curated collection of maximalist textiles, accessories, and goods. Every product is an aesthetic
        statement — bold colors, intricate patterns, uncompromising design.
      </p>
      <p className="mt-4">
        <strong>Workshops & Creative Tools</strong><br />
        Educational content, tutorials, and freely shared tools for artists interested in glitch aesthetics,
        datamoshing, audio-reactive visuals, and real-time performance.
      </p>
    </section>

    <section className="about-shape-atlas" aria-label="Custom live Journey portal shapes">
      <PortalShapeGallery limit={5} />
    </section>

    <section>
      <LegalH2>Connect</LegalH2>
      <p className="mt-2">
        Follow the work, ask questions, or collaborate:
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="https://twitter.com/aestheticrebel"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/10 transition"
        >
          <Twitter className="h-4 w-4" aria-hidden />
          Twitter / X
        </a>
        <a
          href="https://instagram.com/aestheticrebellion"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/10 transition"
        >
          <Instagram className="h-4 w-4" aria-hidden />
          Instagram
        </a>
        <a
          href="https://github.com/Mlswchr75"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/10 transition"
        >
          <Github className="h-4 w-4" aria-hidden />
          GitHub
        </a>
        <a
          href="https://linkedin.com/in/myleswhitcher"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/10 transition"
        >
          <Linkedin className="h-4 w-4" aria-hidden />
          LinkedIn
        </a>
        <a
          href="https://soundcloud.com/aestheticrebel"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded border border-accent/40 bg-accent/5 px-4 py-2 font-mono text-xs uppercase tracking-[0.2em] text-accent hover:bg-accent/10 transition"
        >
          <Music className="h-4 w-4" aria-hidden />
          SoundCloud
        </a>
      </div>
    </section>

    <section>
      <LegalH2>Credits & thanks</LegalH2>
      <p className="mt-2">
        MOSH was built with <strong>React</strong>, <strong>Three.js</strong>, and <strong>WebGL</strong>.
        Special thanks to the open-source community, to the artists who've shared their craft openly,
        and to everyone who's pushed the boundaries of what's possible in the browser.
      </p>
      <p className="mt-4">
        The Aesthetic Rebellion catalogue is crafted in partnership with select manufacturers and
        artisans committed to bold design and quality production.
      </p>
    </section>
  </LegalLayout>
  </JourneyPortalProvider>
);

export default About;
