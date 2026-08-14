/**
 * Bottom strip of demo sources drawn from the Aesthetic Rebellion product
 * catalogue. Selecting one fetches the image and drops it into the instrument,
 * then opens the store page in a new tab.
 */
import { CAROUSEL_IMAGES } from "@/data/carouselImages";
import { KEEP_OUT } from "@/components/home/GlitchWordField";

type Props = {
  onSelect: (src: string, productUrl: string) => void;
  isIdle: boolean;
};

const PICKS = [
  CAROUSEL_IMAGES.find(i => i.id === "a16")!,
  CAROUSEL_IMAGES.find(i => i.id === "b14")!,
  CAROUSEL_IMAGES.find(i => i.id === "b08")!,
];

const DemoCarousel = ({ onSelect }: Props) => (
  <div {...KEEP_OUT} className="pointer-events-auto absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
    <div className="flex items-center gap-3">
      <span className="hidden font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/40 sm:block">
        or mosh a demo →
      </span>
      {PICKS.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(d.src, d.productUrl); }}
          className="group/demo h-12 w-16 overflow-hidden border border-border/60 transition hover:border-accent"
          aria-label={`Load demo: ${d.label}`}
        >
          <img
            src={d.src}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover opacity-70 transition group-hover/demo:scale-110 group-hover/demo:opacity-100"
          />
        </button>
      ))}
    </div>
  </div>
);

export default DemoCarousel;
