import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Hammer,
  History as HistoryIcon,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { HistoryTab } from "@/components/forge/HistoryTab";
import { getOwnerToken } from "@/lib/forgeOwner";


type Tab = "forge" | "history";
type Status = "idle" | "uploading" | "analyzing" | "complete" | "failed";

const PatternForge = () => {
  const [tab, setTab] = useState<Tab>("forge");

  return (
    <main className="min-h-screen w-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/80 px-5 py-3 backdrop-blur">
        <Link
          to="/"
          className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-foreground/70 transition hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back
        </Link>
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-foreground/80">
          <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
          pattern forge
        </div>
        <div className="w-10" />
      </header>

      <nav className="flex border-b border-border/40">
        {([
          { id: "forge", label: "Forge", icon: Hammer },
          { id: "history", label: "History", icon: HistoryIcon },
        ] as const).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] transition ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-foreground/50 hover:text-foreground/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </nav>

      <section className="mx-auto max-w-5xl px-5 py-10">
        {tab === "forge" ? <ForgeTab /> : <HistoryTab />}
      </section>
    </main>
  );
};

function ForgeTab() {
  const [status, setStatus] = useState<Status>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(true);
  const [copiedJson, setCopiedJson] = useState(false);
  const [analysisVisible, setAnalysisVisible] = useState(true);
  const analysisIdleTimer = useRef<number | null>(null);

  const resetAnalysisTimer = () => {
    setAnalysisVisible(true);
    if (analysisIdleTimer.current) window.clearTimeout(analysisIdleTimer.current);
    analysisIdleTimer.current = window.setTimeout(() => setAnalysisVisible(false), 1500);
  };

  useEffect(() => {
    if (analysis) resetAnalysisTimer();
    return () => {
      if (analysisIdleTimer.current) window.clearTimeout(analysisIdleTimer.current);
    };
  }, [analysis]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("File must be an image");
      return;
    }
    // Block SVG — can execute scripts when opened directly from the CDN URL.
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      toast.error("SVG files are not allowed");
      return;
    }
    setAnalysis(null);
    setErrorMsg(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus("uploading");

    try {
      const ownerToken = getOwnerToken();
      const ext = file.name.split(".").pop() || "png";
      const path = `${ownerToken}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("forge-uploads")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const rowId = crypto.randomUUID();
      const { error: insErr } = await supabase
        .from("pattern_forge_uploads")
        .insert({
          id: rowId,
          filename: file.name,
          storage_path: path,
          status: "analyzing",
          owner_token: ownerToken,
        });
      if (insErr) throw insErr;


      setStatus("analyzing");

      const { data: fnData, error: fnErr } = await supabase.functions.invoke("forge-analyze", {
        body: { rowId, ownerToken },
      });

      if (fnErr) throw fnErr;
      if (fnData?.error) throw new Error(fnData.error);

      setAnalysis(fnData.analysis);
      setStatus("complete");
      toast.success("Analysis complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setErrorMsg(msg);
      setStatus("failed");
      toast.error(msg);
    }
  }, []);

  const copyAnalysisJson = useCallback(async () => {
    if (!analysis) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(analysis, null, 2));
      setCopiedJson(true);
      toast.success("Analysis JSON copied");
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  }, [analysis]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-4xl font-bold tracking-tight">Pattern Forge</h1>
        <p className="mt-2 max-w-2xl text-sm text-foreground/60">
          Upload source artwork to run a deep semantic analysis. The result feeds the seamless
          tiling and isolated-edge generators in the next blocks.
        </p>
      </div>

      <label
        htmlFor="forge-file"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="block cursor-pointer rounded-lg border-2 border-dashed border-border/50 bg-card/30 p-10 text-center transition hover:border-primary/50 hover:bg-card/50"
      >
        <input
          id="forge-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Upload className="mx-auto h-8 w-8 text-foreground/40" />
        <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-foreground/60">
          drop image or click to browse
        </div>
        <p className="mt-2 text-xs text-foreground/40">PNG, JPG, WEBP — anything raster</p>
      </label>

      <StatusBar status={status} errorMsg={errorMsg} />

      {previewUrl && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
          <div>
            <div className="overflow-hidden rounded-lg border border-border/40">
              <img src={previewUrl} alt="upload preview" className="block w-full" />
            </div>
          </div>
          <div className="min-w-0">
            {analysis && (
              <div
                onPointerMove={resetAnalysisTimer}
                onPointerEnter={resetAnalysisTimer}
                className={`transition-opacity duration-500 ${analysisVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              >
                <div className="rounded-lg border border-border/40 bg-card/30">
                  <div className="flex items-center justify-between px-4 py-3">
                    <button
                      onClick={() => setShowJson((s) => !s)}
                      className="flex flex-1 items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/70"
                    >
                      analysis json
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${showJson ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      onClick={copyAnalysisJson}
                      disabled={!analysis}
                      title="Copy analysis JSON"
                      className="ml-3 rounded p-1.5 text-foreground/50 transition hover:bg-card hover:text-foreground disabled:opacity-30"
                    >
                      {copiedJson ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  {showJson && (
                    <pre className="max-h-[480px] overflow-auto border-t border-border/40 bg-background/50 p-4 text-[11px] leading-relaxed text-foreground/80">
                      {JSON.stringify(analysis, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBar({ status, errorMsg }: { status: Status; errorMsg: string | null }) {
  if (status === "idle") return null;
  const map = {
    uploading: { icon: Loader2, label: "uploading…", spin: true, tone: "text-foreground/70" },
    analyzing: { icon: Loader2, label: "analyzing artwork…", spin: true, tone: "text-primary" },
    complete: { icon: CheckCircle2, label: "complete", spin: false, tone: "text-primary" },
    failed: { icon: AlertCircle, label: errorMsg || "failed", spin: false, tone: "text-destructive" },
  } as const;
  const { icon: Icon, label, spin, tone } = map[status];
  return (
    <div className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] ${tone}`}>
      <Icon className={`h-3.5 w-3.5 ${spin ? "animate-spin" : ""}`} />
      {label}
    </div>
  );
}


export default PatternForge;
