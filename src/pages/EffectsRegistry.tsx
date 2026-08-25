import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Download, FileJson, Search } from "lucide-react";
import { getEffectRegistry, effectRegistryToCSV, effectRegistryToJSON } from "@/engine/effectRegistry";
import { downloadBlob } from "@/engine/export";

const CATEGORY_LABEL: Record<string, string> = {
  corruption: "Data Corruption",
  color: "Color",
  geometry: "Geometry",
  atmosphere: "Atmosphere",
  dimension: "Dimension",
};

export default function EffectsRegistry() {
  const registry = useMemo(() => getEffectRegistry(), []);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return registry;
    return registry.filter(e =>
      e.name.toLowerCase().includes(query) ||
      e.id.toLowerCase().includes(query) ||
      e.category.toLowerCase().includes(query) ||
      e.blurb.toLowerCase().includes(query),
    );
  }, [registry, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return map;
  }, [filtered]);

  const exportCSV = () => {
    const csv = effectRegistryToCSV(registry);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `mosh-effects-registry.csv`);
  };

  const exportJSON = () => {
    const json = effectRegistryToJSON(registry);
    downloadBlob(new Blob([json], { type: "application/json" }), `mosh-effects-registry.json`);
  };

  return (
    <>
      <Helmet>
        <title>Effect Registry · Ether-MOSH</title>
        <meta name="description" content="Every Ether-MOSH effect — human description, parameters, and GLSL source — exportable as a spreadsheet or JSON." />
        <link rel="canonical" href="https://ether-mosh.online/effects" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="min-h-dvh bg-background text-foreground">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-background/80 px-4 py-3 backdrop-blur-md safe-top">
          <Link
            to="/edit"
            className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-[hsl(var(--accent))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            back
          </Link>
          <h1 className="sr-only shrink-0 font-mono text-[11px] uppercase tracking-[0.25em] text-[hsl(var(--accent))] sm:not-sr-only">
            effect registry · {registry.length}
          </h1>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm border border-white/10 bg-black/40 px-2 py-1">
              <Search className="h-3 w-3 shrink-0 text-white/40" strokeWidth={1.5} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="search effects…"
                aria-label="Search effects"
                className="min-w-0 flex-1 bg-transparent font-mono text-[10px] uppercase tracking-[0.1em] text-white/80 outline-none placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={exportCSV}
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/50 hover:text-[hsl(var(--accent))]"
              title="Export every effect as a spreadsheet (CSV) — name, blurb, params, GLSL"
            >
              <Download className="h-3 w-3" strokeWidth={1.5} />
              csv
            </button>
            <button
              type="button"
              onClick={exportJSON}
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.15em] text-white/50 hover:text-[hsl(var(--accent))]"
              title="Export every effect as machine-readable JSON — structured params + GLSL source"
            >
              <FileJson className="h-3 w-3" strokeWidth={1.5} />
              json
            </button>
          </div>
        </header>

        <section className="mx-auto max-w-4xl px-4 py-6 safe-bottom">
          <p className="mb-6 max-w-2xl font-mono text-[10px] leading-relaxed text-white/40">
            Every effect Ether-MOSH can render, in two languages at once: a human blurb + parameter ranges,
            and the GLSL fragment shader that actually produces it — the same code the GPU runs, so it
            doubles as the exact recipe for recreating the effect later. Export the whole registry as a
            spreadsheet or JSON below.
          </p>

          {[...grouped.entries()].map(([category, effects]) => (
            <div key={category} className="mb-8">
              <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--accent))]">
                {CATEGORY_LABEL[category] ?? category} · {effects.length}
              </h2>
              <ul className="flex flex-col gap-1">
                {effects.map(e => {
                  const isOpen = expanded === e.id;
                  return (
                    <li key={e.id} className="rounded-md border border-white/10 bg-black/30">
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        aria-expanded={isOpen}
                        aria-controls={`effect-detail-${e.id}`}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                      >
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-white/90">
                              {e.name}
                            </span>
                            <span className="font-mono text-[9px] text-white/30">{e.id}</span>
                          </div>
                          <p className="mt-0.5 truncate font-mono text-[9px] text-white/45">{e.blurb}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-white/30">
                          {e.params.length} param{e.params.length === 1 ? "" : "s"}
                        </span>
                      </button>
                      {isOpen && (
                        <div id={`effect-detail-${e.id}`} className="border-t border-white/10 px-3 py-2">
                          <table className="mb-3 w-full text-left font-mono text-[9px]">
                            <thead>
                              <tr className="text-white/40">
                                <th className="pb-1 pr-3 font-normal uppercase tracking-[0.1em]">param</th>
                                <th className="pb-1 pr-3 font-normal uppercase tracking-[0.1em]">range</th>
                                <th className="pb-1 font-normal uppercase tracking-[0.1em]">default</th>
                              </tr>
                            </thead>
                            <tbody>
                              {e.params.map(p => (
                                <tr key={p.key} className="text-white/70">
                                  <td className="py-0.5 pr-3">{p.label}</td>
                                  <td className="py-0.5 pr-3 text-white/45">{p.min}..{p.max}</td>
                                  <td className="py-0.5">{p.default}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.15em] text-white/30">
                            glsl source
                          </p>
                          <pre className="max-h-64 overflow-auto rounded-sm bg-black/60 p-2 font-mono text-[9px] leading-relaxed text-white/60">
                            {e.glsl}
                          </pre>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
