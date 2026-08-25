import { Helmet } from "react-helmet-async";
import { JourneyPortal, JourneyPortalProvider, normalizeJourneyPortalConfig, normalizeJourneyPortalShape } from "@/components/journey/JourneyPortal";
import "./journey-embed.css";

const finiteNumber = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  return value !== null && Number.isFinite(parsed) ? parsed : fallback;
};

export function parseJourneyEmbedConfig(search: string) {
  const params = new URLSearchParams(search);
  const config = normalizeJourneyPortalConfig({
    seed: finiteNumber(params.get("seed"), 0xE7A45A),
    palette: finiteNumber(params.get("palette"), 0),
    intensity: finiteNumber(params.get("intensity"), .82),
    cadenceMs: finiteNumber(params.get("cadence"), 7_200),
  });
  return {
    config,
    shape: normalizeJourneyPortalShape(params.get("shape")),
    label: params.get("label") !== "false",
    clipPath: params.get("clip") || undefined,
  };
}

const JourneyEmbed = () => {
  const portal = parseJourneyEmbedConfig(window.location.search);
  return (
    <main className="journey-embed-page">
      <Helmet>
        <title>Forge Journey Portal — MOSH</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <JourneyPortalProvider config={portal.config}>
        <JourneyPortal shape={portal.shape} label={portal.label} clipPath={portal.clipPath} className="journey-embed-page__portal" />
      </JourneyPortalProvider>
    </main>
  );
};

export default JourneyEmbed;
