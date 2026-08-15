declare module "gifenc" {
  export type GifPalette = number[][];
  export type GifPixelData = Uint8Array | Uint8ClampedArray;
  export type GifColorFormat = "rgb565" | "rgb444" | "rgba4444";

  export type QuantizeOptions = {
    format?: GifColorFormat;
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    oneBitAlpha?: boolean | number;
    useSqrt?: boolean;
  };

  export type GifFrameOptions = {
    palette?: GifPalette | null;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    delay?: number;
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
  };

  export type GifEncoder = {
    writeFrame(index: Uint8Array, width: number, height: number, options?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
    writeHeader(): void;
    readonly buffer: ArrayBuffer;
  };

  export function GIFEncoder(options?: {
    auto?: boolean;
    initialCapacity?: number;
  }): GifEncoder;
  export function quantize(
    rgba: GifPixelData,
    maxColors: number,
    options?: QuantizeOptions,
  ): GifPalette;
  export function applyPalette(
    rgba: GifPixelData,
    palette: GifPalette,
    format?: GifColorFormat,
  ): Uint8Array;
}
