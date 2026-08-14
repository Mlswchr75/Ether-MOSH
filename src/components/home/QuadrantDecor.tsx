import { motion } from "framer-motion";
import { KEEP_OUT } from "./GlitchWordField";

/** Collage-style corner markings — crop marks, coordinates, registration dots.
 *
 *  Each mark reserves its own box so the word field routes around it; they are
 *  small and fixed, and a word landing across a crop mark reads as a mistake
 *  rather than as collage. */
export const QuadrantDecor = () => (
  <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
    {/* top-left crop mark */}
    <motion.div
      {...KEEP_OUT}
      initial={{ opacity: 0, scaleX: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
      transition={{ duration: 0.5, delay: 1.8, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "top left" }}
      className="absolute left-4 top-16 h-6 w-6 border-l border-t border-foreground/25"
    />
    {/* top-right coordinates */}
    <motion.div
      {...KEEP_OUT}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, delay: 2.05 }}
      className="absolute right-5 top-20 font-mono text-[9px] tracking-[0.3em] text-foreground/30"
    >
      52.3°N / 4.9°E
    </motion.div>
    {/* bottom-left registration dot */}
    <motion.div
      {...KEEP_OUT}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 2.1 }}
      className="absolute bottom-24 left-5 flex items-center gap-2"
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full border border-foreground/40" />
      <span className="font-mono text-[9px] tracking-[0.3em] text-foreground/30">reg.00</span>
    </motion.div>
    {/* bottom-right crop mark */}
    <motion.div
      {...KEEP_OUT}
      initial={{ opacity: 0, scaleX: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
      transition={{ duration: 0.5, delay: 1.9, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: "bottom right" }}
      className="absolute bottom-24 right-4 h-6 w-6 border-b border-r border-foreground/25"
    />
  </div>
);
