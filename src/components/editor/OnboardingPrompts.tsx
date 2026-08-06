import { useEffect, useState } from "react";

const COUNT_KEY = "cathedral_session_count";
const PROMPTS = [
  "Drop an image or video to begin",
  "Press M to enable mic. Watch it move.",
  "Press P to project this anywhere.",
];

export function shouldShowOnboarding(): boolean {
  try {
    return !localStorage.getItem(COUNT_KEY);
  } catch {
    return false;
  }
}

export function markOnboardingSeen() {
  try {
    const cur = parseInt(localStorage.getItem(COUNT_KEY) ?? "0", 10) || 0;
    localStorage.setItem(COUNT_KEY, String(cur + 1));
  } catch {}
}

type Props = { onComplete: () => void };

export function OnboardingPrompts({ onComplete }: Props) {
  const [index, setIndex] = useState(-1); // -1 = not started
  const [visible, setVisible] = useState(false);
  const [aborted, setAborted] = useState(false);

  // Initial start
  useEffect(() => {
    const t = window.setTimeout(() => {
      setIndex(0);
      setVisible(true);
    }, 2000);
    return () => window.clearTimeout(t);
  }, []);

  // Sequence each prompt: visible 4s, fade 400ms, gap, then next
  useEffect(() => {
    if (index < 0 || aborted) return;
    if (index >= PROMPTS.length) {
      onComplete();
      return;
    }
    setVisible(true);
    const visT = window.setTimeout(() => setVisible(false), 4000);
    const nextT = window.setTimeout(() => setIndex(i => i + 1), 4000 + 400);
    return () => { window.clearTimeout(visT); window.clearTimeout(nextT); };
  }, [index, aborted, onComplete]);

  // Abort on any user interaction
  useEffect(() => {
    const abort = () => { setAborted(true); setVisible(false); onComplete(); };
    window.addEventListener("keydown", abort, { once: true });
    window.addEventListener("pointerdown", abort, { once: true });
    return () => {
      window.removeEventListener("keydown", abort);
      window.removeEventListener("pointerdown", abort);
    };
  }, [onComplete]);

  if (aborted || index < 0 || index >= PROMPTS.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center">
      <div
        key={index}
        className="font-mono text-[13px] motion-reduce:!animate-none"
        style={{
          letterSpacing: "0.04em",
          color: "hsl(var(--text-primary))",
          textShadow: "0 1px 8px rgba(0,0,0,0.6)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(-4px)",
          transition: "opacity 400ms ease-out, transform 400ms ease-out",
          animation: visible ? "promptRise 400ms ease-out both" : undefined,
        }}
      >
        {PROMPTS[index]}
      </div>
      <style>{`
        @keyframes promptRise {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
