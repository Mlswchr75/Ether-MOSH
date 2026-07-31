import * as THREE from "three";
import { EFFECTS_BY_ID } from "./effects";
import { BLEND_INDEX, COMPOSITOR_FRAG, PASSTHROUGH_VERT, type BlendMode } from "./blend";
import {
  DEFAULT_TILE_UNIFORMS,
  TILE_FREQ_FRAG,
  TILE_OFFSET_FRAG,
  type TileMode,
  type TileUniforms,
} from "./tile";

const getInitialRenderScale = () => {
  if (typeof window === "undefined") return 0.75;
  return window.innerWidth < 768 ? 0.58 : 0.72;
};

export type RenderLayer = {
  id: string;
  effectId: string;
  hidden: boolean;
  opacity: number;
  blend: BlendMode;
  /** map of param key -> value (already modulated for this frame) */
  params: Record<string, number>;
};

type ShaderEntry = {
  material: THREE.ShaderMaterial;
};

export class MoshRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private rtA!: THREE.WebGLRenderTarget;
  private rtB!: THREE.WebGLRenderTarget;
  private rtC!: THREE.WebGLRenderTarget;
  private sourceTex: THREE.Texture | null = null;
  private sourceAspect = 1;
  private cssWidth = 1;
  private cssHeight = 1;
  /** internal framebuffer scale (1 = full res, 0.5 = half) */
  private renderScale = getInitialRenderScale();
  /** cache of compiled effect shaders */
  private shaderCache = new Map<string, ShaderEntry>();
  private compositor: THREE.ShaderMaterial;
  private blitMaterial: THREE.ShaderMaterial;
  private sourceFillMaterial: THREE.ShaderMaterial;
  private warmupHandle: number | null = null;
  private startTime = performance.now();
  // Tile pass — post-process after the effect stack, before screen blit.
  private tileMaterial: THREE.ShaderMaterial | null = null;
  private rtTile: THREE.WebGLRenderTarget | null = null;
  private _tileMode: TileMode = "none";
  private _tileUniforms: TileUniforms = { ...DEFAULT_TILE_UNIFORMS };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      preserveDrawingBuffer: true, // needed for export
      premultipliedAlpha: false,
      alpha: true,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setClearColor(0x000000, 0);

    const geom = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geom);
    this.scene.add(this.quad);

    this.compositor = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: COMPOSITOR_FRAG,
      uniforms: {
        uPrev: { value: null },
        uCur: { value: null },
        uOpacity: { value: 1 },
        uMode: { value: 0 },
      },
    });

    this.blitMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `precision mediump float; varying vec2 vUv; uniform sampler2D uTex; void main(){ gl_FragColor = texture2D(uTex, vUv); }`,
      uniforms: { uTex: { value: null } },
      depthTest: false,
      depthWrite: false,
    });

    // Source pass: "cover" the destination — crop overflow rather than letterbox.
    this.sourceFillMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec2 uCover;
        void main(){
          vec2 uv = (vUv - 0.5) * uCover + 0.5;
          gl_FragColor = texture2D(uTex, clamp(uv, 0.0, 1.0));
        }
      `,
      uniforms: { uTex: { value: null }, uCover: { value: new THREE.Vector2(1, 1) } },
      depthTest: false,
      depthWrite: false,
    });

    this.allocTargets(2, 2);
  }

  private allocTargets(w: number, h: number) {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtC?.dispose();
    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtB = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtC = new THREE.WebGLRenderTarget(w, h, opts);
    if (this.rtTile) {
      this.rtTile.dispose();
      this.rtTile = new THREE.WebGLRenderTarget(w, h, opts);
    }
  }

  /** True when the source canvas/video updates each frame. */
  private perFrameUpdate = false;

  setSourceImage(image: HTMLImageElement) {
    // Draw into a Canvas2D first so Three.js gets a CanvasTexture — the same
    // upload path as the procedural source which is known to work on mobile.
    // new THREE.Texture(HTMLImageElement) + needsUpdate can fail silently on
    // iOS Safari when the image comes from a blob URL.
    const w = image.naturalWidth || image.width || 1;
    const h = image.naturalHeight || image.height || 1;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(image, 0, 0, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.sourceTex?.dispose();
    this.sourceTex = tex;
    this.sourceAspect = w / h;
    this.perFrameUpdate = false;
    this.resize(this.cssWidth, this.cssHeight);
    this.scheduleWarmup();
  }

  /** Use a self-updating Canvas2D buffer (procedural ambient) as the source. */
  setSourceCanvas(canvas: HTMLCanvasElement) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    this.sourceTex?.dispose();
    this.sourceTex = tex;
    this.sourceAspect = canvas.width / canvas.height;
    this.perFrameUpdate = true;
    this.resize(this.cssWidth, this.cssHeight);
    this.scheduleWarmup();
  }

  /** Use a live <video> (camera / MediaStream) as the source. GPU-uploaded
   *  via THREE.VideoTexture for smooth performance — no Canvas2D readback. */
  setSourceVideo(video: HTMLVideoElement) {
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.sourceTex?.dispose();
    this.sourceTex = tex;
    const w = video.videoWidth || 16;
    const h = video.videoHeight || 9;
    this.sourceAspect = w / h;
    // VideoTexture auto-updates each render — no manual needsUpdate needed.
    this.perFrameUpdate = false;
    this.resize(this.cssWidth, this.cssHeight);
    this.scheduleWarmup();
  }

  /** Refresh aspect after video metadata becomes available. */
  refreshSourceAspect() {
    const tex = this.sourceTex as any;
    const v = tex?.image as HTMLVideoElement | undefined;
    if (v && v.videoWidth && v.videoHeight) {
      this.sourceAspect = v.videoWidth / v.videoHeight;
      this.resize(this.cssWidth, this.cssHeight);
    }
  }

  /** Set canvas CSS size; renderer always fills the viewport (cover). */
  resize(cssW: number, cssH: number) {
    this.cssWidth = cssW;
    this.cssHeight = cssH;
    if (!this.sourceTex) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Cover: canvas matches the container exactly; image cropping happens in
    // the source-fill shader via UV remap (uCover).
    const drawW = cssW;
    const drawH = cssH;
    const pxW = Math.max(1, Math.round(drawW * dpr * this.renderScale));
    const pxH = Math.max(1, Math.round(drawH * dpr * this.renderScale));

    this.renderer.setPixelRatio(dpr * this.renderScale);
    this.renderer.setSize(drawW, drawH, true);
    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;

    // Cover-fit UV scale — see cover formula in sourceFillMaterial.
    const dstA = drawW / Math.max(1, drawH);
    const srcA = this.sourceAspect || 1;
    const coverX = Math.min(1, dstA / srcA);
    const coverY = Math.min(1, srcA / dstA);
    (this.sourceFillMaterial.uniforms.uCover.value as THREE.Vector2).set(coverX, coverY);

    if (this.rtA.width !== pxW || this.rtA.height !== pxH) {
      this.allocTargets(pxW, pxH);
    }
  }

  setRenderScale(scale: number) {
    this.renderScale = Math.max(0.42, Math.min(0.9, scale));
    this.resize(this.cssWidth, this.cssHeight);
  }

  private scheduleWarmup() {
    if (this.warmupHandle != null) return;
    this.warmupHandle = window.setTimeout(() => {
      this.warmupHandle = null;
      if (!this.sourceTex) return;
      const previous = this.quad.material;
      for (const def of Object.values(EFFECTS_BY_ID)) {
        const entry = this.getShader(def.id);
        const uni = entry.material.uniforms;
        uni.uTex.value = this.sourceTex;
        (uni.uResolution.value as THREE.Vector2).set(this.rtA.width, this.rtA.height);
        uni.uTime.value = 0;
        uni.uPulse.value = 0;
        this.quad.material = entry.material;
        this.renderer.compile(this.scene, this.camera);
      }
      this.quad.material = this.compositor;
      this.renderer.compile(this.scene, this.camera);
      this.quad.material = previous;
    }, 120);
  }

  private getShader(effectId: string): ShaderEntry {
    let entry = this.shaderCache.get(effectId);
    if (entry) return entry;
    const def = EFFECTS_BY_ID[effectId];
    const uniforms: Record<string, THREE.IUniform> = {
      uTex: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPulse: { value: 0 },
    };
    for (const p of def.params) {
      uniforms[`u${p.key[0].toUpperCase() + p.key.slice(1)}`] = { value: p.default };
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: def.frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    entry = { material: mat };
    this.shaderCache.set(effectId, entry);
    return entry;
  }

  /** Render a frame with the supplied layer stack. `pulse` is 0..1 beat envelope. */
  render(layers: RenderLayer[], pulse = 0) {
    if (!this.sourceTex) {
      this.renderer.setRenderTarget(null);
      this.renderer.clear();
      return;
    }
    const time = (performance.now() - this.startTime) / 1000;
    const w = this.rtA.width, h = this.rtA.height;

    // Procedural / video sources need per-frame texture uploads.
    if (this.perFrameUpdate && this.sourceTex) this.sourceTex.needsUpdate = true;

    // Step 1 — render source into rtA, cover-fitted to the viewport.
    this.sourceFillMaterial.uniforms.uTex.value = this.sourceTex;
    this.quad.material = this.sourceFillMaterial;
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.render(this.scene, this.camera);

    const targets = [this.rtA, this.rtB, this.rtC];
    let read = this.rtA;

    for (const layer of layers) {
      if (layer.hidden) continue;
      const def = EFFECTS_BY_ID[layer.effectId];
      if (!def) continue;
      const entry = this.getShader(layer.effectId);
      const uni = entry.material.uniforms;
      const effectTarget = targets.find(t => t !== read)!;
      const compositeTarget = targets.find(t => t !== read && t !== effectTarget)!;

      uni.uTex.value = read.texture;
      (uni.uResolution.value as THREE.Vector2).set(w, h);
      uni.uTime.value = time;
      uni.uPulse.value = pulse;
      for (const p of def.params) {
        const k = `u${p.key[0].toUpperCase() + p.key.slice(1)}`;
        uni[k].value = layer.params[p.key] ?? p.default;
      }
      // Render effect into write target (single full-screen pass)
      this.quad.material = entry.material;
      this.renderer.setRenderTarget(effectTarget);
      this.renderer.render(this.scene, this.camera);

      if (layer.blend === "normal" && layer.opacity >= 0.995) {
        read = effectTarget;
        continue;
      }

      // Composite effect over the accumulated result into a third target.
      // Never sample from and render into the same WebGLRenderTarget; stronger
      // MOSH stacks use 3+ layers, and feedback loops can blank/corrupt output.
      this.compositor.uniforms.uPrev.value = read.texture;
      this.compositor.uniforms.uCur.value = effectTarget.texture;
      this.compositor.uniforms.uOpacity.value = layer.opacity;
      this.compositor.uniforms.uMode.value = BLEND_INDEX[layer.blend];
      this.quad.material = this.compositor;
      this.renderer.setRenderTarget(compositeTarget);
      this.renderer.render(this.scene, this.camera);
      read = compositeTarget;
    }

    // --- Tile pass (post-process, before screen blit) ---
    let finalTex = read.texture;
    if (this._tileMode !== "none" && this.tileMaterial && this.rtTile) {
      this.tileMaterial.uniforms.uTex.value = read.texture;
      this.quad.material = this.tileMaterial;
      this.renderer.setRenderTarget(this.rtTile);
      this.renderer.render(this.scene, this.camera);
      finalTex = this.rtTile.texture;
    }

    // Final blit to screen
    this.blitMaterial.uniforms.uTex.value = finalTex;
    this.quad.material = this.blitMaterial;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  setTile(mode: TileMode, uniforms: Partial<TileUniforms> = {}): void {
    this._tileMode = mode;
    this._tileUniforms = { ...this._tileUniforms, ...uniforms };
    if (mode === "none") {
      this.tileMaterial?.dispose();
      this.tileMaterial = null;
      this.rtTile?.dispose();
      this.rtTile = null;
      return;
    }
    const frag = mode === "seamless" ? TILE_OFFSET_FRAG
               :                       TILE_FREQ_FRAG;
    this.tileMaterial?.dispose();
    this.tileMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: frag,
      uniforms: {
        uTex:    { value: null },
        uAngle:  { value: this._tileUniforms.angle },
        uScale:  { value: this._tileUniforms.scale },
        uPhaseX: { value: this._tileUniforms.phaseX },
        uPhaseY: { value: this._tileUniforms.phaseY },
        uBlend:  { value: this._tileUniforms.blend },
        uBlur:   { value: this._tileUniforms.blur },
      },
      depthTest: false,
      depthWrite: false,
    });
    if (!this.rtTile) {
      this.rtTile = new THREE.WebGLRenderTarget(this.rtA.width, this.rtA.height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }
  }

  updateTileUniforms(uniforms: Partial<TileUniforms>): void {
    this._tileUniforms = { ...this._tileUniforms, ...uniforms };
    if (!this.tileMaterial) return;
    const u = this.tileMaterial.uniforms;
    if ("angle"  in uniforms) u.uAngle.value  = uniforms.angle!;
    if ("scale"  in uniforms) u.uScale.value  = uniforms.scale!;
    if ("phaseX" in uniforms) u.uPhaseX.value = uniforms.phaseX!;
    if ("phaseY" in uniforms) u.uPhaseY.value = uniforms.phaseY!;
    if ("blend"  in uniforms) u.uBlend.value  = uniforms.blend!;
    if ("blur"   in uniforms) u.uBlur.value   = uniforms.blur!;
  }

  /** Read final pixels back as ImageData at current resolution. */
  readPixels(): { data: Uint8Array; width: number; height: number } {
    const w = this.rtA.width, h = this.rtA.height;
    // Final result lives wherever last compositor wrote; easier: re-render to a known buffer
    // For export we use a dedicated method — see export.ts which calls render() then reads canvas.
    return { data: new Uint8Array(0), width: w, height: h };
  }

  dispose() {
    if (this.warmupHandle != null) window.clearTimeout(this.warmupHandle);
    this.shaderCache.forEach(e => e.material.dispose());
    this.shaderCache.clear();
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtC.dispose();
    this.sourceTex?.dispose();
    this.compositor.dispose();
    this.blitMaterial.dispose();
    this.sourceFillMaterial.dispose();
    this.tileMaterial?.dispose();
    this.rtTile?.dispose();
    this.renderer.dispose();
  }
}
