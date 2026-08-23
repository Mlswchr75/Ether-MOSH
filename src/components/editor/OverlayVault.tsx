import { useCallback, useEffect, useMemo, useState } from "react";
import { Library, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  assetFromVaultRecord,
  listOverlayVault,
  removeOverlayAsset,
  saveOverlayAsset,
  type OverlayVaultRecord,
} from "@/engine/overlay/vault";
import { useOverlayStore } from "@/store/useOverlayStore";

export function OverlayVault() {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<OverlayVaultRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const selectedId = useOverlayStore(s => s.selectedId);
  const selected = useOverlayStore(s => s.entities.find(entity => entity.id === selectedId) ?? null);
  const addAsset = useOverlayStore(s => s.addAsset);

  const refresh = useCallback(async () => {
    try { setRecords(await listOverlayVault()); }
    catch (error) { console.warn("[overlay-vault] load failed", error); }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const previews = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of records) map.set(record.id, URL.createObjectURL(record.blob));
    return map;
  }, [records]);

  useEffect(() => () => {
    for (const url of previews.values()) URL.revokeObjectURL(url);
  }, [previews]);

  const saveSelected = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await saveOverlayAsset(selected.asset);
      toast.success("Saved to Sticker Vault");
      await refresh();
      setOpen(true);
    } catch (error) {
      console.error("[overlay-vault] save failed", error);
      toast.error("Couldn't save that sticker to the Vault.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await removeOverlayAsset(id);
      await refresh();
    } catch (error) {
      console.error("[overlay-vault] delete failed", error);
      toast.error("Couldn't remove that Vault item.");
    }
  };

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => void saveSelected()}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white/60 backdrop-blur-md transition hover:border-cyan-300/40 hover:text-cyan-200 disabled:opacity-25"
          title={selected ? "Save selected sticker to Vault" : "Select a sticker to save"}
        ><Star size={12} /></button>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className={`flex items-center gap-1.5 rounded-full border bg-black/70 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] backdrop-blur-md transition ${open ? "border-cyan-300/40 text-cyan-200" : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"}`}
          title="Sticker Vault"
        ><Library size={12} /> Vault</button>
      </div>

      {open && (
        <div className="pointer-events-auto absolute bottom-12 left-1/2 z-[100] w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-black/90 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-200">Sticker Vault</p>
              <p className="mt-0.5 font-mono text-[7px] uppercase tracking-[0.12em] text-white/35">persistent across projects on this device</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-white/45 hover:bg-white/10 hover:text-white"><X size={12} /></button>
          </div>

          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center font-mono text-[8px] uppercase tracking-[0.15em] text-white/30">
              Select a sticker and tap ★ to save it here.
            </div>
          ) : (
            <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              {records.map(record => {
                const lottie = record.kind === "lottie-json" || record.kind === "dotlottie";
                return (
                  <div key={record.id} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                    <button
                      type="button"
                      onClick={() => addAsset(assetFromVaultRecord(record))}
                      className="h-full w-full p-1"
                      title={`Place ${record.name}`}
                    >
                      {lottie ? (
                        <div className="flex h-full w-full items-center justify-center rounded-lg bg-black/40 font-mono text-[7px] uppercase tracking-[0.12em] text-cyan-200/70">Lottie</div>
                      ) : (
                        <img src={previews.get(record.id)} alt={record.name || "Vault sticker"} className="h-full w-full object-contain" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(record.id)}
                      className="absolute right-1 top-1 rounded-full bg-black/75 p-1 text-red-300/60 opacity-0 transition hover:text-red-200 group-hover:opacity-100 group-focus-within:opacity-100"
                      title="Remove from Vault"
                    ><Trash2 size={9} /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
