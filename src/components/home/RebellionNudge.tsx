import { motion } from "framer-motion";

/** Bottom-right manifesto whisper. Pure decor — pointer events stay off. */
export const RebellionNudge = () => (
  <motion.div
    aria-hidden="true"
    initial={{ opacity: 0, x: 14, rotate: 2 }}
    animate={{ opacity: 1, x: 0, rotate: 2 }}
    transition={{ duration: 0.7, delay: 2.25, ease: [0.22, 1, 0.36, 1] }}
    className="pointer-events-none absolute bottom-[7%] right-[5%] z-10 hidden max-w-[180px] text-right font-mono text-[9px] uppercase leading-relaxed tracking-[0.3em] text-foreground/35 md:block"
  >
    treat every pixel
    <br />
    as negotiable
  </motion.div>
);
