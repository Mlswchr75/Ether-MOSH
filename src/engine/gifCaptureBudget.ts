export type GifCaptureDevice = { hardwareConcurrency?: number; coarsePointer?: boolean };

export function resolveGifCaptureBudget(device: GifCaptureDevice, requestedFps: number, requestedMaxWidth: number) {
  const cores = device.hardwareConcurrency ?? 8;
  const constrained = device.coarsePointer === true && cores <= 4;
  return constrained
    ? { fps: Math.min(requestedFps, 10), maxWidth: Math.min(requestedMaxWidth, 400) }
    : { fps: requestedFps, maxWidth: requestedMaxWidth };
}

export function currentGifCaptureDevice(): GifCaptureDevice {
  let coarsePointer = false;
  try { coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false; } catch {}
  return { hardwareConcurrency: navigator.hardwareConcurrency, coarsePointer };
}
