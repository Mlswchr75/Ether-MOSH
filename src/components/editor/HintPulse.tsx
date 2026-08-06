import { useEffect, useState } from "react";

type Props = {
  /** localStorage key to remember dismissal */
  storageKey: string;
  /** ms after mount before showing (default 0) */
  delay?: number;
};

const FREQ_HZ = 1.5;
const CYCLES = 3;
const TOTAL_MS = (CYCLES * 1000) / FREQ_HZ;

export function isHintDismissed(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

export function dismissHint(key: string) {
  try { localStorage.setItem(key, "1"); } catch {}
}

/**
 * 6px accent-color circle that pulses 0.4 → 1.0 → 0.4 at 1.5Hz for 3 cycles
 * then fades out. Self-dismisses and writes to localStorage.
 */
export function HintPulse({ storageKey, delay = 0 }: Props) {
  const [visible, setVisible] = useState(delay === 0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isHintDismissed(storageKey)) { setDone(true); return; }
    const onT = window.setTimeout(() => setVisible(true), delay);
    const offT = window.setTimeout(() => {
      setVisible(false);
      dismissHint(storageKey);
      setDone(true);
    }, delay + TOTAL_MS);
    return () => { window.clearTimeout(onT); window.clearTimeout(offT); };
  }, [delay, storageKey]);

  if (done) return null;

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-1 -right-1 motion-reduce:!animate-none"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "hsl(var(--accent))",
        boxShadow: "0 0 6px hsl(var(--accent))",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease-out",
        animation: visible ? `hintPulse ${1000 / FREQ_HZ}ms ease-in-out infinite` : undefined,
      }}
    />
  );
}
