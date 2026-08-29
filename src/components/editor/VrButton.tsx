/**
 * VrButton — enters immersive WebXR when a headset (Quest / Occlusion-class)
 * is detected. Offers opaque 360° VR and passthrough Room Mosh independently
 * according to the modes the current headset/browser actually supports.
 */
import { useEffect, useRef, useState } from "react";
import { Glasses, Maximize2, PanelsTopLeft, Scan } from "lucide-react";
import { vrMode } from "@/engine/vrMode";
import { MoshRenderer } from "@/engine/Renderer";
import {
  isMetaQuestUserAgent,
  readXrUiOverride,
  shouldOfferXrUi,
  XR_UI_OVERRIDE_EVENT,
  type XrExperienceMode,
  type XrUiOverride,
} from "@/engine/xrCapabilities";
import { toast } from "sonner";

type Props = {
  getRenderer: () => MoshRenderer | null;
  getFrame: () => (() => void) | null;
};

export function VrButton({ getRenderer, getFrame }: Props) {
  const [supported, setSupported] = useState({ visualizer: false, room: false });
  const [active, setActive] = useState(vrMode.active);
  const [enteredOnce, setEnteredOnce] = useState(vrMode.active);
  const [uiOverride, setUiOverride] = useState<XrUiOverride>(() =>
    typeof window === "undefined" ? "auto" : readXrUiOverride(window.localStorage)
  );
  const wasActiveRef = useRef(vrMode.active);
  const questBrowser = isMetaQuestUserAgent(navigator.userAgent);
  const offerXrUi = shouldOfferXrUi(navigator.userAgent, uiOverride);

  useEffect(() => {
    const syncOverride = () => setUiOverride(readXrUiOverride(window.localStorage));
    window.addEventListener(XR_UI_OVERRIDE_EVENT, syncOverride);
    window.addEventListener("storage", syncOverride);
    return () => {
      window.removeEventListener(XR_UI_OVERRIDE_EVENT, syncOverride);
      window.removeEventListener("storage", syncOverride);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    // Critical performance gate: normal phones/desktops do not touch the
    // WebXR capability API at all. Quest/Oculus auto-enables; Hot Triggers can
    // explicitly force the probe on for unusual headsets, or force it off.
    if (!offerXrUi) {
      setSupported({ visualizer: false, room: false });
      if (vrMode.active && uiOverride === "off") void vrMode.exit();
      return () => { alive = false; };
    }

    Promise.all([vrMode.isSupported("visualizer"), vrMode.isSupported("room")]).then(([visualizer, room]) => {
      if (alive) setSupported({ visualizer, room });
    });
    const off = vrMode.onChange((next) => {
      setActive(next);
      if (next) setEnteredOnce(true);
      if (wasActiveRef.current && !next) {
        toast.success("Window mode", { description: "Use the Horizon control bar to move or resize MOSH beside other apps." });
      }
      wasActiveRef.current = next;
    });
    return () => { alive = false; off(); };
  }, [offerXrUi, uiOverride]);

  if ((!offerXrUi && !active) || (!supported.visualizer && !supported.room && !active)) return null;

  const onClick = async (mode: XrExperienceMode = "visualizer") => {
    if (active) {
      await vrMode.exit();
      return;
    }
    const r = getRenderer();
    const frame = getFrame();
    if (!r || !frame) return;
    try {
      await vrMode.enter(r, frame, mode);
    } catch (e) {
      toast.error("Couldn't start VR", { description: (e as Error)?.message });
    }
  };

  if (questBrowser && !enteredOnce && !active) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-black/35 px-5">
        <div className="pointer-events-auto flex max-w-sm flex-col gap-3 rounded-2xl border border-accent/70 bg-black/85 p-4 text-center shadow-[0_0_80px_hsl(var(--accent)/0.35)] backdrop-blur-xl">
          {supported.room && (
            <button type="button" onClick={() => onClick("room")} aria-label="Enter Quest Room Mosh" className="flex flex-col items-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-6 py-4">
              <Scan className="h-7 w-7 text-accent" aria-hidden="true" />
              <strong className="font-mono text-sm uppercase tracking-[0.24em] text-white">Room Mosh</strong>
              <span className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-white/60">See your room · reactive visuals layered through passthrough</span>
            </button>
          )}
          {supported.visualizer && (
            <button type="button" onClick={() => onClick("visualizer")} aria-label="Enter immersive Quest visualizer" className="flex flex-col items-center gap-2 rounded-xl border border-white/15 px-6 py-4">
              <Maximize2 className="h-7 w-7 text-accent" aria-hidden="true" />
              <strong className="font-mono text-sm uppercase tracking-[0.24em] text-white">Immersive visualizer</strong>
              <span className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-white/60">Nothing but MOSH in every direction</span>
            </button>
          )}
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Hold select for Hot Triggers · flick sideways for window mode</span>
        </div>
      </div>
    );
  }

  if (active) return (
    <button
      type="button"
      onClick={() => onClick()}
      aria-label="Switch to movable window mode"
      /* top-14, not top-3: the source-mode pill (SourceModeToggle) owns
         top-3 left-3 now — it's the more commonly used control and needed
         the more prominent, always-visible row-1 spot. */
      className="pointer-events-auto absolute top-14 left-3 z-40 flex items-center gap-2 rounded-full border border-accent/40 bg-black/70 px-3 py-2 shadow-[0_0_24px_hsl(var(--accent)/0.18)] backdrop-blur-md"
    >
      <PanelsTopLeft className="h-4 w-4 text-[hsl(var(--accent))]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">
        Window mode
      </span>
    </button>
  );

  return (
    <div className="pointer-events-auto absolute top-14 left-3 z-40 flex gap-2">
      {supported.room && (
        <button type="button" onClick={() => onClick("room")} aria-label="Enter Quest Room Mosh" className="flex items-center gap-2 rounded-full border border-accent/40 bg-black/70 px-3 py-2 backdrop-blur-md">
          <Scan className="h-4 w-4 text-accent" /><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">Room</span>
        </button>
      )}
      {supported.visualizer && (
        <button type="button" onClick={() => onClick("visualizer")} aria-label="Enter immersive visualizer" className="flex items-center gap-2 rounded-full border border-accent/40 bg-black/70 px-3 py-2 backdrop-blur-md">
          <Glasses className="h-4 w-4 text-accent" /><span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/85">Immersive</span>
        </button>
      )}
    </div>
  );
}
