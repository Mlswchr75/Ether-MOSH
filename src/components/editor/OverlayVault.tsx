import { useCallback, useEffect, useMemo, useState } from "react";
import { Library, Search, Star, Tag, Trash2, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  assetFromVaultRecord,
  listOverlayVault,
  removeOverlayAsset,
  saveOverlayAsset,
  updateOverlayVaultMeta,
  type OverlayVaultRecord,
} from "@/engine/overlay/vault";
import { filterVaultRecords } from "@/engine/overlay/vaultSearch";
import { useOverlayStore } from "@/store/useOverlayStore";

export function OverlayVault() {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<OverlayVaultRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const selectedId = useOverlayStore(s => s.selectedId);
  const selected = useOverlayStore(s => s.entities.find(entity => entity.id === selectedId) ?? null);
  const addAsset = useOverlayStore(s => s.addAsset);

  const refresh = useCallback(async () => {
    try { setRecords(await listOverlayVault()); }
    catch (error) { console.warn("[overlay-vault] load failed", error); }
  }, []);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const visibleRecords = useMemo(() => filterVaultRecords(records, query, favoritesOnly), [records, query, favoritesOnly]);
  const previews = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records) map.set(record.id, URL.createObjectURL(record.blob));
    return map;
  }, [records]);
  useEffect(() => () => { for (const url of previews.values()) URL.revokeObjectURL(url); }, [previews]);

  const saveSelected = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await saveOverlayAsset(selected.asset);
      toast.success("Sticker forged into the Vault");
      await refresh();
      setOpen(true);
    } catch (error) {
      console.error("[overlay-vault] save failed", error);
      toast.error("Couldn't forge that sticker into the Vault.");
    } finally { setBusy(false); }
  };

  const updateMeta = async (id: string, patch: { name?: string; favorite?: boolean; tags?: string[] }) => {
    try { await updateOverlayVaultMeta(id, patch); await refresh(); }
    catch (error) { console.error("[overlay-vault] metadata update failed", error); toast.error("Couldn't update that Vault item."); }
  };

  const remove = async (id: string) => {
    try { await removeOverlayAsset(id); await refresh(); }
    catch (error) { console.error("[overlay-vault] delete failed", error); toast.error("Couldn't remove that Vault item."); }
  };

  return <>
    <div className="pointer-events-auto flex items-center gap-1">
      <button type="button" disabled={!selected || busy} onClick={() => void saveSelected()} className="flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-black/70 px-2.5 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-cyan-100 backdrop-blur-md transition hover:border-cyan-300/45 disabled:opacity-25" title={selected ? "Save selected overlay as a reusable sticker" : "Select an overlay first"}><WandSparkles size={11} /> Make Sticker</button>
      <button type="button" onClick={() => setOpen(value => !value)} className={`flex items-center gap-1.5 rounded-full border bg-black/70 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] backdrop-blur-md transition ${open ? "border-cyan-300/40 text-cyan-200" : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"}`} title="Sticker Vault"><Library size={12} /> Vault</button>
    </div>

    {open && <div className="pointer-events-auto absolute bottom-12 left-1/2 z-[100] w-[min(94vw,38rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/90 p-3 shadow-2xl backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200">Sticker Vault</p><p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-white/35">persistent reusable overlay library</p></div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X size={12} /></button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label className="flex flex-1 items-center gap-1 rounded-full border border-white/10 bg-black/50 px-2 py-1.5 text-white/50"><Search size={10} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names or tags" className="min-w-24 flex-1 bg-transparent font-mono text-[8px] text-white outline-none placeholder:text-white/25" /></label>
        <button type="button" onClick={() => setFavoritesOnly(v => !v)} className={`flex items-center gap-1 rounded-full border px-2 py-1.5 font-mono text-[8px] uppercase ${favoritesOnly ? "border-amber-300/40 text-amber-200" : "border-white/10 text-white/45"}`}><Star size={9} fill={favoritesOnly ? "currentColor" : "none"} /> Favorites</button>
      </div>

      {records.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center font-mono text-[8px] uppercase tracking-[0.15em] text-white/30">Select an overlay and tap Make Sticker.</div> : visibleRecords.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center font-mono text-[8px] uppercase text-white/30">No Vault items match that filter.</div> :
      <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {visibleRecords.map(record => {
          const lottie = record.kind === "lottie-json" || record.kind === "dotlottie";
          return <div key={record.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-black/30">
              <button type="button" onClick={() => addAsset(assetFromVaultRecord(record))} className="h-full w-full p-1" title={`Place ${record.name}`}>
                {lottie ? <div className="flex h-full w-full items-center justify-center font-mono text-[7px] uppercase tracking-[0.12em] text-cyan-200/70">Lottie</div> : <img src={previews.get(record.id)} alt={record.name || "Vault sticker"} className="h-full w-full object-contain" />}
              </button>
              <button type="button" onClick={() => void updateMeta(record.id, { favorite: !record.favorite })} className={`absolute left-1 top-1 rounded-full bg-black/70 p-1 ${record.favorite ? "text-amber-200" : "text-white/35 hover:text-amber-200"}`} title="Favorite"><Star size={9} fill={record.favorite ? "currentColor" : "none"} /></button>
              <button type="button" onClick={() => void remove(record.id)} className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-red-300/60 opacity-70 transition hover:text-red-200 sm:opacity-0 sm:group-hover:opacity-100" title="Remove from Vault"><Trash2 size={9} /></button>
            </div>
            <input defaultValue={record.name} onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== record.name) void updateMeta(record.id, { name: e.target.value }); }} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[7px] text-white/65 outline-none focus:border-cyan-300/30" aria-label="Vault sticker name" />
            <label className="mt-1 flex items-center gap-1 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white/30"><Tag size={8} /><input defaultValue={(record.tags ?? []).join(", ")} onBlur={e => void updateMeta(record.id, { tags: e.target.value.split(",") })} placeholder="tags" className="min-w-0 flex-1 bg-transparent font-mono text-[7px] text-white/50 outline-none placeholder:text-white/20" aria-label="Vault sticker tags" /></label>
          </div>;
        })}
      </div>}
    </div>}
  </>;
}
