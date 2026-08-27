import { lazy, Suspense, useEffect, useRef, useState } from "react";

/**
 * DemoReelPanel is scroll-adjacent, not hidden behind interaction like the
 * MoshingBackdrop — a real visitor reaches it with one swipe. So this can't
 * gate on "has anyone touched the page" the way LazyMoshingBackdrop does.
 *
 * Instead it gates on actual visibility, via IntersectionObserver on this
 * placeholder — the same mechanism behind native `loading="lazy"` on
 * images. That keeps the panel (and the 522-product demo-reel fetch,
 * PortalShapeGallery's layout work, everything downstream of it) off the
 * critical path for anyone who never scrolls there, without treating a
 * synthetic run any differently than a real visitor: both get the content
 * exactly when it's about to enter view, neither before nor after.
 *
 * rootMargin is intentionally 0: every section here is exactly one
 * viewport tall (snap-y), so this sentinel's top edge sits flush with the
 * bottom edge of the hero section. Any positive margin — even a couple
 * hundred px meant as a "preload a little early" buffer — puts the trigger
 * distance at effectively zero on most screens, so it fires as soon as the
 * hero paints instead of waiting for an actual scroll.
 */
const DemoReelPanel = lazy(() =>
  import("./DemoReelPanel").then(m => ({ default: m.DemoReelPanel })),
);

type Props = {
  onSelect: (src: string, productUrl: string) => void;
};

export const LazyDemoReelPanel = ({ onSelect }: Props) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some(e => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!visible) return <div ref={sentinelRef} className="h-screen w-screen shrink-0 snap-start bg-background" />;

  return (
    <Suspense fallback={<div className="h-screen w-screen shrink-0 snap-start bg-background" />}>
      <DemoReelPanel onSelect={onSelect} />
    </Suspense>
  );
};
