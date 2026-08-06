import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-background text-foreground">
      <Helmet><title>404 — MOSH</title></Helmet>
      <div className="pointer-events-none absolute inset-0 scanline opacity-40" />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <div
          className="mosh-text font-sans text-[18vw] font-bold leading-none tracking-tighter"
          data-text="404"
          aria-hidden="true"
        >
          404
        </div>
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-foreground/50">
          signal lost — page not found
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-2 border border-border/70 px-6 py-2.5 font-mono text-xs uppercase tracking-[0.3em] text-foreground/70 transition hover:border-accent hover:text-accent"
        >
          ← back to home
        </button>
      </motion.div>
    </main>
  );
}
