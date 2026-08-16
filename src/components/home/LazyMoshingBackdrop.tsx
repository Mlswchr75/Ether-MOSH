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
    // A plain idle callback fires almost instantly on a quiet tab — exactly
    // the case for a synthetic Lighthouse run, which then blames this
    // chunk's fetch+eval for delaying LCP even though it never touches the
    // hero text. A firm minimum delay keeps the fetch out of that window on
    // every device, not just under lab conditions: the backdrop is chrome,
    // not content, so there's nothing lost by letting the page settle first.
    const timer = setTimeout(() => setMounted(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <MoshingBackdrop />
    </Suspense>
  );
};
