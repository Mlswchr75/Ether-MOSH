import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowUpDown, Download, Trash2, Eye, RefreshCw } from "lucide-react";
import { getOwnerToken } from "@/lib/forgeOwner";

type Row = {
  id: string;
  filename: string;
  storage_path: string;
  uploaded_at: string;
  analysis: Record<string, any>;
  status: string;
  error: string | null;
  outputs_count: number;
};

type SortKey = "uploaded_at" | "filename" | "status" | "outputs_count";

export function HistoryTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("uploaded_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewingJson, setViewingJson] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const ownerToken = getOwnerToken();
    const { data, error } = await supabase.rpc("list_my_forge_uploads", {
      p_token: ownerToken,
    });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data || []) as Row[]);
    }
    setLoading(false);
  };


  useEffect(() => {
    void load();
  }, []);

  const sorted = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? rows.filter((r) => {
          const blob = JSON.stringify({
            n: r.filename,
            s: r.status,
            a: r.analysis,
          }).toLowerCase();
          return blob.includes(f);
        })
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, filter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const handleDelete = async (row: Row) => {
    if (!confirm(`Delete ${row.filename}?`)) return;
    const ownerToken = getOwnerToken();
    const { data, error } = await supabase.functions.invoke("forge-delete", {
      body: { rowId: row.id, ownerToken },
    });
    if (error || data?.error) {
      toast.error(error?.message || data?.error || "Delete failed");
    } else {
      toast.success("Deleted");
      setRows((r) => r.filter((x) => x.id !== row.id));
    }
  };

  const exportCsv = () => {
    if (!sorted.length) {
      toast.error("Nothing to export");
      return;
    }
    const csv = toCsv(sorted);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pattern-forge-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRow = (row: Row) => {
    const csv = toCsv([row]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.filename.replace(/\.[^.]+$/, "")}-analysis.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sans text-2xl font-bold tracking-tight">History</h2>
          <p className="mt-1 text-sm text-foreground/60">
            Every upload's semantic analysis, sortable and exportable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-md border border-border/40 bg-card/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70 transition hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            refresh
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary transition hover:bg-primary/20"
          >
            <Download className="h-3 w-3" />
            export log csv
          </button>
        </div>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="filter by filename, subject, style, palette…"
        className="w-full rounded-md border border-border/40 bg-card/40 px-3 py-2 font-mono text-xs text-foreground placeholder:text-foreground/30 focus:border-primary/50 focus:outline-hidden"
      />

      {loading ? (
        <div className="rounded-lg border border-border/40 bg-card/30 p-8 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/40">
          loading…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-border/40 bg-card/30 p-8 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/40">
          {rows.length === 0 ? "no uploads yet" : "no matches"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-xs">
            <thead className="bg-card/50 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/60">
              <tr>
                <th className="px-3 py-2 text-left">thumb</th>
                <SortHead label="filename" k="filename" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHead label="uploaded" k="uploaded_at" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2 text-left">subjects</th>
                <th className="px-3 py-2 text-left">palette</th>
                <th className="px-3 py-2 text-left">style</th>
                <th className="px-3 py-2 text-left">shape mix</th>
                <SortHead label="status" k="status" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHead label="outputs" k="outputs_count" sortKey={sortKey} dir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2 text-right">actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-border/30 align-top">
                  <td className="px-3 py-2">
                    <img
                      src={publicUrl(r.storage_path)}
                      alt=""
                      className="h-12 w-12 rounded object-cover"
                      loading="lazy"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground/80">{r.filename}</td>
                  <td className="px-3 py-2 text-foreground/60">
                    {new Date(r.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-foreground/70">
                    {Array.isArray(r.analysis?.subjects) ? r.analysis.subjects.slice(0, 4).join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {Array.isArray(r.analysis?.palette)
                        ? r.analysis.palette.slice(0, 6).map((p: any, i: number) => (
                            <span
                              key={i}
                              title={`${p.name ?? ""} ${p.hex}`}
                              className="block h-4 w-4 rounded border border-border/40"
                              style={{ background: p.hex }}
                            />
                          ))
                        : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-foreground/70">
                    {Array.isArray(r.analysis?.style_tags) ? r.analysis.style_tags.slice(0, 3).join(", ") : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-foreground/60">
                    {r.analysis?.shape_mix ? shapeMixLabel(r.analysis.shape_mix) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-foreground/70">{r.outputs_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <IconBtn title="View JSON" onClick={() => setViewingJson(r)}>
                        <Eye className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Export row CSV" onClick={() => exportRow(r)}>
                        <Download className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => handleDelete(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewingJson && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur"
          onClick={() => setViewingJson(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-border/40 bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/70">
                {viewingJson.filename}
              </div>
              <button
                onClick={() => setViewingJson(null)}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/50 hover:text-foreground"
              >
                close
              </button>
            </div>
            <pre className="max-h-[70vh] overflow-auto bg-background/40 p-4 text-[11px] leading-relaxed text-foreground/80">
              {JSON.stringify(viewingJson.analysis, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHead({
  label,
  k,
  sortKey,
  dir,
  onClick,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-3 py-2 text-left">
      <button
        onClick={() => onClick(k)}
        className={`flex items-center gap-1 ${active ? "text-primary" : ""}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active && dir === "asc" ? "rotate-180" : ""}`} />
      </button>
    </th>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-1.5 text-foreground/60 transition hover:bg-card hover:text-foreground"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "complete"
      ? "border-primary/40 bg-primary/10 text-primary"
      : status === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border/40 bg-card/40 text-foreground/60";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] ${tone}`}
    >
      {status}
    </span>
  );
}

function shapeMixLabel(m: Record<string, number>) {
  return Object.entries(m)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 2)
    .map(([k, v]) => `${k[0]}:${Math.round((v as number) * 100)}`)
    .join(" ");
}

function publicUrl(path: string) {
  return supabase.storage.from("forge-uploads").getPublicUrl(path).data.publicUrl;
}

const CSV_COLS = [
  "id",
  "filename",
  "storage_path",
  "uploaded_at",
  "status",
  "outputs_count",
  "subjects",
  "style_tags",
  "mood",
  "palette",
  "shape_mix",
  "composition_density",
  "composition_symmetry",
  "composition_focal_point",
  "texture_grain",
  "texture_edges",
  "texture_detail_level",
  "recommended_effects",
  "tileability_notes",
  "error",
];

function toCsv(rows: Row[]) {
  const header = CSV_COLS.join(",");
  const lines = rows.map((r) => {
    const a = r.analysis || {};
    const flat: Record<string, unknown> = {
      id: r.id,
      filename: r.filename,
      storage_path: r.storage_path,
      uploaded_at: r.uploaded_at,
      status: r.status,
      outputs_count: r.outputs_count,
      subjects: (a.subjects || []).join("|"),
      style_tags: (a.style_tags || []).join("|"),
      mood: (a.mood || []).join("|"),
      palette: (a.palette || []).map((p: any) => `${p.hex}@${p.weight}`).join("|"),
      shape_mix: a.shape_mix ? JSON.stringify(a.shape_mix) : "",
      composition_density: a.composition?.density ?? "",
      composition_symmetry: a.composition?.symmetry ?? "",
      composition_focal_point: a.composition?.focal_point ?? "",
      texture_grain: a.texture?.grain ?? "",
      texture_edges: a.texture?.edges ?? "",
      texture_detail_level: a.texture?.detail_level ?? "",
      recommended_effects: (a.recommended_effects || []).join("|"),
      tileability_notes: a.tileability_notes ?? "",
      error: r.error ?? "",
    };
    return CSV_COLS.map((c) => csvEscape(flat[c])).join(",");
  });
  return [header, ...lines].join("\n");
}

function csvEscape(v: unknown) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
