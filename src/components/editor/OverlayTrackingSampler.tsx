import { useEffect, useMemo } from "react";
import { segmentationEngine } from "@/engine/SegmentationEngine";
import { semanticTrackingEngine } from "@/engine/overlay/SemanticTrackingEngine";
import { setTrackedTarget, targetFromMask, targetFromPoint } from "@/engine/overlay/tracking";
import { useOverlayStore } from "@/store/useOverlayStore";
import { useStore } from "@/store/useStore";

/**
 * Low-frequency vision sampler for overlay tracking. It updates a tiny module
 * registry rather than Zustand, so visual followers can read targets every
 * frame without causing React rerenders.
 */
export function OverlayTrackingSampler() {
  const video = useStore(s => s.videoElement);
  const entities = useOverlayStore(s => s.entities);
  const trackedKinds = useMemo(() => Array.from(new Set(
    entities.filter(entity => entity.tracking?.enabled).map(entity => entity.tracking!.target),
  )).sort(), [entities]);
  const key = trackedKinds.join("|");

  useEffect(() => {
    if (!video || !trackedKinds.length) return;
    let cancelled = false;
    let timer = 0;

    if (trackedKinds.includes("person")) void segmentationEngine.loadAuto();
    if (trackedKinds.includes("hand")) void semanticTrackingEngine.loadHands();
    if (trackedKinds.includes("face")) void semanticTrackingEngine.loadFaces();

    const sample = () => {
      if (cancelled || !video || video.readyState < 2) return;
      const now = performance.now();

      if (trackedKinds.includes("person")) {
        const mask = segmentationEngine.segmentAuto(video, now);
        setTrackedTarget("person", mask ? targetFromMask(mask, 0.45, now) : null);
      }

      if (trackedKinds.includes("hand")) {
        setTrackedTarget("hand", semanticTrackingEngine.detectHand(video, now));
      }

      if (trackedKinds.includes("face")) {
        setTrackedTarget("face", semanticTrackingEngine.detectFace(video, now));
      }

      if (trackedKinds.includes("object") || trackedKinds.includes("journey")) {
        const point = segmentationEngine.analyzeSaliency(video, 1)[0];
        const target = point ? targetFromPoint(point.x, point.y, Math.min(1, point.score / 1000), now) : null;
        if (trackedKinds.includes("object")) setTrackedTarget("object", target);
        if (trackedKinds.includes("journey")) setTrackedTarget("journey", target);
      }
    };

    const loop = () => {
      sample();
      // Semantic landmark calls are synchronous on web and block the UI thread;
      // ~8Hz is a deliberate budget, while the overlay itself follows the last
      // target at display cadence in its own RAF.
      timer = window.setTimeout(loop, 120);
    };
    loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const kind of trackedKinds) setTrackedTarget(kind, null);
    };
    // key is the stable semantic signature for which detectors are needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, key]);

  return null;
}
