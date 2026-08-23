export type OverlayDeviceProfile = { coarse: boolean; cores: number };
export type OverlayPerformanceBudget = { lottieSwarmCap: number; rasterSwarmCap: number; semanticTrackingHz: number };

export function overlayPerformanceBudget(profile: OverlayDeviceProfile): OverlayPerformanceBudget {
  const lowCore = profile.cores <= 4;
  if (profile.coarse && lowCore) return { lottieSwarmCap: 6, rasterSwarmCap: 18, semanticTrackingHz: 6 };
  if (profile.coarse) return { lottieSwarmCap: 8, rasterSwarmCap: 24, semanticTrackingHz: 7 };
  if (lowCore) return { lottieSwarmCap: 8, rasterSwarmCap: 24, semanticTrackingHz: 7 };
  return { lottieSwarmCap: 12, rasterSwarmCap: 32, semanticTrackingHz: 8 };
}

export function currentOverlayPerformanceBudget(): OverlayPerformanceBudget {
  if (typeof window === "undefined" || typeof navigator === "undefined") return overlayPerformanceBudget({ coarse: false, cores: 8 });
  return overlayPerformanceBudget({
    coarse: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    cores: navigator.hardwareConcurrency || 4,
  });
}
