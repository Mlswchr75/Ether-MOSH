import { useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Play, Pencil, Trash2, Star } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/store/useStore";

export default function Favorites() {
  const navigate = useNavigate();
  const favorites = useStore(s => s.favorites);
  const applyFavorite = useStore(s => s.applyFavorite);
  const removeFavorite = useStore(s => s.removeFavorite);
  const renameFavorite = useStore(s => s.renameFavorite);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const onApply = (id: string) => {
    if (applyFavorite(id)) navigate("/edit");
  };

  return (
    <>
      <Helmet>
        <title>Favorites · MOSH</title>
        <meta name="description" content="Your saved mosh effects — tap a thumbnail to reload it into the visualizer." />
        <link rel="canonical" href="https://ether-mosh.netlify.app/favorites" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="min-h-dvh bg-background text-foreground">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-background/80 px-4 py-3 backdrop-blur-md safe-top">
          <Link
            to="/edit"
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-[hsl(var(--accent))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            back to editor
          </Link>
          <h1 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.25em] text-[hsl(var(--accent))]">
            <Star className="h-3.5 w-3.5" strokeWidth={1.5} />
            favorites · {favorites.length}
          </h1>
          <div className="w-[112px]" />
        </header>

        <section className="mx-auto max-w-6xl px-4 py-6 safe-bottom">
          {favorites.length === 0 ? (
            <div className="mt-24 flex flex-col items-center gap-3 text-center">
              <Star className="h-8 w-8 text-white/20" strokeWidth={1.5} />
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                no favorites yet
              </p>
              <p className="max-w-xs font-mono text-[10px] leading-relaxed text-white/30">
                in the editor, tap the ★ hot-trigger (or press S) to save the current mosh.
              </p>
              <Link
                to="/edit"
                className="mt-4 rounded-full border border-white/15 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/70 hover:border-[hsl(var(--accent))] hover:text-[hsl(var(--accent))]"
              >
                open editor
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {favorites.map((f) => {
                const renaming = renameId === f.id;
                return (
                  <li
                    key={f.id}
                    className="group relative overflow-hidden rounded-md border border-white/10 bg-black/40 transition-colors hover:border-[hsl(var(--accent))]/60"
                  >
                    <button
                      type="button"
                      onClick={() => onApply(f.id)}
                      className="relative block aspect-square w-full overflow-hidden"
                      aria-label={`Apply ${f.name}`}
                      title={`${f.layers.length} layers · ${new Date(f.createdAt).toLocaleString()}`}
                    >
                      {f.thumb ? (
                        <img
                          src={f.thumb}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-black to-neutral-900">
                          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/25">
                            no preview
                          </span>
                        </div>
                      )}
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-6 w-6 text-white" strokeWidth={1.5} />
                      </span>
                      <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-sm bg-black/60 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-white/80">
                        {f.layers.length}L
                      </span>
                    </button>
                    <div className="flex items-center gap-1 border-t border-white/10 bg-black/60 px-2 py-1.5">
                      {renaming ? (
                        <input
                          autoFocus
                          value={renameVal}
                          onChange={(e) => setRenameVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { renameFavorite(f.id, renameVal); setRenameId(null); }
                            if (e.key === "Escape") setRenameId(null);
                          }}
                          onBlur={() => { renameFavorite(f.id, renameVal); setRenameId(null); }}
                          className="min-w-0 flex-1 rounded-sm border border-[hsl(var(--accent))]/40 bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white outline-none"
                        />
                      ) : (
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/80"
                          title={f.name}
                        >
                          {f.name}
                        </span>
                      )}
                      {!renaming && (
                        <>
                          <button
                            type="button"
                            onClick={() => { setRenameId(f.id); setRenameVal(f.name); }}
                            className="text-white/40 hover:text-white"
                            aria-label="rename"
                            title="rename"
                          >
                            <Pencil className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Delete "${f.name}"?`)) removeFavorite(f.id);
                            }}
                            className="text-white/40 hover:text-red-400"
                            aria-label="delete"
                            title="delete"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
