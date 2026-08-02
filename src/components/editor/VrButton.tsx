/**
 * VrButton — enters immersive WebXR when a headset (Quest / Occlusion-class)
 * is detected. Hidden entirely on devices without immersive-vr support.
 */
import { useEffect, useState } from "react";
import { Glasses } from "lucide-react";
import { vrMode } from "@/engine/vrMode";
import { MoshRenderer } from "@/engine/Renderer";
import { toast } from "sonner";

type Props = {
  getRenderer: () => MoshRenderer | null;
  getFrame: () => (() => void) | null;
};

export function VrButton({ getRenderer, getFrame }: Props) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(vrMode.active);

  useEffect(() => {
    let alive = true;
    vrMode.isSupported().then(ok => { if (alive) setSupported(ok); });
    const off = vrMode.onChange(setActive);
    return () => { alive = false; off(); };
  }, []);

  if (!supported) return null;

  const onClick = async () => {
    if (active) { await vrMode.exit(); return; }
    const r = getRenderer();
    const frame = getFrame();
    if (!r || !frame) return;
    try {
      await vrMode.enter(r, frame);
    } catch (e) {
      toast.error("Couldn't start VR", { description: (e as Error)?.message });
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Exit VR" : "Enter VR"}
      className="pointer-events-auto absolute top-3 left-3 z-40 flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 backdrop-blur-md"
    >
      <Glasses className="h-4 w-4 text-[hsl(var(--accent))]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">
        {active ? "Exit VR" : "VR"}
      </span>
    </button>
  );
}
