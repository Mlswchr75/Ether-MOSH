import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, ArrowUpRight, Download, FileJson, Search, X } from "lucide-react";
import { EffectSpecimen } from "@/components/effects/EffectSpecimen";
import { getEffectRegistry, effectRegistryToCSV, effectRegistryToJSON } from "@/engine/effectRegistry";
import { downloadBlob } from "@/engine/export";
import "./effects-registry.css";

const CATEGORY_LABEL: Record<string, string> = {
  corruption: "Data Corruption",
  color: "Color",
  geometry: "Geometry",
  atmosphere: "Atmosphere",
  dimension: "Dimension",
};

export default function EffectsRegistry() {
  const registry = useMemo(() => getEffectRegistry(), []);
  const registryIndex = useMemo(() => new Map(registry.map((effect, index) => [effect.id, index + 1])), [registry]);
  const [q, setQ] = useState("");
  const deferredQuery = useDeferredValue(q);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const selected = useMemo(() => registry.find(effect => effect.id === selectedId) ?? null, [registry, selectedId]);

  const filtered = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) return registry;
    return registry.filter(effect =>
      effect.name.toLowerCase().includes(query) ||
      effect.id.toLowerCase().includes(query) ||
      effect.category.toLowerCase().includes(query) ||
      effect.blurb.toLowerCase().includes(query),
    );
  }, [registry, deferredQuery]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const effect of filtered) {
      const list = map.get(effect.category) ?? [];
      list.push(effect);
      map.set(effect.category, list);
    }
    return map;
  }, [filtered]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(() => openerRef.current?.focus());
    else openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected, closeDetail]);

  const exportCSV = () => {
    const csv = effectRegistryToCSV(registry);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "mosh-effects-registry.csv");
  };

  const exportJSON = () => {
    const json = effectRegistryToJSON(registry);
    downloadBlob(new Blob([json], { type: "application/json" }), "mosh-effects-registry.json");
  };

  const structuredData = useMemo(() => JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Ether-MOSH Effect Registry",
    description: "Every Ether-MOSH GPU effect with its description, parameters, and GLSL source.",
    url: "https://ether-mosh.online/effects",
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: registry.length,
      itemListElement: registry.map((effect, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `https://ether-mosh.online/effects#${effect.id}`,
        name: effect.name,
        description: effect.blurb,
      })),
    },
  }), [registry]);

  return (
    <>
      <Helmet>
        <title>108 GPU Glitch Effects · Ether-MOSH Effect Registry</title>
        <meta name="description" content="Explore all 108 Ether-MOSH effects with visual examples, plain-language descriptions, parameter ranges, and the GLSL source that runs each effect." />
        <meta name="keywords" content="glitch effects, GPU effects, GLSL shaders, pixel sorting, datamosh, halftone, moire, audio reactive visuals, Ether-MOSH" />
        <link rel="canonical" href="https://ether-mosh.online/effects" />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <meta property="og:title" content="108 GPU Glitch Effects · Ether-MOSH" />
        <meta property="og:description" content="A visual, searchable registry of every Ether-MOSH effect, parameter, and shader." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://ether-mosh.online/effects" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{structuredData}</script>
      </Helmet>

      <main className="effect-registry-page">
        <header className="effect-registry-header">
          <Link to="/edit" className="effect-registry-nav-link effect-registry-back">
            <ArrowLeft aria-hidden="true" /> back
          </Link>
          <div className="effect-registry-mark" aria-hidden="true">MOSH</div>
          <h1>Effect Registry <span>· {registry.length}</span></h1>
          <label className="effect-registry-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search effects</span>
            <input value={q} onChange={event => setQ(event.target.value)} placeholder="search effects…" aria-label="Search effects" />
          </label>
          <button type="button" onClick={exportCSV} title="Export every effect as a spreadsheet (CSV) — name, blurb, params, GLSL">
            <Download aria-hidden="true" /> csv
          </button>
          <button type="button" onClick={exportJSON} title="Export every effect as machine-readable JSON — structured params + GLSL source">
            <FileJson aria-hidden="true" /> json
          </button>
          <Link to="/news" className="effect-registry-nav-link">news + updates <ArrowUpRight aria-hidden="true" /></Link>
          <Link to="/edit" className="effect-registry-open">open MOSH <ArrowUpRight aria-hidden="true" /></Link>
        </header>

        <section className="effect-registry-intro" aria-labelledby="registry-intro-title">
          <p className="effect-registry-eyebrow">Visual field guide / live shader index / downloadable source</p>
          <h2 id="registry-intro-title">Every effect, exposed.</h2>
          <p>
            Every effect Ether-MOSH can render, in two languages at once: a human blurb + parameter ranges,
            and the GLSL fragment shader that actually produces it — the same code the GPU runs, so it
            doubles as the exact recipe for recreating the effect later. Export the whole registry as a
            spreadsheet or JSON below.
          </p>
          <span className="effect-registry-result" aria-live="polite">{filtered.length} / {registry.length} effects visible</span>
        </section>

        <section className="effect-registry-list" aria-label="Ether-MOSH effects">
          {[...grouped.entries()].map(([category, effects]) => (
            <section key={category} className="effect-registry-category" aria-labelledby={`category-${category}`}>
              <h2 id={`category-${category}`}>
                <span>{CATEGORY_LABEL[category] ?? category}</span>
                <i>{String(effects.length).padStart(2, "0")} effects</i>
              </h2>
              <ul>
                {effects.map(effect => {
                  const effectNumber = registryIndex.get(effect.id) ?? 0;
                  return (
                    <li key={effect.id} id={effect.id}>
                      <button
                        type="button"
                        onClick={event => {
                          openerRef.current = event.currentTarget;
                          setSelectedId(effect.id);
                        }}
                        aria-haspopup="dialog"
                        aria-label={`Open ${effect.name} visual example and details`}
                      >
                        <span className="effect-registry-number">{String(effectNumber).padStart(3, "0")}</span>
                        <span className="effect-registry-thumb"><EffectSpecimen effect={effect} /></span>
                        <span className="effect-registry-summary">
                          <span className="effect-registry-name" data-text={effect.name}>{effect.name}</span>
                          <span className="effect-registry-id">{effect.id}</span>
                          <span className="effect-registry-blurb">{effect.blurb}</span>
                        </span>
                        <span className="effect-registry-count">{effect.params.length} param{effect.params.length === 1 ? "" : "s"}<ArrowUpRight aria-hidden="true" /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="effect-registry-empty">
              <p>No effect matches “{deferredQuery}”.</p>
              <button type="button" onClick={() => setQ("")}>clear search</button>
            </div>
          )}
        </section>

        <footer className="effect-registry-footer">
          <span>108 effects / 5 categories / one GPU</span>
          <Link to="/news">Learn the effects in News + Updates <ArrowUpRight aria-hidden="true" /></Link>
        </footer>
      </main>

      {selected && (
        <div className="effect-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeDetail(); }}>
          <section className="effect-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="effect-detail-title" aria-describedby="effect-detail-description">
            <header>
              <span>Effect detail / {String(registryIndex.get(selected.id) ?? 0).padStart(3, "0")}</span>
              <button type="button" onClick={closeDetail} autoFocus aria-label="Close effect details"><X aria-hidden="true" /></button>
            </header>

            <div className="effect-detail-layout">
              <div className="effect-detail-visual">
                <EffectSpecimen effect={selected} large />
                <span>Code-native visual signature / {selected.category}</span>
              </div>

              <div className="effect-detail-copy">
                <p className="effect-detail-id">{selected.id}</p>
                <h2 id="effect-detail-title" className="effect-registry-name" data-text={selected.name}>{selected.name}</h2>
                <p id="effect-detail-description">{selected.blurb}</p>

                <h3>Parameters</h3>
                <div className="effect-detail-table-wrap">
                  <table>
                    <thead><tr><th>param</th><th>range</th><th>default</th></tr></thead>
                    <tbody>
                      {selected.params.map(param => (
                        <tr key={param.key}><td>{param.label}</td><td>{param.min}..{param.max}</td><td>{param.default}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3>GLSL source</h3>
                <pre><code>{selected.glsl}</code></pre>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
