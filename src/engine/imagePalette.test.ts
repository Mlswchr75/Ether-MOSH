import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractPalette } from "./imagePalette";

class FakeWorker {
  static instances: FakeWorker[] = [];
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  lastMessage: { id: number } | null = null;
  constructor(public url: URL, public opts: unknown) { FakeWorker.instances.push(this); }
  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  postMessage(msg: { id: number }) { this.lastMessage = msg; }
  terminate() {}
  emit(type: string, payload: unknown = {}) {
    for (const cb of [...(this.listeners[type] ?? [])]) cb(payload);
  }
}

const TIMED_OUT = Symbol("timed-out");
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([
    promise,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ]);
}

function fakeSourceImage(): HTMLCanvasElement {
  return document.createElement("canvas");
}

/** extractPalette awaits bitmapFromSource before touching the worker, so
 *  callers need to yield at least one tick before the worker singleton and
 *  its pending request are actually registered. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("extractPalette", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: false,
      drawImage: () => {},
      getImageData: () => new ImageData(64, 64),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves in-flight requests with a fallback profile when the worker errors, instead of hanging forever", async () => {
    // Regression: the worker's error listener terminated and dropped the
    // worker reference but never settled the `pending` map's callbacks — any
    // extractPalette() call already awaiting that worker would hang forever.
    const first = extractPalette(fakeSourceImage());
    const second = extractPalette(fakeSourceImage());
    await flush();
    // Both requests share the one lazily-created worker singleton.
    expect(FakeWorker.instances).toHaveLength(1);

    FakeWorker.instances[0].emit("error");

    const [firstResult, secondResult] = await Promise.all([
      withTimeout(first, 200),
      withTimeout(second, 200),
    ]);
    expect(firstResult).not.toBe(TIMED_OUT);
    expect(secondResult).not.toBe(TIMED_OUT);
    expect((firstResult as { biome: string }).biome).toBeTruthy();
    expect((secondResult as { biome: string }).biome).toBeTruthy();
  });

  it("still resolves normally when the worker replies with a real message", async () => {
    const request = extractPalette(fakeSourceImage());
    await flush();
    const worker = FakeWorker.instances[0];
    const sentId = worker.lastMessage?.id;
    worker.emit("message", { data: { id: sentId, profile: { biome: "acid-reactor" } } });
    const result = await withTimeout(request, 200);
    expect(result).not.toBe(TIMED_OUT);
    expect((result as { biome: string }).biome).toBe("acid-reactor");
  });
});
