import { useEffect, useRef, useState } from "react";
import { Maximize2, Mic, MicOff, Image as ImageIcon, X, Circle, Activity } from "lucide-react";
import { useStore } from "@/store/useStore";
import { useNavigate } from "react-router-dom";
import { AudioSourcePicker } from "./AudioSourcePicker";

type Props = {
  isRecording: boolean;
  onExit: () => void;
};

export function PerformanceOverlay({ isRecording, onExit }: Props) {
  const navigate = useNavigate();
  const micEnabled = useStore(s => s.micEnabled);
  const setMicEnabled = useStore(s => s.setMicEnabled);
  const systemAudioEnabled = useStore(s => s.systemAudioEnabled);
  const setSystemAudioEnabled = useStore(s => s.setSystemAudioEnabled);
  const showMeters = useStore(s => s.showMetersInPerformance);
  const setShowMeters = useStore(s => s.setShowMetersInPerformance);

  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [peekVisible, setPeekVisible] = useState(false);
  const [holdShowAll, setHoldShowAll] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const idleRef = useRef<number | null>(null);
  const peekHideRef = useRef<number | null>(null);
  const holdRef = useRef<number | null>(null);
  const touchHoldRef = useRef<number | null>(null);

  // Cursor auto-hide + edge peek
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setCursorHidden(false);
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(() => setCursorHidden(true), 2000);

      // Top-edge summon
      if (e.clientY <= 40) {
        setPeekVisible(true);
        if (peekHideRef.current) { window.clearTimeout(peekHideRef.current); peekHideRef.current = null; }
      } else if (peekVisible && e.clientY > 80) {
        if (!peekHideRef.current) {
          peekHideRef.current = window.setTimeout(() => {
            setPeekVisible(false);
            peekHideRef.current = null;
          }, 1500);
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    idleRef.current = window.setTimeout(() => setCursorHidden(true), 2000);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleRef.current) window.clearTimeout(idleRef.current);
      if (peekHideRef.current) window.clearTimeout(peekHideRef.current);
    };
  }, [peekVisible]);

  // Cursor style
  useEffect(() => {
    document.body.style.cursor = cursorHidden ? "none" : "";
    return () => { document.body.style.cursor = ""; };
  }, [cursorHidden]);

  // H key hold-show-all
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "h" || e.key === "H") {
        if (holdShowAll) {
          setHoldShowAll(false);
          if (holdRef.current) window.clearTimeout(holdRef.current);
        } else {
          setHoldShowAll(true);
          if (holdRef.current) window.clearTimeout(holdRef.current);
          holdRef.current = window.setTimeout(() => setHoldShowAll(false), 4000);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (holdRef.current) window.clearTimeout(holdRef.current);
    };
  }, [holdShowAll]);

  // Mic-level pulse
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const lvl = (window as any).__aegisMicLevel ?? 0;
      setMicLevel(lvl);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Touch hold-to-summon
  useEffect(() => {
    const onTouchStart = () => {
      touchHoldRef.current = window.setTimeout(() => {
        setPeekVisible(true);
        if (peekHideRef.current) window.clearTimeout(peekHideRef.current);
        peekHideRef.current = window.setTimeout(() => setPeekVisible(false), 3000);
      }, 600);
    };
    const onTouchEnd = () => {
      if (touchHoldRef.current) { window.clearTimeout(touchHoldRef.current); touchHoldRef.current = null; }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Close the mic/device-audio source picker on outside tap
  useEffect(() => {
    if (!audioPickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-audio-source-picker]")) return;
      setAudioPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [audioPickerOpen]);

  const showPeek = peekVisible || holdShowAll;
  const liveAlpha = 0.5 + Math.min(0.5, micLevel * 0.8);

  return (
    <>
      {/* Top peek bar */}
      <div
        className={`pointer-events-${showPeek ? "auto" : "none"} fixed top-0 left-0 right-0 z-[10000] flex justify-center transition-opacity duration-200 motion-reduce:transition-none`}
        style={{ opacity: showPeek ? 1 : 0 }}
      >
        <div
          className="mt-3 flex items-center gap-1 rounded-sm border px-2 py-1.5"
          style={{
            background: "rgba(10, 8, 14, 0.78)",
            borderColor: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <button
            onClick={onExit}
            className="grid h-8 w-8 place-items-center rounded-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            title="Exit Performance (Esc)"
            aria-label="exit performance mode"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="relative" data-audio-source-picker>
            <button
              onClick={() => {
                if (micEnabled) { setMicEnabled(false); return; }
                if (systemAudioEnabled) { setSystemAudioEnabled(false); return; }
                // Nothing active yet — ask which source, since grabbing the
                // physical mic will interrupt Bluetooth/other playback.
                setAudioPickerOpen(v => !v);
              }}
              className={`grid h-8 w-8 place-items-center rounded-sm transition ${(micEnabled || systemAudioEnabled) ? "text-red-400" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
              title="Listen Mode (Shift+I)"
              aria-label="toggle mic"
            >
              {(micEnabled || systemAudioEnabled) ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            {audioPickerOpen && (
              <AudioSourcePicker
                className="absolute left-0 top-full mt-2 z-40"
                onClose={() => setAudioPickerOpen(false)}
              />
            )}
          </div>
          <button
            onClick={() => setShowMeters(!showMeters)}
            className={`grid h-8 w-8 place-items-center rounded-sm transition ${showMeters ? "text-[hsl(var(--accent))]" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
            title="Show audio meters in Performance Mode"
            aria-label="toggle meters in performance"
          >
            <Activity className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate("/")}
            className="grid h-8 w-8 place-items-center rounded-sm text-white/70 transition hover:bg-white/10 hover:text-white"
            title="Swap source"
            aria-label="swap source image"
          >
            <ImageIcon className="h-4 w-4" />
          </button>
          <div className="ml-2 flex items-center gap-1.5 border-l border-white/10 pl-2">
            <Maximize2 className="h-3 w-3 text-white/40" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">
              Performance
            </span>
          </div>
        </div>
      </div>

      {/* Bottom-right status */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[10000] flex flex-col items-end gap-1 font-mono text-[11px] tracking-widest">
        {(micEnabled || systemAudioEnabled) && (
          <div
            className="flex items-center gap-1.5"
            style={{ color: `rgba(255, 80, 80, 0.85)` }}
          >
            <Circle
              className="h-2 w-2 fill-current"
              style={{ opacity: liveAlpha, transition: "opacity 120ms linear" }}
            />
            <span>LIVE</span>
          </div>
        )}
        {isRecording && (
          <div className="flex items-center gap-1.5" style={{ color: `rgba(255, 80, 80, 0.85)` }}>
            <Circle className="h-2 w-2 fill-current animate-pulse" />
            <span>REC</span>
          </div>
        )}
      </div>
    </>
  );
}

type TooltipProps = { onDismiss: () => void };

export function PerformanceTooltip({ onDismiss }: TooltipProps) {
  const startRef = useRef({ x: 0, y: 0, set: false });
  useEffect(() => {
    const dismiss = () => onDismiss();
    const onKey = () => dismiss();
    const onClick = () => dismiss();
    const onMove = (e: MouseEvent) => {
      if (!startRef.current.set) {
        startRef.current = { x: e.clientX, y: e.clientY, set: true };
        return;
      }
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) > 100) dismiss();
    };
    const t = window.setTimeout(dismiss, 6000);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    window.addEventListener("mousemove", onMove);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.removeEventListener("mousemove", onMove);
    };
  }, [onDismiss]);

  return (
    <div
      className="pointer-events-none fixed z-[9998] motion-reduce:animate-none"
      style={{
        top: 56,
        right: 168,
        animation: "perfTooltipIn 240ms ease-out both",
      }}
    >
      <div
        className="relative rounded-sm border px-3 py-2"
        style={{
          background: "rgba(10, 8, 14, 0.85)",
          borderColor: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          fontFamily: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
          fontSize: "12px",
          color: "white",
          whiteSpace: "nowrap",
        }}
      >
        Project this. Press P.
        <span
          className="absolute"
          style={{
            top: -5,
            right: 18,
            width: 8,
            height: 8,
            background: "rgba(10, 8, 14, 0.85)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            transform: "rotate(45deg)",
          }}
        />
      </div>
      <style>{`
        @keyframes perfTooltipIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
