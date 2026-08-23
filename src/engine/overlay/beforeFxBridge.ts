import { MoshRenderer } from "@/engine/Renderer";
import { useOverlayStore } from "@/store/useOverlayStore";
import { BeforeFxCompositor, selectBeforeFxEntities } from "./beforeFx";

type SourceKind = "video" | "image" | "canvas";
type BaseSource = { kind: SourceKind; source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement };
type Runtime = { renderer: MoshRenderer; compositor: BeforeFxCompositor; base: BaseSource | null; compositeActive: boolean };

const runtimes = new Set<Runtime>();
let installed = false;
let raf = 0;

export function installBeforeFxBridge(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const proto = MoshRenderer.prototype;
  const setVideo = proto.setSourceVideo;
  const setImage = proto.setSourceImage;
  const setCanvas = proto.setSourceCanvas;

  const isMain = (renderer: MoshRenderer) => renderer.canvas.matches("[data-mosh-canvas]");
  const getRuntime = (renderer: MoshRenderer) => {
    let runtime = Array.from(runtimes).find(item => item.renderer === renderer);
    if (!runtime) {
      runtime = { renderer, compositor: new BeforeFxCompositor(), base: null, compositeActive: false };
      runtimes.add(runtime);
    }
    return runtime;
  };

  const applyBase = (runtime: Runtime) => {
    if (!runtime.base) return;
    const { renderer, base } = runtime;
    if (base.kind === "video") setVideo.call(renderer, base.source as HTMLVideoElement);
    else if (base.kind === "image") setImage.call(renderer, base.source as HTMLImageElement);
    else setCanvas.call(renderer, base.source as HTMLCanvasElement);
    runtime.compositeActive = false;
  };

  const applyComposite = (runtime: Runtime) => {
    if (!runtime.base) return;
    const { width, height } = sourceSize(runtime.base.source, runtime.renderer.canvas);
    runtime.compositor.resize(width, height);
    setCanvas.call(runtime.renderer, runtime.compositor.canvas);
    runtime.compositeActive = true;
  };

  proto.setSourceVideo = function bridgedVideo(source: HTMLVideoElement) {
    if (!isMain(this)) return setVideo.call(this, source);
    const runtime = getRuntime(this);
    runtime.base = { kind: "video", source };
    if (hasBeforeFx()) applyComposite(runtime); else applyBase(runtime);
  };

  proto.setSourceImage = function bridgedImage(source: HTMLImageElement) {
    if (!isMain(this)) return setImage.call(this, source);
    const runtime = getRuntime(this);
    runtime.base = { kind: "image", source };
    if (hasBeforeFx()) applyComposite(runtime); else applyBase(runtime);
  };

  proto.setSourceCanvas = function bridgedCanvas(source: HTMLCanvasElement) {
    if (!isMain(this) || Array.from(runtimes).some(item => item.compositor.canvas === source)) {
      return setCanvas.call(this, source);
    }
    const runtime = getRuntime(this);
    runtime.base = { kind: "canvas", source };
    if (hasBeforeFx()) applyComposite(runtime); else applyBase(runtime);
  };

  useOverlayStore.subscribe(state => {
    const active = selectBeforeFxEntities(state.entities).length > 0;
    for (const runtime of runtimes) {
      if (!runtime.base) continue;
      if (active && !runtime.compositeActive) applyComposite(runtime);
      if (!active && runtime.compositeActive) applyBase(runtime);
    }
  });

  const tick = () => {
    const entities = useOverlayStore.getState().entities;
    const before = selectBeforeFxEntities(entities);
    for (const runtime of runtimes) {
      if (!runtime.compositeActive || !runtime.base || before.length === 0) continue;
      const { width, height } = sourceSize(runtime.base.source, runtime.renderer.canvas);
      runtime.compositor.resize(width, height);
      runtime.compositor.render(runtime.base.source, before);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function hasBeforeFx(): boolean {
  return selectBeforeFxEntities(useOverlayStore.getState().entities).length > 0;
}

function sourceSize(source: CanvasImageSource, fallback: HTMLCanvasElement): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth || fallback.width || 512, height: source.videoHeight || fallback.height || 512 };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth || fallback.width || 512, height: source.naturalHeight || fallback.height || 512 };
  if (source instanceof HTMLCanvasElement) return { width: source.width || fallback.width || 512, height: source.height || fallback.height || 512 };
  return { width: fallback.width || 512, height: fallback.height || 512 };
}

export function disposeBeforeFxBridgeRaf(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}
