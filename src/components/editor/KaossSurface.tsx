/**
 * KaossSurface — gesture overlay over the canvas.
 *
 * Renders only when instrumentEnabled. Captures multi-touch + pointer
 * gestures and drives:
 *   - kaossSynth (note triggers, sustained voices, mode switching)
 *   - tilt-bend & shake via kaossSensors
 *   - mini XY orb display + scanline overlay
 *
 * Does NOT touch the visualizer's render loop or layer state — visual
 * "modes" live in their own decorative canvas above the GL canvas.
 *
 * Modifier-key gestures (shift, cmd/ctrl) bubble up to the parent so the
 * existing editor shortcuts (shift+click MOSH, etc.) keep working.
 */
import { useEffect, useMemo, useRef } from "react";
import { useKaossStore, VIS_MODES } from "@/store/kaossStore";
import { useStore } from "@/store/useStore";
import { EFFECTS_BY_ID } from "@/engine/effects";
import { kaossSynth, quantize, noteName, PRESETS, SCALES } from "@/engine/kaossSynth";
import { kaossSensors } from "@/engine/kaossSensors";
import { toast } from "sonner";

type Pointer = {
  id: number;
  x: number;       // 0..1
  y: number;       // 0..1
  startedAt: number;
  startX: number;
  startY: number;
  voice: ReturnType<typeof kaossSynth.trigger>;
  isHold: boolean;
  midi: number;
};

const HOLD_MS = 180;
const SWIPE_MIN = 0.18; // fraction of viewport

/**
 * Fraction of the pad's inscribed radius reserved as a dead zone, centered
 * where the HUD's note bubble/orb readouts sit. A press that *lands* here
 * never triggers a hit — it isn't tracked at all, so a drag that starts in
 * the dead zone and travels out doesn't retroactively engage either. Only
 * where a gesture starts decides this; nothing here reads pointerType, so a
 * mouse click and a touch tap resolve through the exact same math.
 */
export const KAOSS_DEAD_ZONE = 0.15;

/** Normalized distance from pad center, 0 at center to 1 at the inscribed edge. */
export function kaossDistance(x: number, y: number): number {
  return Math.min(1, Math.hypot(x - 0.5, y - 0.5) / 0.5);
}

/** True once a point falls inside the reserved center dead zone. */
export function inKaossDeadZone(x: number, y: number): boolean {
  return kaossDistance(x, y) < KAOSS_DEAD_ZONE;
}

/** Angle from center in degrees, 0 = up (12 o'clock), increasing clockwise. */
export function kaossAngle(x: number, y: number): number {
  const deg = (Math.atan2(x - 0.5, 0.5 - y) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/**
 * How hard a hit lands, scaled by how far past the dead zone it is — 0 right
 * at the dead-zone edge, 1 at the pad's outer edge. This is the "distance
 * scales intensity" half of position-influenced hits: a tap near the middle
 * is a glancing touch, one out at the rim hits at full force.
 */
export function kaossDistanceIntensity(distance: number): number {
  const span = 1 - KAOSS_DEAD_ZONE;
  return Math.max(0, Math.min(1, (distance - KAOSS_DEAD_ZONE) / span));
}

/**
 * Which vis-mode wedge an angle falls into — splits the pad into as many
 * equal slices as there are vis modes, the "angle picks the effect" half of
 * a position-influenced hit. This never changes the *current* vis mode
 * (that's still cyclable via 2-finger tap / V); it only accents that one
 * burst with the wedge's palette.
 */
export function kaossAngleModeIndex(angle: number, count: number): number {
  if (count <= 0) return 0;
  return Math.floor((angle / 360) * count) % count;
}

export function KaossSurface() {
  const enabled = useKaossStore(s => s.instrumentEnabled);
  const synthEnabled = useKaossStore(s => s.synthEnabled);
  const sensorsEnabled = useKaossStore(s => s.sensorsEnabled);
  const preset = useKaossStore(s => s.preset);
  const scale = useKaossStore(s => s.scale);
  const octave = useKaossStore(s => s.octave);
  const visMode = useKaossStore(s => s.visMode);
  const showHud = useKaossStore(s => s.showHud);
  const reverbWet = useKaossStore(s => s.reverbWet);
  const masterGain = useKaossStore(s => s.masterGain);
  const setOrb = useKaossStore(s => s.setOrb);
  const setNoteLabel = useKaossStore(s => s.setNoteLabel);

  const wrapRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  const undoStackRef = useRef<number[]>([]); // captured for visual ripple decay

  // Sync settings into engines.
  useEffect(() => { kaossSynth.setEnabled(synthEnabled && enabled); }, [synthEnabled, enabled]);
  useEffect(() => { kaossSynth.setPreset(preset); }, [preset]);
  useEffect(() => { kaossSynth.setReverb(reverbWet); }, [reverbWet]);
  useEffect(() => { kaossSynth.setMasterGain(masterGain); }, [masterGain]);

  // Safety net — kill all voices on disable, preset/scale change, blur, tab
  // hide, or pointer cancellation outside the surface. Prevents stuck notes
  // when a pointerup is lost (capture released by the browser, gesture
  // interrupted by OS, etc.).
  const releaseAll = () => {
    for (const ptr of pointersRef.current.values()) {
      if (ptr.voice) { try { kaossSynth.release(ptr.voice); } catch {} }
    }
    pointersRef.current.clear();
    kaossSynth.allOff();
    setOrb(0.5, 0.5, false);
  };
  useEffect(() => { if (!enabled) releaseAll(); }, [enabled]);
  useEffect(() => { releaseAll(); }, [preset, scale]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) releaseAll(); };
    const onBlur = () => releaseAll();
    const onUp = (e: PointerEvent) => {
      // Catch pointerups the surface missed (capture lost outside).
      const ptr = pointersRef.current.get(e.pointerId);
      if (!ptr) return;
      if (ptr.voice) { try { kaossSynth.release(ptr.voice); } catch {} }
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size === 0) setOrb(ptr.x, ptr.y, false);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Sensors lifecycle.
  useEffect(() => {
    if (!enabled || !sensorsEnabled) {
      kaossSensors.stop();
      return;
    }
    if (!kaossSensors.isSupported()) {
      toast.message("Motion sensors not available on this device");
      useKaossStore.getState().setSensorsEnabled(false);
      return;
    }
    kaossSensors.start(() => {
      // Shake → wipe burst (visual + brief silence)
      flashWipe();
      kaossSynth.allOff();
    }).then(() => {
      if (!kaossSensors.enabled) {
        toast.message("Motion permission denied");
        useKaossStore.getState().setSensorsEnabled(false);
      }
    });
    return () => kaossSensors.stop();
  }, [enabled, sensorsEnabled]);

  // Tilt → pitch bend / reverb modulation.
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      if (sensorsEnabled && kaossSensors.enabled) {
        const g = kaossSensors.state.gamma;
        const b = kaossSensors.state.beta;
        // gamma -45..45 → ±150 cents
        const cents = Math.max(-150, Math.min(150, (g / 45) * 150));
        kaossSynth.setBendCents(cents);
        // beta tilt 0..90 → reverb 0..0.7 (modulate around base)
        const baseWet = useKaossStore.getState().reverbWet;
        const dyn = Math.max(0, Math.min(0.6, (b / 90) * 0.6));
        kaossSynth.setReverb(Math.min(1, baseWet * (1 - 0.4) + dyn * 0.4));
      } else {
        kaossSynth.setBendCents(0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, sensorsEnabled]);

  // Drives the visualizer (no overlay drawing — the visualizer itself reacts).
  const overlay = useOverlay(enabled, visMode);

  const rootMidi = useMemo(() => 12 + octave * 12, [octave]); // C{octave}

  const localCoords = (e: PointerEvent | React.PointerEvent): { x: number; y: number } => {
    const el = wrapRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  const flashWipe = () => {
    overlay.spawnWipe();
  };

  // Handle a 3-finger tap: reset.
  const tryTripleReset = () => {
    if (pointersRef.current.size >= 3) {
      flashWipe();
      kaossSynth.allOff();
      undoStackRef.current = [];
      // Cycle inversion vibe: bump vis mode
      useKaossStore.getState().cycleVisMode(1);
    }
  };

  const onPointerDown = async (e: React.PointerEvent) => {
    if (!enabled) return;
    // Let modifier-key gestures (existing editor: shift/cmd/ctrl) pass through.
    if (e.shiftKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();

    const { x, y } = localCoords(e);

    // Center dead zone — a press that lands here never becomes a tracked
    // pointer, so it can't trigger a hit or seed a drag/swipe either.
    if (inKaossDeadZone(x, y)) return;

    // Ensure audio context on first gesture.
    if (synthEnabled) await kaossSynth.ensureCtx();

    const distance = kaossDistance(x, y);
    const angle = kaossAngle(x, y);
    const intensity = kaossDistanceIntensity(distance);

    const midi = quantize(x, scale, rootMidi, 3);
    const cutoff = 1 - y; // top = bright
    const vel = Math.min(1, 0.35 + (1 - y) * 0.35 + intensity * 0.3);
    const voice = kaossSynth.trigger(midi, cutoff, vel, true);
    const ptr: Pointer = {
      id: e.pointerId,
      x, y,
      startedAt: performance.now(),
      startX: x, startY: y,
      voice,
      isHold: false,
      midi,
    };
    pointersRef.current.set(e.pointerId, ptr);
    try { (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId); } catch {}

    setOrb(x, y, true);
    setNoteLabel(noteName(midi));
    overlay.spawnBurst(x, y, vel, kaossAngleModeIndex(angle, VIS_MODES.length));

    // 2-finger tap → cycle vis mode
    if (pointersRef.current.size === 2) {
      const ids = Array.from(pointersRef.current.values());
      const fresh = ids.every(p => performance.now() - p.startedAt < 80);
      if (fresh) {
        useKaossStore.getState().cycleVisMode(1);
      }
    }
    // 3-finger tap reset
    setTimeout(tryTripleReset, 60);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!enabled) return;
    const ptr = pointersRef.current.get(e.pointerId);
    if (!ptr) return;
    e.preventDefault();
    const { x, y } = localCoords(e);
    ptr.x = x; ptr.y = y;
    if (performance.now() - ptr.startedAt > HOLD_MS) ptr.isHold = true;

    const midi = quantize(x, scale, rootMidi, 3);
    const cutoff = 1 - y;
    if (ptr.voice) kaossSynth.updateVoice(ptr.voice, midi, cutoff);
    ptr.midi = midi;

    // Trail every few px
    overlay.spawnTrail(x, y);
    setOrb(x, y, true);
    setNoteLabel(noteName(midi));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!enabled) return;
    const ptr = pointersRef.current.get(e.pointerId);
    if (!ptr) return;
    pointersRef.current.delete(e.pointerId);

    // Swipe detection (only single-finger lifts that aren't holds)
    const dt = performance.now() - ptr.startedAt;
    const dx = ptr.x - ptr.startX;
    const dy = ptr.y - ptr.startY;
    const isSwipe = !ptr.isHold && dt < 350 && (Math.abs(dx) > SWIPE_MIN || Math.abs(dy) > SWIPE_MIN);

    if (ptr.voice) kaossSynth.release(ptr.voice);

    if (isSwipe) {
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) handleSwipeLeft();
        else handleSwipeRight();
      } else {
        if (dy < 0) handleSwipeUp();
        else handleSwipeDown();
      }
    }

    if (pointersRef.current.size === 0) setOrb(ptr.x, ptr.y, false);
  };

  const handleSwipeLeft = () => {
    // Visual undo (peel last burst layer)
    overlay.undoLast();
  };
  const handleSwipeRight = () => {
    useKaossStore.getState().cyclePreset(1);
  };
  const handleSwipeUp = () => {
    useKaossStore.getState().setPanelOpen(true);
  };
  const handleSwipeDown = () => {
    useKaossStore.getState().setShowHud(!useKaossStore.getState().showHud);
  };

  // Keyboard fallbacks.
  useEffect(() => {
    if (!enabled) return;
    const onKey = async (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // Don't conflict with main editor shortcuts (they handle modifiers).
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (e.key === " " || e.code === "Space") {
        // Already used by editor for reroll seed. Skip to avoid conflict.
        return;
      }
      if (e.key === "n" || e.key === "N") {
        // 'N' = new preset cycle (avoid clash with 'M' which toggles mic)
        e.preventDefault();
        useKaossStore.getState().cyclePreset(1);
      }
      if (e.key === "v" || e.key === "V") {
        // 'V' = vis mode cycle
        e.preventDefault();
        useKaossStore.getState().cycleVisMode(1);
      }
      if (e.key === "x" || e.key === "X") {
        // 'X' = trigger burst at center
        e.preventDefault();
        if (synthEnabled) await kaossSynth.ensureCtx();
        const midi = quantize(0.5, scale, rootMidi, 3);
        kaossSynth.trigger(midi, 0.7, 0.85);
        overlay.spawnBurst(0.5, 0.5, 0.85);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, synthEnabled, scale, rootMidi]);

  if (!enabled) return null;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-30 touch-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {showHud && <KaossHud />}
    </div>
  );
}

/* ---------- HUD ---------- */

function KaossHud() {
  const orb = useKaossStore(s => s.orb);
  const noteLabel = useKaossStore(s => s.noteLabel);
  const preset = useKaossStore(s => s.preset);
  const scale = useKaossStore(s => s.scale);
  const visMode = useKaossStore(s => s.visMode);
  const presetLabel = PRESETS.find(p => p.id === preset)?.label ?? preset;
  const scaleLabel = SCALES.find(s => s.id === scale)?.label ?? scale;
  const visLabel = VIS_MODES.find(v => v.id === visMode)?.label ?? visMode;

  return (
    <>
      {/* Center dead zone — reserved so a stray tap near the readouts can't
          land a hit. Sized to match KAOSS_DEAD_ZONE exactly (diameter = 2x
          the dead-zone radius, as a % of each axis). */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10"
        style={{ width: `${KAOSS_DEAD_ZONE * 200}%`, height: `${KAOSS_DEAD_ZONE * 200}%` }}
      />

      {/* Top status strip */}
      <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-sm bg-black/55 px-2.5 py-1 backdrop-blur-md border border-white/10">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--accent))]">●</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/85">{visLabel}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">/</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/85">{presetLabel}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">/</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/85">{scaleLabel}</span>
      </div>

      {/* Note bubble bottom-left */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-sm bg-black/55 px-2 py-1 backdrop-blur-md border border-white/10">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[hsl(var(--accent))]">
          {noteLabel}
        </span>
      </div>

      {/* XY mini-orb bottom-right */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 h-16 w-16 rounded-sm border border-white/15 bg-black/45 backdrop-blur-md">
        <div
          className="absolute h-2 w-2 rounded-full bg-[hsl(var(--accent))] shadow-[0_0_12px_hsl(var(--accent))] transition-opacity"
          style={{
            left: `calc(${orb.x * 100}% - 4px)`,
            top: `calc(${orb.y * 100}% - 4px)`,
            opacity: orb.active ? 1 : 0.45,
          }}
        />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border-r border-b border-white/10" />
          ))}
        </div>
      </div>

      {/* Scanline overlay (CRT) */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)",
        }}
      />
    </>
  );
}

/* ---------- Visualizer feedback (no overlay paint) ----------
 *
 * Instead of painting pink trails over the visualizer, every Kaoss touch
 * publishes energy + a per-vis-mode source palette to globals that GlCanvas
 * folds into its render pulse + audio sources. The visualizer itself
 * convulses, ripples, warps and moshes in response.
 */

type SourcePalette = { bass: number; mid: number; treble: number; overall: number; beat: number };

function visSourcePalette(mode: string): SourcePalette {
  switch (mode) {
    case "pixelDrift": return { bass: 0.35, mid: 0.85, treble: 0.55, overall: 0.4, beat: 0.6 };
    case "voidBloom":  return { bass: 0.95, mid: 0.25, treble: 0.15, overall: 0.85, beat: 0.3 };
    case "fracture":   return { bass: 0.7,  mid: 0.4,  treble: 0.3,  overall: 0.35, beat: 1.0 };
    case "flux":       return { bass: 0.25, mid: 0.7,  treble: 0.45, overall: 0.95, beat: 0.2 };
    case "noiseStorm": return { bass: 0.85, mid: 0.85, treble: 0.85, overall: 0.7,  beat: 0.75 };
    case "prism":      return { bass: 0.15, mid: 0.55, treble: 0.95, overall: 0.5,  beat: 0.4 };
    case "plasma":
    default:           return { bass: 0.35, mid: 0.55, treble: 0.85, overall: 0.85, beat: 0.45 };
  }
}

function publish(level: number, xy: { x: number; y: number } | null, palette: SourcePalette) {
  const w = window as any;
  w.__aegisKaossLevel = level;
  if (xy) w.__aegisKaossXY = xy;
  w.__aegisKaossPalette = palette;
  w.__aegisKaossActive = level > 0.01;
}

/** Linear-interpolates every channel of a palette toward an accent by `t` (0..1). */
function blendPalette(base: SourcePalette, accent: SourcePalette, t: number): SourcePalette {
  if (t <= 0) return base;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    bass: lerp(base.bass, accent.bass),
    mid: lerp(base.mid, accent.mid),
    treble: lerp(base.treble, accent.treble),
    overall: lerp(base.overall, accent.overall),
    beat: lerp(base.beat, accent.beat),
  };
}

function useOverlay(enabled: boolean, visMode: string) {
  const levelRef = useRef(0);
  const targetRef = useRef(0);
  const xyRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const paletteRef = useRef<SourcePalette>(visSourcePalette(visMode));
  // The angle-picked accent for the most recent hit, and how much of it is
  // still bleeding into the published palette — decays back to the base
  // vis-mode palette between hits instead of a tap permanently recoloring it.
  const accentPaletteRef = useRef<SourcePalette>(paletteRef.current);
  const accentLevelRef = useRef(0);
  const accentTargetRef = useRef(0);

  useEffect(() => { paletteRef.current = visSourcePalette(visMode); }, [visMode]);

  useEffect(() => {
    if (!enabled) {
      levelRef.current = 0;
      targetRef.current = 0;
      accentLevelRef.current = 0;
      accentTargetRef.current = 0;
      publish(0, null, paletteRef.current);
      return;
    }
    let raf = 0;
    const tick = () => {
      // Smooth toward target, then decay target so releases feel natural.
      const cur = levelRef.current;
      const t = targetRef.current;
      const next = cur + (t - cur) * 0.18;
      levelRef.current = next;
      targetRef.current = Math.max(0, t - 0.012); // gentle decay

      // Same smoothing for the angle accent, decaying a touch faster so the
      // wedge's color reads as a per-hit flavor, not a lingering mode switch.
      const accentCur = accentLevelRef.current;
      const accentT = accentTargetRef.current;
      const accentNext = accentCur + (accentT - accentCur) * 0.18;
      accentLevelRef.current = accentNext;
      accentTargetRef.current = Math.max(0, accentT - 0.02);

      const palette = blendPalette(paletteRef.current, accentPaletteRef.current, accentNext * 0.6);
      publish(next, xyRef.current, palette);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); publish(0, null, paletteRef.current); };
  }, [enabled]);

  const bumpRipple = (strength: number) => {
    const w = window as any;
    const now = performance.now();
    const dur = 600 + strength * 600;
    w.__aegisRippleUntil = Math.max(w.__aegisRippleUntil ?? 0, now + dur);
    // Also dispatch a synthetic beat so beat-mapped params snap.
    w.__aegisLastBeatAt = now;
    window.dispatchEvent(new Event("aegis:beat"));
  };

  return {
    spawnBurst: (x: number, y: number, vel: number, accentModeIndex?: number) => {
      xyRef.current = { x, y };
      targetRef.current = Math.min(1, targetRef.current + 0.5 + vel * 0.5);
      bumpRipple(0.6 + vel * 0.4);
      if (accentModeIndex != null) {
        accentPaletteRef.current = visSourcePalette(VIS_MODES[accentModeIndex]?.id ?? visMode);
        accentTargetRef.current = Math.min(1, accentTargetRef.current + 0.6 + vel * 0.4);
      }
    },
    spawnTrail: (x: number, y: number) => {
      xyRef.current = { x, y };
      // Sustain energy while dragging.
      targetRef.current = Math.min(1, Math.max(targetRef.current, 0.55));
    },
    spawnWipe: () => {
      targetRef.current = 1;
      bumpRipple(1);
    },
    undoLast: () => {
      targetRef.current = Math.max(0, targetRef.current - 0.4);
    },
  };
}
