import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cursorFx } from "@/engine/cursorFx";

const FX = [
  "melt", "vanish", "drift", "teleport", "twist", "meld",
  "mesh", "collide", "contort", "whip", "shred", "chromatic",
] as const;

type Burst = { id: number; x: number; y: number; fx: typeof FX[number]; duration: number };

let bag: Array<typeof FX[number]> = [];
export function nextInteractionFx(rand = Math.random) {
  if (!bag.length) {
    bag = [...FX];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop()!;
}

const interactiveTarget = (start: EventTarget | null) =>
  start instanceof Element
    ? start.closest<HTMLElement>("button, a, [role='button'], [role='menuitem'], label, [data-input-feedback]")
    : null;

export function InteractionFeedback() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const sequence = useRef(0);

  useEffect(() => {
    const activeTargets = new Map<HTMLElement, number>();
    const move = (event: PointerEvent) => {
      const hoverCapable = event.pointerType === "mouse" || event.pointerType === "pen";
      if (!hoverCapable) return;
      const cursor = cursorRef.current;
      if (cursor) {
        cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
        cursor.dataset.visible = "true";
        cursor.dataset.pen = String(event.pointerType === "pen");
        cursor.dataset.zone = event.target instanceof Element && event.target.closest("[data-cursor-zone='controls']")
          ? "controls"
          : "visualizer";
      }
      const x = event.clientX / Math.max(1, window.innerWidth);
      const y = 1 - event.clientY / Math.max(1, window.innerHeight);
      if (event.buttons === 0) cursorFx.hover(`hover-${event.pointerId}`, x, y);
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      if (cursorRef.current) cursorRef.current.dataset.visible = "false";
      cursorFx.release(`hover-${event.pointerId}`);
    };
    const down = (event: PointerEvent) => {
      const fx = nextInteractionFx();
      const duration = 300 + Math.round(Math.random() * 200);
      cursorFx.burst(
        event.clientX / Math.max(1, window.innerWidth),
        1 - event.clientY / Math.max(1, window.innerHeight),
      );
      const id = ++sequence.current;
      setBursts(items => [...items.slice(-15), { id, x: event.clientX, y: event.clientY, fx, duration }]);
      window.setTimeout(() => setBursts(items => items.filter(item => item.id !== id)), duration + 80);

      const target = interactiveTarget(event.target);
      if (!target) return;
      const oldTimer = activeTargets.get(target);
      if (oldTimer) window.clearTimeout(oldTimer);
      target.dataset.inputFx = fx;
      target.style.setProperty("--input-fx-ms", `${duration}ms`);
      const timer = window.setTimeout(() => {
        delete target.dataset.inputFx;
        target.style.removeProperty("--input-fx-ms");
        activeTargets.delete(target);
      }, duration + 30);
      activeTargets.set(target, timer);
    };
    window.addEventListener("pointermove", move, { capture: true, passive: true });
    window.addEventListener("pointerdown", down, { capture: true, passive: true });
    document.documentElement.addEventListener("pointerleave", leave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move, { capture: true });
      window.removeEventListener("pointerdown", down, { capture: true });
      document.documentElement.removeEventListener("pointerleave", leave);
      for (const timer of activeTargets.values()) window.clearTimeout(timer);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="interaction-feedback pointer-events-none fixed inset-0 z-[120] overflow-hidden" aria-hidden>
      <div ref={cursorRef} className="mosh-hover-cursor" data-visible="false"><i /><i /><i /></div>
      {bursts.map(burst => (
        <i
          key={burst.id}
          className="mosh-input-burst"
          data-fx={burst.fx}
          style={{ left: burst.x, top: burst.y, animationDuration: `${burst.duration}ms` }}
        />
      ))}
    </div>,
    document.body,
  );
}
