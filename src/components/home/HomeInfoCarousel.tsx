import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { liveVisualKeywords, liveVisualOfferings, liveVisualSocials } from "@/content/liveVisuals";
import { AmbientGlitch } from "./AmbientGlitch";

const slideNames = ["Signal", "About", "Offerings", "Dyles", "Skills", "Contact", "News"] as const;

type HomeInfoCarouselProps = {
  onReturnToInstrument: () => void;
};

const wrapSlide = (index: number) => (index + slideNames.length) % slideNames.length;

export const HomeInfoCarousel = ({ onReturnToInstrument }: HomeInfoCarouselProps) => {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const gesture = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const wheelCarry = useRef(0);
  const wheelLocked = useRef(false);

  // The info story lives one full viewport above the landing point. Keep its
  // ambient motion completely asleep until a visitor actually scrolls there.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.18 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const move = useCallback((amount: 1 | -1) => {
    setDirection(amount);
    setActive(current => wrapSlide(current + amount));
  }, []);

  const goTo = useCallback((index: number) => {
    setDirection(index >= active ? 1 : -1);
    setActive(wrapSlide(index));
  }, [active]);

  const onWheel = (event: React.WheelEvent<HTMLElement>) => {
    const delta = event.shiftKey ? event.deltaY : event.deltaX;
    if (!event.shiftKey && (Math.abs(event.deltaX) < 8 || Math.abs(event.deltaX) <= Math.abs(event.deltaY))) return;
    event.preventDefault();
    event.stopPropagation();
    if (wheelLocked.current) return;
    wheelCarry.current += delta;
    if (Math.abs(wheelCarry.current) < 30) return;
    move(wheelCarry.current > 0 ? 1 : -1);
    wheelCarry.current = 0;
    wheelLocked.current = true;
    window.setTimeout(() => { wheelLocked.current = false; }, 460);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("a, button")) return;
    gesture.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 54 && Math.abs(dx) > Math.abs(dy) * 1.15) move(dx < 0 ? 1 : -1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "Home") { event.preventDefault(); goTo(0); }
    if (event.key === "End") { event.preventDefault(); goTo(slideNames.length - 1); }
  };

  return (
    <section
      ref={sectionRef}
      className="home-info-carousel relative h-full w-full overflow-hidden"
      data-info-carousel
      data-visible={visible || undefined}
      tabIndex={0}
      aria-roledescription="carousel"
      aria-label="Ether-MOSH live visuals"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; }}
      onKeyDown={onKeyDown}
    >
      <AmbientGlitch active={visible} />
      <div className="home-info-grid" aria-hidden />
      <div className="home-info-orbit" aria-hidden><i/><i/><i/></div>
      <div className="home-info-signal-tears" aria-hidden><i/><i/><i/><i/></div>

      <header className="home-info-mast">
        <span>MOSH / live visuals / Dyles Mavis</span>
        <span aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(slideNames.length).padStart(2, "0")} · {slideNames[active]}</span>
      </header>

      <div key={active} className={`home-info-slide home-info-slide--${direction > 0 ? "next" : "previous"}${active === 0 ? " home-info-slide--signal" : ""}`} aria-roledescription="slide" aria-label={`${active + 1} of ${slideNames.length}: ${slideNames[active]}`}>
        {active === 0 && <>
          <div className="home-info-hero">
            <p className="home-info-kicker">Live performance · tour content · generative systems</p>
            <h2>Leave the frame.<br/><span>Enter the signal.</span></h2>
          </div>
          <div className="home-info-bottom-copy">
            <p>Meet the artist behind MOSH, explore live visual use cases, commissions, social channels, and the places where chaos becomes the medium.</p>
            <Link to="/live-visuals">Open the full experience <ArrowUpRight/></Link>
          </div>
        </>}

        {active === 1 && <div className="home-info-editorial">
          <div><p className="home-info-kicker">About the instrument</p><h2>Ether-MOSH makes<br/><span>sound visible.</span></h2></div>
          <div className="home-info-prose"><strong>Ether-MOSH is an audiovisual performance instrument for the exact moment a track stops being something you hear and becomes somewhere you are.</strong><p>It turns audio, images, video, cameras, patterns, and live decisions into responsive motion. Every frame can react. Every performance can mutate. The machine brings speed; a human still decides what matters.</p><Link to="/edit">Open the instrument <ArrowUpRight/></Link></div>
        </div>}

        {active === 2 && <div className="home-info-offerings">
          <div><p className="home-info-kicker">Offerings / capabilities</p><h2>Move<br/><span>the room.</span></h2><p>Live collaboration, commissions, complete visual packages, and scalable systems—remote worldwide.</p></div>
          <div className="home-info-service-grid">{liveVisualOfferings.map(service => <article key={service.number}><i>{service.number}</i><h3>{service.title}</h3><small>{service.tags}</small></article>)}</div>
        </div>}

        {active === 3 && <div className="home-info-editorial home-info-editorial--dyles">
          <div><p className="home-info-kicker">Visual anarchist</p><h2>Dyles<br/><span>Mavis.</span></h2></div>
          <div className="home-info-prose"><strong>I make tools and images for people who are bored by safe decisions.</strong><p>The multidisciplinary artist behind Ether-MOSH and Aesthetic Rebellion—moving between digital art, filmmaking, generative systems, maximalist pattern, wearable art, real-time graphics, and controlled catastrophe.</p><a href="https://aestheticrebellion.store" target="_blank" rel="noreferrer">Visit Aesthetic Rebellion <ArrowUpRight/></a></div>
        </div>}

        {active === 4 && <div className="home-info-skills">
          <div><p className="home-info-kicker">Skills / areas of interest</p><h2>Disturb<br/><span>the force.</span></h2></div>
          <div className="home-info-keywords">{liveVisualKeywords.map((keyword, index) => <span key={keyword}><i>{String(index + 1).padStart(2, "0")}</i>{keyword}</span>)}</div>
        </div>}

        {active === 5 && <div className="home-info-contact">
          <p className="home-info-kicker">Bookings / commissions / strange good ideas</p>
          <h2>Vision is the canvas.<br/><span>Chaos is the medium.</span></h2>
          <p>If you are an artist, label, creative director, venue, streamer, festival, brand, or person with a wall that should be doing more—tell me what you are making.</p>
          <a className="home-info-email" href="mailto:dyles@aestheticrebellion.store?subject=Ether-MOSH%20visuals%20inquiry">dyles@aestheticrebellion.store <ArrowUpRight/></a>
          <div className="home-info-socials">{liveVisualSocials.slice(0, 5).map(([name, href]) => <a key={name} href={href} target="_blank" rel="noreferrer">{name}</a>)}</div>
        </div>}

        {active === 6 && <div className="home-info-editorial home-info-editorial--news">
          <div><p className="home-info-kicker">News + updates / effect school</p><h2>Bad signal.<br/><span>Good information.</span></h2></div>
          <div className="home-info-prose"><strong>Real effect history, practical recipes, fake scandals, downloadable field cards, and exactly enough adult language to keep the documentation awake.</strong><p>Start with Pixel Sort, Halftone, and Moire—three sourced guides covering how each effect works, where it came from, how to find it in MOSH, and how to drag it out into print, patterns, projection, animation, education, and installations.</p><Link to="/news">Read News + Updates <ArrowUpRight/></Link></div>
        </div>}
      </div>

      <div className="home-info-controls" aria-label="Live visuals chapters">
        <button type="button" className="home-info-arrow" onClick={() => move(-1)} aria-label="Previous chapter"><ArrowLeft/></button>
        <div className="home-info-pills">{slideNames.map((name, index) => <button key={name} type="button" className={index === active ? "is-active" : ""} onClick={() => goTo(index)} aria-label={`Show ${name}`} aria-current={index === active ? "true" : undefined}><span>{name}</span></button>)}</div>
        <button type="button" className="home-info-arrow" onClick={() => move(1)} aria-label="Next chapter"><ArrowRight/></button>
        <span className="home-info-swipe-hint">swipe / scroll</span>
      </div>

      <button type="button" onClick={onReturnToInstrument} className="home-info-instrument">Instrument <ArrowDown/></button>
    </section>
  );
};
