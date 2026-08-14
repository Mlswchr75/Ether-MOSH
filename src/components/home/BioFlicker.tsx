import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { KEEP_OUT } from "./GlitchWordField";

const FRAGMENTS = [
  "signal acquired",
  "buffer overrun — embraced",
  "destruction is design",
  "105 shaders idle",
  "beat sync armed",
  "gpu: hungry",
  "reality: optional",
  "aesthetic rebellion",
];

/** Bio fragments that flicker in and out across the visualizer. */
export const BioFlicker = () => {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setVisible(true);
      window.setTimeout(() => { if (alive) setVisible(false); }, 1600 + Math.random() * 1200);
      window.setTimeout(() => {
        if (!alive) return;
        setIdx(i => (i + 1) % FRAGMENTS.length);
        tick();
      }, 3400 + Math.random() * 2600);
    };
    const boot = window.setTimeout(tick, 1200);
    return () => { alive = false; window.clearTimeout(boot); };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      {/* The band is reserved permanently, not just while a fragment is up:
          the fragments come and go, and a word field that only avoided the
          visible ones would place a word into the gap right before the next
          fragment flickered in on top of it. */}
      <div
        {...KEEP_OUT}
        className="absolute left-[8%] top-[62%] h-[14px] w-[26ch] max-w-[42vw]"
      >
        <AnimatePresence mode="wait">
          {visible && (
            <motion.span
              key={idx}
              initial={{ opacity: 0, x: -10, skewX: -8 }}
              animate={{ opacity: 1, x: 0, skewX: 0 }}
              exit={{ opacity: 0, x: 10, skewX: 8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute left-0 top-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.35em] text-accent/70"
            >
              {FRAGMENTS[idx]}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
