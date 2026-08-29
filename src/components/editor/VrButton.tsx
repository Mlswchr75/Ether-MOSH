/**
 * VrButton — enters immersive WebXR when a headset (Quest / Occlusion-class)
 * is detected. Hidden entirely on devices without immersive-vr support.
 */
import { useEffect, useState } from "react";
import { Glasses, Maximize2, PanelsTopLeft } from "lucide-react";
import { vrMode } from "@/engine/vrMode";
import { MoshRenderer } from "@/engine/Renderer";
import { isMetaQuestUserAgent } from "@/engine/xrCapabilities";
import { toast } from "sonner";

type Props = {
  getRenderer: () => MoshRenderer | null;
  getFrame: () => (() => void) | null;
};

export function VrButton({ getRenderer, getFrame }: Props) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(vrMode.active);
  const [enteredOnce, setEnteredOnce] = useState(vrMode.active);
  const questBrowser = isMetaQuestUserAgent(navigator.userAgent);

  useEffect(() => {
    let alive = true;
    vrMode.isSupported().then(ok => { if (alive) setSupported(ok); });
    const off = vrMode.onChange((next) => {
      setActive(next);
      if (next) setEnteredOnce(true);
    });
    return () => { alive = false; off(); };
  }, []);

  if (!supported) return null;

  const onClick = async () => {
    if (active) {
      await vrMode.exit();
      toast.success("Window mode", { description: "Use the Horizon control bar to move or resize MOSH beside other apps." });
      return;
    }
    const r = getRenderer();
    const frame = getFrame();
    if (!r || !frame) return;
    try {
      await vrMode.enter(r, frame);
    } catch (e) {
      toast.error("Couldn't start VR", { description: (e as Error)?.message });
    }
  };

  if (questBrowser && !enteredOnce && !active) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-black/35 px-5">
        <button
          type="button"
          onClick={onClick}
          aria-label="Enter immersive Quest visualizer"
          className="pointer-events-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-accent/70 bg-black/85 px-7 py-6 text-center shadow-[0_0_80px_hsl(var(--accent)/0.35)] backdrop-blur-xl"
        >
          <Maximize2 className="h-8 w-8 text-accent" aria-hidden="true" />
          <strong className="font-mono text-sm uppercase tracking-[0.24em] text-white">Enter immersive visualizer</strong>
          <span className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.16em] text-white/65">
            Full-headset MOSH · trigger to mosh · grip to reshuffle · flick sideways for window mode
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Switch to movable window mode" : "Enter immersive visualizer"}
      /* top-14, not top-3: the source-mode pill (SourceModeToggle) owns
         top-3 left-3 now — it's the more commonly used control and needed
         the more prominent, always-visible row-1 spot. */
      className="pointer-events-auto absolute top-14 left-3 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-black/70 px-3 py-2 shadow-[0_0_24px_hsl(var(--accent)/0.18)] backdrop-blur-md"
    >
      {active
        ? <PanelsTopLeft className="h-4 w-4 text-[hsl(var(--accent))]" />
        : <Glasses className="h-4 w-4 text-[hsl(var(--accent))]" />}
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">
        {active ? "Window mode" : "Immersive"}
      </span>
    </button>
  );
}
