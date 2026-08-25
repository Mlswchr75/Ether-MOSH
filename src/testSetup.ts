// jsdom (pinned to v20 via vitest) implements neither ImageData nor
// IntersectionObserver. Both are used by real app code exercised in tests
// (vector tracing/sticker suitability scoring, JourneyPortal's visibility
// gating), so without these polyfills those tests fail with
// "ReferenceError: X is not defined" rather than testing anything.

class ImageDataPolyfill {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: PredefinedColorSpace = "srgb";

  constructor(width: number, height: number, settings?: ImageDataSettings);
  constructor(data: Uint8ClampedArray, width: number, height?: number, settings?: ImageDataSettings);
  constructor(
    dataOrWidth: Uint8ClampedArray | number,
    widthOrHeight: number,
    heightOrSettings?: number | ImageDataSettings,
    maybeSettings?: ImageDataSettings,
  ) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      const width = widthOrHeight;
      const height = typeof heightOrSettings === "number" ? heightOrSettings : dataOrWidth.length / 4 / width;
      if (dataOrWidth.length !== width * height * 4) {
        throw new RangeError("ImageData: data length does not match width/height");
      }
      this.data = dataOrWidth;
      this.width = width;
      this.height = height;
      this.colorSpace = maybeSettings?.colorSpace ?? "srgb";
    } else {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      const settings = heightOrSettings as ImageDataSettings | undefined;
      this.colorSpace = settings?.colorSpace ?? "srgb";
    }
  }
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}

class IntersectionObserverPolyfill implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
    this.callback = callback;
  }

  observe(target: Element) {
    // Tests never scroll a real viewport, so report targets as intersecting
    // immediately rather than leaving observers permanently unfired.
    const entry = {
      isIntersecting: true,
      target,
      time: 0,
      boundingClientRect: target.getBoundingClientRect?.() ?? ({} as DOMRectReadOnly),
      intersectionRatio: 1,
      intersectionRect: {} as DOMRectReadOnly,
      rootBounds: null,
    } as IntersectionObserverEntry;
    this.callback([entry], this);
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = IntersectionObserverPolyfill as unknown as typeof IntersectionObserver;
}
