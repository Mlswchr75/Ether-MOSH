import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Library, Search, Star, Tag, Trash2, WandSparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  assetFromVaultRecord,
  listOverlayVault,
  removeOverlayAsset,
  saveOverlayAsset,
  updateOverlayVaultMeta,
  OVERLAY_VAULT_CHANGED_EVENT,
  type OverlayVaultRecord,
} from "@/engine/overlay/vault";
import { filterVaultRecords } from "@/engine/overlay/vaultSearch";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useStore } from "@/store/useStore";
import { segmentationEngine } from "@/engine/SegmentationEngine";
import { assetFromStickerSource, resolveStickerSource, withOptionalForgeIsolation } from "@/engine/overlay/stickerSource";

export function OverlayVault() {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<OverlayVaultRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const selectedId = useOverlayStore(s => s.selectedId);
  const selected = useOverlayStore(s => s.entities.find(entity => entity.id === selectedId) ?? null);
  const addAsset = useOverlayStore(s => s.addAsset);
  const sourceMode = useStore(s => s.sourceMode);
  const glCanvas = useStore(s => s.glCanvas);
  const forgeAvailable = sourceMode === "forge";

  const refresh = useCallback(async () => {
    try { setRecords(await listOverlayVault()); }
    catch (error) { console.warn("[overlay-vault] load failed", error); }
  }, []);
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  useEffect(() => {
    const changed = () => { if (open) void refresh(); };
    window.addEventListener(OVERLAY_VAULT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(OVERLAY_VAULT_CHANGED_EVENT, changed);
  }, [open, refresh]);

  const visibleRecords = useMemo(() => filterVaultRecords(records, query, favoritesOnly), [records, query, favoritesOnly]);
  const previews = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records) map.set(record.id, URL.createObjectURL(record.blob));
    return map;
  }, [records]);
  useEffect(() => () => { for (const url of previews.values()) URL.revokeObjectURL(url); }, [previews]);

  const saveSelected = async () => {
    if ((!selected && !forgeAvailable) || busy) return;
    setBusy(true);
    try {
      const liveCanvas = glCanvas ?? document.querySelector<HTMLCanvasElement>("canvas[data-mosh-canvas]");
      let resolved = resolveStickerSource({ selectedOverlay: selected, sourceMode, forgeCanvas: liveCanvas });
      if (!resolved) throw new Error("The Forge render is not ready yet.");
      resolved = await withOptionalForgeIsolation(resolved, async canvas => {
        await segmentationEngine.loadTap();
        if (!segmentationEngine.isTapReady()) return [];
        const points = segmentationEngine.analyzeSaliency(canvas, 3);
        return segmentationEngine.segmentMultiPoint(canvas, points);
      }, error => console.warn("[overlay-vault] subject isolation unavailable; saving complete Forge render", error));
      const prepared = await assetFromStickerSource(resolved);
      try { await saveOverlayAsset(prepared.asset, prepared.blob); }
      finally { prepared.revoke(); }
      toast.success("Sticker forged into the Vault");
      await refresh();
      setOpen(true);
    } catch (error) {
      console.error("[overlay-vault] save failed", error);
      toast.error(error instanceof Error ? `Couldn't save sticker: ${error.message}` : "Couldn't save that sticker to the Vault.");
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

  const downloadRecord = (record: OverlayVaultRecord) => {
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement("a");
    a.href = url;
    const ext = record.kind === "lottie-json" ? "json" : record.kind === "dotlottie" ? "lottie" : record.mimeType.includes("png") ? "png" : record.mimeType.includes("svg") ? "svg" : record.mimeType.includes("gif") ? "gif" : "webp";
    a.download = `${(record.name || "mosh-sticker").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}.${ext}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return <>
    <div className="pointer-events-auto flex flex-wrap items-center gap-1">
      <button type="button" disabled={(!selected && !forgeAvailable) || busy} onClick={() => void saveSelected()} className="flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-black/70 px-2.5 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-cyan-100 backdrop-blur-md transition hover:border-cyan-300/45 disabled:opacity-25" title={selected ? "Save the selected overlay as a reusable static sticker in the Vault" : forgeAvailable ? "Capture the current Forge render as a reusable static sticker in the Vault" : "Select an overlay or switch to Forge first"}><WandSparkles size={11} /> {busy ? "Saving…" : "Make Sticker"}</button>
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

      {records.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center font-mono text-[8px] uppercase tracking-[0.15em] text-white/30">Make Sticker saves a static reusable cutout. Forge Lottie creates an animated version.</div> : visibleRecords.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center font-mono text-[8px] uppercase text-white/30">No Vault items match that filter.</div> :
      <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {visibleRecords.map(record => {
          const lottie = record.kind === "lottie-json" || record.kind === "dotlottie";
          return <div key={record.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-1.5">
            <div className="relative aspect-square overflow-hidden rounded-lg bg-black/30">
              <button type="button" onClick={() => addAsset(assetFromVaultRecord(record))} className="h-full w-full p-1" title={`Place ${record.name}`}>
                {lottie ? <div className="flex h-full w-full items-center justify-center font-mono text-[7px] uppercase tracking-[0.12em] text-cyan-200/70">Lottie</div> : <img src={previews.get(record.id)} alt={record.name || "Vault sticker"} className="h-full w-full object-contain" />}
              </button>
              <button type="button" onClick={() => void updateMeta(record.id, { favorite: !record.favorite })} className={`absolute left-1 top-1 rounded-full bg-black/70 p-1 ${record.favorite ? "text-amber-200" : "text-white/35 hover:text-amber-200"}`} title="Favorite"><Star size={9} fill={record.favorite ? "currentColor" : "none"} /></button>
              <div className="absolute right-1 top-1 flex gap-1 opacity-75 transition sm:opacity-0 sm:group-hover:opacity-100">
                <button type="button" onClick={() => downloadRecord(record)} className="rounded-full bg-black/75 p-1 text-cyan-200/70 hover:text-cyan-100" title="Download"><Download size={9} /></button>
                <button type="button" onClick={() => void remove(record.id)} className="rounded-full bg-black/75 p-1 text-red-300/60 hover:text-red-200" title="Remove from Vault"><Trash2 size={9} /></button>
              </div>
            </div>
            <input defaultValue={record.name} onBlur={e => { if (e.target.value.trim() && e.target.value.trim() !== record.name) void updateMeta(record.id, { name: e.target.value }); }} className="mt-1 w-full rounded border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[7px] text-white/65 outline-none focus:border-cyan-300/30" aria-label="Vault sticker name" />
            <label className="mt-1 flex items-center gap-1 rounded border border-white/10 bg-black/30 px-1.5 py-1 text-white/30"><Tag size={8} /><input defaultValue={(record.tags ?? []).join(", ")} onBlur={e => void updateMeta(record.id, { tags: e.target.value.split(",") })} placeholder="tags" className="min-w-0 flex-1 bg-transparent font-mono text-[7px] text-white/50 outline-none placeholder:text-white/20" aria-label="Vault sticker tags" /></label>
          </div>;
        })}
      </div>}
    </div>}
  </>;
}
