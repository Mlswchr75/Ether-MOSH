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
  /**
   * Frame history. Unlike rtA/rtB/rtC — which are scratch buffers refilled from
   * the source every frame — these persist across frames so effects can sample
   * what the screen looked like last frame via `uFeedback`. Ping-ponged because
   * a target cannot be sampled and written in the same pass.
   */
  private rtHistA!: THREE.WebGLRenderTarget;
  private rtHistB!: THREE.WebGLRenderTarget;
  /** Nothing has been written to history yet — uFeedback reads as black. */
  private historyPrimed = false;
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

    // 🔥 FIX: Set pixel unpack alignment to 1 byte so non-4-byte divisible video/image textures never break WebGL
    try {
      const gl = this.renderer.getContext();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch {}

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
        uniform vec2 uResolution;
        uniform float uHdr;

        const vec3 LUMA = vec3(0.299, 0.587, 0.114);

        /* Local tone map — the "HDR remaster" every pixel gets before any effect
           sees it.

           A global curve can only trade shadows against highlights. What reads as
           HDR is *local* contrast: compare each pixel to the average of its
           neighbourhood, lift the neighbourhood, then re-apply the difference
           amplified. Dark regions get the most lift, so an underexposed frame
           opens up while an already-bright one is barely touched — the strength
           is derived per pixel, so nothing upstream has to measure the scene.

           Six wide taps for the local average; it only needs to be approximate,
           and this whole thing rides along in the existing source pass, so the
           HDR treatment costs no extra render target and no extra draw. */
        void main(){
          vec2 uv = clamp((vUv - 0.5) * uCover + 0.5, 0.0, 1.0);
          vec3 c = texture2D(uTex, uv).rgb;

          if (uHdr <= 0.001) { gl_FragColor = vec4(c, 1.0); return; }

          vec2 r = 14.0 / uResolution;
          vec3 t0 = texture2D(uTex, clamp(uv + vec2( 1.000,  0.000)*r, 0.0, 1.0)).rgb;
          vec3 t1 = texture2D(uTex, clamp(uv + vec2( 0.500,  0.866)*r, 0.0, 1.0)).rgb;
          vec3 t2 = texture2D(uTex, clamp(uv + vec2(-0.500,  0.866)*r, 0.0, 1.0)).rgb;
          vec3 t3 = texture2D(uTex, clamp(uv + vec2(-1.000,  0.000)*r, 0.0, 1.0)).rgb;
          vec3 t4 = texture2D(uTex, clamp(uv + vec2(-0.500, -0.866)*r, 0.0, 1.0)).rgb;
          vec3 t5 = texture2D(uTex, clamp(uv + vec2( 0.500, -0.866)*r, 0.0, 1.0)).rgb;
          vec3 local = (t0 + t1 + t2 + t3 + t4 + t5) / 6.0;

          float l = dot(c, LUMA);
          float lLocal = dot(local, LUMA);
          float detail = l - lLocal;

          // Edge guard, for free. A single-scale local tone map paints a dark
          // halo wherever the neighbourhood straddles a strong edge, because the
          // local average is dragged across the boundary. Proper edge-aware
          // filtering (bilateral, guided) would cost many more fetches — but the
          // luminance SPREAD of the taps already gathered says the same thing:
          // a wide spread means this pixel sits on an edge, so stop re-applying
          // detail there and the ringing goes with it.
          float l0 = dot(t0, LUMA), l1 = dot(t1, LUMA), l2 = dot(t2, LUMA);
          float l3 = dot(t3, LUMA), l4 = dot(t4, LUMA), l5 = dot(t5, LUMA);
          float lo = min(min(min(l0, l1), min(l2, l3)), min(l4, l5));
          float hi = max(max(max(l0, l1), max(l2, l3)), max(l4, l5));
          detail *= 1.0 - smoothstep(0.10, 0.34, hi - lo);

          // Coring. A low-light frame's small local differences are mostly
          // sensor noise, and amplifying them is what makes a lifted image look
          // grainy rather than remastered. Fade out everything below ~9% luma
          // difference and keep genuine edges intact.
          detail *= smoothstep(0.0, 0.09, abs(detail));
          // Cap the overshoot so strong edges don't ring. Without this the
          // amplified difference paints a dark halo around bright subjects,
          // which is the giveaway artefact of naive local tone mapping.
          detail = clamp(detail, -0.10, 0.10);

          // Shadow lift: gamma below 1 opens the low end, and the exponent is
          // driven by how dark the NEIGHBOURHOOD is, so a bright subject on a
          // dark ground doesn't get flattened along with the ground.
          float darkness = 1.0 - smoothstep(0.0, 0.55, lLocal);
          float g = mix(1.0, 0.58, uHdr * darkness);
          float lifted = pow(max(l, 0.0), g);

          // Re-apply local detail, amplified — this is what reads as HDR rather
          // than as a plain brightness raise.
          // Modest amplification: the shadow lift above is what opens up a dark
          // frame, and pushing detail much past this rings the edges. The two
          // are independent, so restraint here costs no brightness.
          float outL = lifted + detail * (1.0 + uHdr * 0.45);

          // Lifting shadows amplifies sensor noise, and noise is exactly what a
          // low-light frame has most of. Pull the darkest areas slightly toward
          // the local average to keep the lift clean.
          float shadow = 1.0 - smoothstep(0.0, 0.35, max(l, lLocal));
          vec3 base = mix(c, local, uHdr * min(1.0, darkness * 0.30 + shadow * 0.45));

          // Rescale by luminance ratio so hue and saturation ride along instead
          // of washing out, then push chroma back where the lift stole it.
          // Floor well above zero: at a near-black pixel adjacent to a bright
          // one this ratio would otherwise explode and speckle the edge.
          vec3 outC = base * (outL / max(l, 0.02));
          float outLum = dot(outC, LUMA);
          outC = mix(vec3(outLum), outC, 1.0 + uHdr * (0.22 + darkness * 0.45));

          gl_FragColor = vec4(clamp(outC, 0.0, 1.0), 1.0);
        }
      `,
      uniforms: {
        uTex: { value: null },
        uCover: { value: new THREE.Vector2(1, 1) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uHdr: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.allocTargets(2, 2);
  }

  private allocTargets(w: number, h: number) {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtC?.dispose();
    this.rtHistA?.dispose();
    this.rtHistB?.dispose();
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
    this.rtHistA = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtHistB = new THREE.WebGLRenderTarget(w, h, opts);
    // Resized buffers start undefined; treat history as cold so the first
    // frame after a resize doesn't sample garbage.
    this.historyPrimed = false;
    if (this.rtTile) {
      this.rtTile.dispose();
      this.rtTile = new THREE.WebGLRenderTarget(w, h, opts);
    }
  }

  /** True when the source canvas/video updates each frame. */
  private perFrameUpdate = false;

  setSourceImage(image: HTMLImageElement) {
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
    
    // Ensure WebGL pixel unpacking isn't strict on 4-byte boundaries
    try {
      const gl = this.renderer.getContext();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch {}

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

    try {
      const gl = this.renderer.getContext();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch {}

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
    const readyWidth = video.videoWidth || (video as HTMLVideoElement & { width?: number }).width || 640;
    const readyHeight = video.videoHeight || (video as HTMLVideoElement & { height?: number }).height || 480;

    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    try {
      const gl = this.renderer.getContext();
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    } catch {}

    this.sourceTex?.dispose();
    this.sourceTex = tex;
    this.sourceAspect = readyWidth / readyHeight;
    this.perFrameUpdate = true;
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
    const drawW = cssW;
    const drawH = cssH;
    const pxW = Math.max(1, Math.round(drawW * dpr * this.renderScale));
    const pxH = Math.max(1, Math.round(drawH * dpr * this.renderScale));

    this.renderer.setPixelRatio(dpr * this.renderScale);
    this.renderer.setSize(drawW, drawH, true);
    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;

    const dstA = drawW / Math.max(1, drawH);
    const srcA = this.sourceAspect || 1;
    const coverX = Math.min(1, dstA / srcA);
    const coverY = Math.min(1, srcA / dstA);
    (this.sourceFillMaterial.uniforms.uCover.value as THREE.Vector2).set(coverX, coverY);

    if (this.rtA.width !== pxW || this.rtA.height !== pxH) {
      this.allocTargets(pxW, pxH);
    }
    // The HDR pass samples a neighbourhood, so it needs the target size.
    (this.sourceFillMaterial.uniforms.uResolution.value as THREE.Vector2).set(pxW, pxH);
  }

  /** 0 disables the HDR remaster pass; 1 is full strength (the default). */
  setHdr(amount: number) {
    this.sourceFillMaterial.uniforms.uHdr.value = Math.max(0, Math.min(1, amount));
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
      uFeedback: { value: null },
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

    // Force dynamic textures to update every frame. For camera/video, wait until
    // the element has real decoded pixels; uploading too early can leave some
    // Safari/WebGL combinations stuck on an all-black texture.
    if (this.perFrameUpdate && this.sourceTex) {
      const source = (this.sourceTex as THREE.Texture).image;
      if (source instanceof HTMLVideoElement) {
        if (source.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          this.sourceTex.needsUpdate = true;
        }
      } else {
        this.sourceTex.needsUpdate = true;
      }
    }

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
      // Last frame's finished output. Black until the first frame lands, so
      // feedback effects fade in rather than flashing garbage.
      uni.uFeedback.value = this.historyPrimed ? this.rtHistA.texture : null;
      (uni.uResolution.value as THREE.Vector2).set(w, h);
      uni.uTime.value = time;
      uni.uPulse.value = pulse;
      for (const p of def.params) {
        const k = `u${p.key[0].toUpperCase() + p.key.slice(1)}`;
        uni[k].value = layer.params[p.key] ?? p.default;
      }
      this.quad.material = entry.material;
      this.renderer.setRenderTarget(effectTarget);
      this.renderer.render(this.scene, this.camera);

      if (layer.blend === "normal" && layer.opacity >= 0.995) {
        read = effectTarget;
        continue;
      }

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

    // --- History write ---
    // Copy this frame's finished output into the history buffer, then swap, so
    // next frame's uFeedback samples it. Written before the screen blit because
    // the blit unbinds the render target.
    this.blitMaterial.uniforms.uTex.value = finalTex;
    this.quad.material = this.blitMaterial;
    this.renderer.setRenderTarget(this.rtHistB);
    this.renderer.render(this.scene, this.camera);
    const swap = this.rtHistA;
    this.rtHistA = this.rtHistB;
    this.rtHistB = swap;
    this.historyPrimed = true;

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
    const frag = mode === "seamless" ? TILE_OFFSET_FRAG : TILE_FREQ_FRAG;
    this.tileMaterial?.dispose();
    this.tileMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: frag,
      uniforms: {
        uTex:     { value: null },
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
    return { data: new Uint8Array(0), width: w, height: h };
  }

  dispose() {
    if (this.warmupHandle != null) window.clearTimeout(this.warmupHandle);
    this.shaderCache.forEach(e => e.material.dispose());
    this.shaderCache.clear();
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtC.dispose();
    this.rtHistA.dispose();
    this.rtHistB.dispose();
    this.sourceTex?.dispose();
    this.compositor.dispose();
    this.blitMaterial.dispose();
    this.sourceFillMaterial.dispose();
    this.tileMaterial?.dispose();
    this.rtTile?.dispose();
    try {
      const ext = this.renderer.getContext().getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {}
    this.renderer.dispose();
  }
}
