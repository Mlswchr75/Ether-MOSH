import { JourneyPortal, JourneyPortalProvider } from "./JourneyPortal";
import { CUSTOM_PORTAL_SHAPES, type CustomPortalShape } from "./portalShapes";
import "./portal-shape-gallery.css";

const ALL_SHAPES = Object.keys(CUSTOM_PORTAL_SHAPES) as CustomPortalShape[];

export function PortalShapeGallery({ className = "", limit = 12 }: { className?: string; limit?: number }) {
  return (
    <div className={`portal-shape-gallery ${className}`}>
      {ALL_SHAPES.slice(0, limit).map((name, index) => (
        <figure className={`portal-specimen portal-specimen--${name}`} key={name}>
          <JourneyPortal
            clipPath={CUSTOM_PORTAL_SHAPES[name]}
            crop={(index * .173) % 1}
            className="portal-specimen__visual"
          />
          <figcaption><span>{String(index + 1).padStart(2, "0")}</span>{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function JourneyPortalInterlude({ variant = "wide", className = "" }: { variant?: "wide" | "compact" | "reel"; className?: string }) {
  const count = variant === "compact" ? 3 : variant === "reel" ? 8 : 5;
  return (
    <JourneyPortalProvider config={{ seed: variant === "reel" ? 0xD3A07E : 0x51A6A1, palette: variant === "compact" ? 4 : 1, intensity: .9, cadenceMs: 6_600 }}>
      <section className={`journey-interlude journey-interlude--${variant} ${className}`} aria-label="Live Forge Journey portal shapes">
        <PortalShapeGallery limit={count} />
      </section>
    </JourneyPortalProvider>
  );
}
