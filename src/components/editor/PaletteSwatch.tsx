/**
 * Bottom-left palette swatch — five hex dots showing the dominant colors
 * extracted from the current image. Hidden in Performance Mode unless the
 * user enabled "show meters in performance".
 */
import { useStore } from "@/store/useStore";

export function PaletteSwatch() {
  const profile = useStore(s => s.paletteProfile);
  const isPerf = useStore(s => s.isPerformanceMode);
  const showInPerf = useStore(s => s.showMetersInPerformance);

  if (!profile) return null;
  if (isPerf && !showInPerf) return null;

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-sm border border-[hsl(var(--border-default))] bg-black/40 px-2 py-1.5 backdrop-blur-md">
      {profile.hexes.map((hex, i) => (
        <span
          key={`${hex}-${i}`}
          title={hex}
          className="block h-3 w-3 rounded-full border border-black/40 shadow-[0_0_4px_rgba(0,0,0,0.6)]"
          style={{ backgroundColor: hex }}
        />
      ))}
    </div>
  );
}
