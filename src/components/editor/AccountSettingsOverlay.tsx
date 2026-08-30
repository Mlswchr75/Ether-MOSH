import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles, HelpCircle, EyeOff, Gauge } from "lucide-react";
import { useStore } from "@/store/useStore";
import { ExportSettingsPanel } from "./ExportSettingsPanel";
import { AccountCrystalIcon } from "./HotTriggerIcons";
import { cursorFx } from "@/engine/cursorFx";

/** Viewport-normalized UV for a client point — see the identical helper in
 *  HotTriggers.tsx for why this is an approximation, not a precise readout;
 *  duplicated rather than imported to keep this overlay a standalone unit
 *  that doesn't reach back into the wheel's own internals for a six-line
 *  helper. */
function clientToViewportUv(clientX: number, clientY: number) {
  return {
    x: Math.min(1, Math.max(0, clientX / Math.max(1, window.innerWidth))),
    y: Math.min(1, Math.max(0, 1 - clientY / Math.max(1, window.innerHeight))),
  };
}

type Tab = "general" | "export";

/**
 * The consolidated settings surface — a large, semi-transparent overlay
 * opened from the wheel's "account" trigger, replacing what used to be an
 * immediate navigation away to a full account page. Everything that used to
 * be its own separate hot trigger and has no real business being one FX
 * click away (Pro Mode, sensitivity, export settings, the supporter nudge)
 * now lives here instead; the actual account page is still one click away
 * via "My Account", for anything that genuinely needs its own page (sign-in,
 * subscription management).
 */
export function AccountSettingsOverlay({
  open, onClose, onMyAccount, onSupport, initialTab = "general",
}: {
  open: boolean;
  onClose: () => void;
  onMyAccount: () => void;
  onSupport?: () => void;
  /** Which tab to land on the next time this opens — e.g. the "export
   *  started" toast (fired by any export path, anywhere in the app) jumps
   *  straight to "export" instead of making the user click there themselves. */
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const proModeEnabled = useStore(s => s.proModeEnabled);
  const setProModeEnabled = useStore(s => s.setProModeEnabled);
  const helpModeEnabled = useStore(s => s.helpModeEnabled);
  const setHelpModeEnabled = useStore(s => s.setHelpModeEnabled);
  const sensitivity = useStore(s => s.sensitivity);
  const setSensitivity = useStore(s => s.setSensitivity);
  const proHeldRef = useRef(false);
  const proHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  // Land on `initialTab` each time it's reopened — landing back on whatever
  // tab a previous visit happened to leave selected would read as this
  // having been left mid-task rather than a fresh settings surface each time.
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-md" aria-label="Close settings" onClick={onClose} />
      <div className="pointer-events-auto relative flex h-[min(88dvh,760px)] w-[min(94vw,880px)] flex-col overflow-hidden rounded-lg border border-white/12 bg-black/85 shadow-[0_0_80px_hsl(var(--accent)/0.25)] backdrop-blur-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <AccountCrystalIcon className="h-5 w-5" />
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-[hsl(var(--accent))]">Settings</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-white/10 px-5 pt-3" role="tablist">
          {(["general", "export"] as const satisfies readonly Tab[]).map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-active={tab === t || undefined}
              className="rounded-t-md border-b-2 border-transparent px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/50 transition hover:text-white/80 data-[active]:border-[hsl(var(--accent))] data-[active]:text-[hsl(var(--accent))]"
            >
              {t === "general" ? "General" : "Export"}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "general" ? (
            <div className="flex flex-col gap-6">
              <section className="flex flex-col gap-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/40">Account</p>
                <div className="flex items-center justify-between gap-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs leading-relaxed text-white/70">
                    Manage sign-in, subscription, and account details on the full account page.
                  </p>
                  <button
                    type="button"
                    onClick={onMyAccount}
                    className="shrink-0 rounded-full border border-[hsl(var(--accent))]/50 bg-[hsl(var(--accent))]/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--accent))] transition hover:bg-[hsl(var(--accent))]/20"
                  >
                    My Account →
                  </button>
                </div>
              </section>

              {onSupport && (
                <section>
                  {/* The one deliberately loud element in this whole overlay —
                      everything else here is a quiet settings row; this is a
                      nudge, on purpose, per the ask that it not blend in. */}
                  <button
                    type="button"
                    onClick={onSupport}
                    className="settings-supporter-cta group flex w-full flex-col items-center gap-1.5 rounded-lg border border-[hsl(var(--accent))]/60 bg-gradient-to-br from-[hsl(var(--accent)/0.22)] to-transparent p-5 text-center transition hover:border-[hsl(var(--accent))]"
                  >
                    <Sparkles className="h-5 w-5 text-[hsl(var(--accent))]" strokeWidth={1.5} />
                    <span className="font-mono text-lg font-bold uppercase tracking-[0.14em] text-white">Become a Supporter</span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/60">Unlock Journey mode, higher-res exports, and more</span>
                  </button>
                </section>
              )}

              <section className="flex flex-col gap-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/40">Display</p>
                <button
                  type="button"
                  onClick={() => { if (proHeldRef.current) return; setProModeEnabled(!proModeEnabled); }}
                  onPointerDown={(event) => {
                    proHeldRef.current = false;
                    if (proHoldTimerRef.current) window.clearTimeout(proHoldTimerRef.current);
                    const { clientX, clientY } = event;
                    proHoldTimerRef.current = window.setTimeout(() => {
                      proHeldRef.current = true;
                      setHelpModeEnabled(!helpModeEnabled);
                      const uv = clientToViewportUv(clientX, clientY);
                      cursorFx.chaos(uv.x, uv.y);
                      try { (navigator as any).vibrate?.(10); } catch {}
                    }, 420);
                  }}
                  onPointerUp={() => { if (proHoldTimerRef.current) { window.clearTimeout(proHoldTimerRef.current); proHoldTimerRef.current = null; } }}
                  onPointerLeave={() => { if (proHoldTimerRef.current) { window.clearTimeout(proHoldTimerRef.current); proHoldTimerRef.current = null; } }}
                  data-active={proModeEnabled || helpModeEnabled || undefined}
                  className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/[0.03] p-3 text-left transition data-[active]:border-[hsl(var(--accent))]/50 data-[active]:bg-[hsl(var(--accent))]/10"
                >
                  <span className="flex items-center gap-2">
                    {helpModeEnabled ? <HelpCircle className="h-4 w-4 text-[hsl(var(--accent))]" strokeWidth={1.5} /> : <EyeOff className="h-4 w-4 text-white/60" strokeWidth={1.5} />}
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">Pro Mode — hide all UI</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
                    {helpModeEnabled ? "Help Mode on" : "hold for Help Mode"}
                  </span>
                </button>
              </section>

              <section className="flex flex-col gap-2">
                <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/40">Audio &amp; sensitivity</p>
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                    <span className="flex items-center gap-2"><Gauge className="h-4 w-4" strokeWidth={1.5} />Global sensitivity</span>
                    <em className="not-italic text-[hsl(var(--accent))]">{sensitivity.toFixed(2)}×</em>
                  </div>
                  <input
                    type="range" min={0.2} max={2.5} step={0.05} value={sensitivity}
                    onChange={(event) => setSensitivity(+event.target.value)}
                    aria-label="Global sensitivity"
                    className="slider-hair w-full"
                  />
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="max-w-[75%] font-mono text-[9px] leading-tight text-white/45">
                      Scales how hard everything reacts — mic/device audio and any beat/audio-mapped effect, in every mode. 1× changes nothing.
                    </p>
                    {sensitivity !== 1 && (
                      <button type="button" onClick={() => setSensitivity(1)} className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-white/50 hover:text-[hsl(var(--accent))]">
                        reset
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <ExportSettingsPanel onClose={onClose} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
