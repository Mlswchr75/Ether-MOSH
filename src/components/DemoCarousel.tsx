/**
 * Bottom strip of bundled demo sources. Selecting one hands its URL back to
 * the page, which fetches it and drops it into the instrument.
 */
type Props = {
  onSelect: (src: string, productUrl: string) => void;
  isIdle: boolean;
};

const DEMOS = [
  { src: "/demo/prism.svg", label: "prism" },
  { src: "/demo/meridian.svg", label: "meridian" },
  { src: "/demo/relic.svg", label: "relic" },
];

const DemoCarousel = ({ onSelect }: Props) => (
  <div className="pointer-events-auto absolute bottom-16 left-1/2 z-20 -translate-x-1/2">
    <div className="flex items-center gap-3">
      <span className="hidden font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/40 sm:block">
        or mosh a demo →
      </span>
      {DEMOS.map((d) => (
        <button
          key={d.src}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(d.src, ""); }}
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
