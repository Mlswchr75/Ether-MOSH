import { lazy, Suspense, useEffect, useState } from "react";

/**
 * True dynamic import — not just a deferred mount. Importing MoshingBackdrop
 * statically (even behind a mount gate) still pulls its module, and with it
 * the ~180KB Renderer/effects engine, into the eagerly-fetched initial script
 * graph: bundlers resolve imports by what's referenced, not by when a
 * component happens to render. React.lazy() is what actually keeps that code
 * out of the critical path until this component decides to ask for it.
 */
const MoshingBackdrop = lazy(() =>
  import("./MoshingBackdrop").then(m => ({ default: m.MoshingBackdrop })),
);

export const LazyMoshingBackdrop = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => setMounted(true), { timeout: 2000 });
    } else {
      setTimeout(() => setMounted(true), 0);
    }
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <MoshingBackdrop />
    </Suspense>
  );
};
