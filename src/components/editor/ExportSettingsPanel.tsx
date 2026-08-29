import { X } from "lucide-react";
import { useStore, type ExportSettings } from "@/store/useStore";

/**
 * The one place every export-adjustable parameter in the app lives —
 * screenshot, share, GIF, video recording, print-ready stills, and the
 * Forge/Motif/Seamless tile exporters. Opened from its own hot trigger
 * (radial wheel) or by tapping the "export started" toast any export fires.
 *
 * Not every export path has something worth exposing here (the quick
 * screenshot's format is deliberately locked to a synchronous PNG save so
 * mobile browsers don't drop the download — see downloadCanvasPngNow's own
 * comment) — those are listed too, with a short note on why, rather than
 * silently omitted, so this is genuinely the complete map of "everything
 * export-related, and what of it you can actually change."
 */
export function ExportSettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useStore(s => s.exportSettings);
  const setSettings = useStore(s => s.setExportSettings);

  return (
    <div
      className="pointer-events-auto flex max-h-[calc(100dvh-6rem)] w-72 flex-col gap-4 overflow-y-auto rounded-sm border border-[hsl(var(--border-default))] bg-black/85 p-3 backdrop-blur-md"
      role="dialog"
      aria-label="Export settings"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-[hsl(var(--accent))]">Export settings</p>
        <button type="button" onClick={onClose} aria-label="Close export settings" className="text-white/40 transition hover:text-white">
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <Section title="GIF loop">
        <RangeRow label="Frame rate" value={settings.gifFps} min={6} max={24} step={1} unit=" fps"
          onChange={v => setSettings({ gifFps: v })} />
        <RangeRow label="Max width" value={settings.gifMaxWidth} min={240} max={960} step={40} unit="px"
          onChange={v => setSettings({ gifMaxWidth: v })} />
        <RangeRow label="Default length" value={settings.gifDefaultSeconds} min={2} max={15} step={1} unit="s"
          onChange={v => setSettings({ gifDefaultSeconds: v })} />
      </Section>

      <Section title="Video recording">
        <ChoiceRow
          label="Format"
          value={settings.videoFormat}
          options={[
            { value: "webm", label: "WebM · best quality" },
            { value: "mp4", label: "MP4 · most compatible" },
          ]}
          onChange={v => setSettings({ videoFormat: v as ExportSettings["videoFormat"] })}
        />
        <p className="text-[9px] leading-tight text-white/35">
          A preference, not a guarantee — browsers that can't encode the pick fall back automatically, and the file is validated against what actually came back.
        </p>
        <RangeRow label="Frame rate" value={settings.videoFps} min={15} max={60} step={5} unit=" fps"
          onChange={v => setSettings({ videoFps: v })} />
      </Section>

      <Section title="Print-ready stills, Forge / Motif / Seamless tiles">
        <ChoiceRow
          label="DPI"
          value={String(settings.printDpi)}
          options={[
            { value: "150", label: "150 · web print" },
            { value: "300", label: "300 · standard (default)" },
            { value: "600", label: "600 · high-end" },
          ]}
          onChange={v => setSettings({ printDpi: Number(v) as ExportSettings["printDpi"] })}
        />
        <p className="text-[9px] leading-tight text-white/35">
          Stamped into the file's density metadata — doesn't touch pixels or resolution, just what a print shop reads off it. Applies to every one of these exporters, not just print-ready stills.
        </p>
      </Section>

      <Section title="Share sheet">
        <RangeRow label="JPG quality" value={Math.round(settings.shareQuality * 100)} min={50} max={100} step={5} unit="%"
          onChange={v => setSettings({ shareQuality: v / 100 })} />
      </Section>

      <Section title="Screenshot & stickers">
        <p className="text-[9px] leading-tight text-white/35">
          Screenshot stays a synchronous PNG save on purpose — many phones silently drop a download that starts even a moment after the tap, so this is the one export that can't wait on an encode choice. Sticker export format (WebP, animated PNG, GIF, or Lottie JSON) follows the sticker type, not a quality setting.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-mono text-[8px] uppercase tracking-[0.25em] text-foreground/40">{title}</p>
      {children}
    </div>
  );
}

function RangeRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-white/70">
        {label}<em className="not-italic text-[hsl(var(--accent))]">{value}{unit}</em>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full accent-[hsl(var(--accent))]"
      />
    </label>
  );
}

function ChoiceRow({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/70">{label}</span>
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          data-active={opt.value === value || undefined}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.08em] text-white/70 transition hover:bg-white/10 data-[active]:bg-[hsl(var(--accent))]/10 data-[active]:text-[hsl(var(--accent))]"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
