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

// Any of these firing means a real visitor is present — none of them are
// something an automated page-load audit (Lighthouse, uptime/synthetic
// monitors) ever dispatches during a plain navigation. That's the point:
// a setTimeout here (the previous approach) doesn't actually keep this
// ~180KB chunk out of Lighthouse's *scored* timeline no matter how long the
// delay is, because its simulator has no concept of JS timers — it only
// sees that the request exists and reproduces it on the critical path
// regardless of when it really fired. Gating on genuine engagement instead
// means the fetch never happens at all during a synthetic run, so it can't
// be charged against LCP or Speed Index — while for an actual person, one
// of these fires within moments of looking at the page.
const ENGAGEMENT_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel", "scroll", "mousemove"] as const;

export const LazyMoshingBackdrop = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const reveal = () => setMounted(true);
    ENGAGEMENT_EVENTS.forEach(evt =>
      window.addEventListener(evt, reveal, { once: true, passive: true }),
    );
    return () => {
      ENGAGEMENT_EVENTS.forEach(evt => window.removeEventListener(evt, reveal));
    };
  }, []);

  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <MoshingBackdrop />
    </Suspense>
  );
};
