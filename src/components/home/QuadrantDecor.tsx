/** Collage-style corner markings — crop marks, coordinates, registration dots. */
export const QuadrantDecor = () => (
  <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
    {/* top-left crop mark */}
    <div className="absolute left-4 top-16 h-6 w-6 border-l border-t border-foreground/25" />
    {/* top-right coordinates */}
    <div className="absolute right-5 top-20 font-mono text-[9px] tracking-[0.3em] text-foreground/30">
      52.3°N / 4.9°E
    </div>
    {/* bottom-left registration dot */}
    <div className="absolute bottom-24 left-5 flex items-center gap-2">
      <span className="inline-block h-1.5 w-1.5 rounded-full border border-foreground/40" />
      <span className="font-mono text-[9px] tracking-[0.3em] text-foreground/30">reg.00</span>
    </div>
    {/* bottom-right crop mark */}
    <div className="absolute bottom-24 right-4 h-6 w-6 border-b border-r border-foreground/25" />
  </div>
);
