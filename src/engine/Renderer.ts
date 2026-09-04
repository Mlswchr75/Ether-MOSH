import * as THREE from "three";
import { EFFECTS_BY_ID } from "./effects";
import { AMOUNT_RENDER_BOOST } from "./effectRegistry";
import {
  BLEND_INDEX,
  COMPOSITOR_FRAG,
  PASSTHROUGH_VERT,
  REGION_INDEX,
  type BlendMode,
  type LayerRegion,
} from "./blend";
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
  /** Confines this layer to part of the frame. Null/absent = whole frame. */
  region?: LayerRegion | null;
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
  /**
   * Depth proxy. A 0..1 estimate of foreground (1) vs background (0), derived
   * from motion, saturation and centre bias — no ML, no depth sensor. Ping-ponged
   * because each frame's estimate accumulates on the last one: that temporal
   * charge is what keeps a subject who stops moving from dissolving into the room.
   */
  private rtDepthA!: THREE.WebGLRenderTarget;
  private rtDepthB!: THREE.WebGLRenderTarget;
  /** Last frame's *source* (pre-effects) — motion is only meaningful against this. */
  private rtSrcPrev!: THREE.WebGLRenderTarget;
  private depthPrimed = false;
  private depthMaterial!: THREE.ShaderMaterial;
  /**
   * Optical flow — per-pixel motion, encoded as a signed vec2 in rg.
   *
   * The depth proxy only asks *whether* a pixel moved. This asks which way and
   * how fast, which is what lets an effect drag, smear or refract along the
   * direction things are actually travelling rather than along a fixed axis.
   * Ping-ponged so the field can be smoothed over time; raw per-frame flow is
   * far too noisy to displace by.
   */
  private rtFlowA!: THREE.WebGLRenderTarget;
  private rtFlowB!: THREE.WebGLRenderTarget;
  private flowMaterial!: THREE.ShaderMaterial;
  /**
   * Strided ring of past *output* frames. Unlike rtHistA/B (one frame back), this
   * reaches back ~250ms so different regions of the image can be shown at
   * genuinely different moments. Strided — written every Nth frame — so four
   * buffers cover a quarter-second instead of four frames.
   */
  private rtRing: THREE.WebGLRenderTarget[] = [];
  private ringWrite = 0;
  private ringCount = 0;
  private frameCounter = 0;
  private ringStride = 4;
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
  private finisherMaterial!: THREE.ShaderMaterial;
  private warmupHandle: number | null = null;
  /** When set, warmup only pre-compiles these effects instead of the full
   *  catalog — for callers (like a decorative background) that only ever
   *  render a small, known subset and shouldn't pay to compile the rest. */
  private warmupEffectIds: string[] | null = null;
  private startTime = performance.now();
  // Tile pass — post-process after the effect stack, before screen blit.
  private tileMaterial: THREE.ShaderMaterial | null = null;
  private rtTile: THREE.WebGLRenderTarget | null = null;
  private _tileMode: TileMode = "none";
  private _tileUniforms: TileUniforms = { ...DEFAULT_TILE_UNIFORMS };
  // Adaptive HDR intensity (0 = pure passthrough, 1 = full ACES filmic)
  private _hdrIntensity = 0;
  // Dark Mode — smoothed toward _darkModeTarget each frame so the toggle
  // fades rather than snaps.
  private _darkMode = 0;
  private _darkModeTarget = 0;
  /** Optional final target used by immersive VR instead of the flat canvas. */
  private xrTarget: THREE.WebGLRenderTarget | null = null;
  /** Re-applied after every buffer reallocation, which resets wrap modes. */
  private _tileableSampling = false;
  // requestVideoFrameCallback handle for precision texture sync
  private _rvfcVideo: HTMLVideoElement | null = null;
  private _rvfcId = 0;

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
    // Was implicitly relying on three.js's default; making it explicit so a
    // future three.js version bump can't silently change the output encoding
    // out from under every effect's color math.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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
        uRegionDepth: { value: null },
        uOpacity: { value: 1 },
        uMode: { value: 0 },
        uRegionMode: { value: 0 },
        uRegionScale: { value: 1 },
        uRegionPhase: { value: 0 },
        uRegionGate: { value: 0.5 },
        uRegionFeather: { value: 0.12 },
        uRegionInvert: { value: 0 },
        uAspect: { value: new THREE.Vector2(1, 1) },
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
    // uMirror=1 horizontally flips the source for front-facing cameras (selfie mode).
    this.sourceFillMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec2 uCover;
        uniform vec2 uResolution;
        uniform float uHdr;
        uniform float uMirror;
        uniform float uWrap;

        const vec3 LUMA = vec3(0.299, 0.587, 0.114);

        /* Edge behaviour, switchable.

           Clamping is correct for a photo: sampling past the border should
           smear the border pixel. For a tile it is wrong — the sample should
           continue into the next copy, which is what fract() does. Both live
           here because the same pass serves a camera frame and a print tile. */
        vec2 sadj(vec2 p){ return mix(clamp(p, 0.0, 1.0), fract(p), uWrap); }

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
          vec2 uv = (vUv - 0.5) * uCover + 0.5;
          uv.x = mix(uv.x, 1.0 - uv.x, uMirror);
          vec4 texel = texture2D(uTex, sadj(uv));
          vec3 c = texel.rgb;
          // This pass is the very first stop for the source texture — every
          // effect downstream reads from what it writes. Hardcoding alpha to
          // 1.0 here was flattening a transparent upload's real alpha to
          // fully opaque before a single FX shader ever got to see it, no
          // matter how carefully each of those 108 shaders was later fixed
          // to carry .a through. The tone-mapping below only ever touches
          // RGB, so the source's own alpha just rides along untouched.
          float srcAlpha = texel.a;

          if (uHdr <= 0.001) { gl_FragColor = vec4(c, srcAlpha); return; }

          // 7px, not 14. The neighbourhood doubles as the "local average" the
          // shadow lift blends toward, and at 14px that average is a heavy blur
          // — which is what made well-lit skin read as wax rather than as skin.
          vec2 r = 7.0 / uResolution;
          vec3 t0 = texture2D(uTex, sadj(uv + vec2( 1.000,  0.000)*r)).rgb;
          vec3 t1 = texture2D(uTex, sadj(uv + vec2( 0.500,  0.866)*r)).rgb;
          vec3 t2 = texture2D(uTex, sadj(uv + vec2(-0.500,  0.866)*r)).rgb;
          vec3 t3 = texture2D(uTex, sadj(uv + vec2(-1.000,  0.000)*r)).rgb;
          vec3 t4 = texture2D(uTex, sadj(uv + vec2(-0.500, -0.866)*r)).rgb;
          vec3 t5 = texture2D(uTex, sadj(uv + vec2( 0.500, -0.866)*r)).rgb;
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
          // grainy rather than remastered.
          //
          // But noise is a LOW-LIGHT problem, and this was applied to every
          // frame at a flat 9% threshold. Skin texture — pores, fine shading,
          // stubble — lives almost entirely below 9%, so on a well-lit face it
          // was not suppressing noise, it was erasing the face. That is the
          // skin-smoothing half of the uncanny look.
          //
          // Scale the threshold with how dark the neighbourhood actually is:
          // aggressive where there is genuinely noise to kill, near-transparent
          // in good light where there is not.
          float darkness = 1.0 - smoothstep(0.0, 0.55, lLocal);
          float core = mix(0.012, 0.09, darkness);
          detail *= smoothstep(0.0, core, abs(detail));
          // Cap the overshoot so strong edges don't ring. Without this the
          // amplified difference paints a dark halo around bright subjects,
          // which is the giveaway artefact of naive local tone mapping.
          detail = clamp(detail, -0.10, 0.10);

          // Shadow lift: gamma below 1 opens the low end, and the exponent is
          // driven by how dark the NEIGHBOURHOOD is, so a bright subject on a
          // dark ground doesn't get flattened along with the ground.
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
          // The local average is a blur, so this term is literal smoothing —
          // worth it to
          // keep a lifted shadow clean, ruinous anywhere else. It was reaching
          // 30% on ordinary mid-tones via the darkness term, which is the other
          // half of the wax. Restrict it to genuinely dark pixels, where the
          // lift is actually amplifying noise, and cut the ceiling.
          float shadow = 1.0 - smoothstep(0.0, 0.28, max(l, lLocal));
          vec3 base = mix(c, local, uHdr * min(0.5, shadow * 0.40));

          // Rescale by luminance ratio so hue and saturation ride along instead
          // of washing out, then push chroma back where the lift stole it.
          // Floor well above zero: at a near-black pixel adjacent to a bright
          // one this ratio would otherwise explode and speckle the edge.
          vec3 outC = base * (outL / max(l, 0.02));
          float outLum = dot(outC, LUMA);
          // Chroma push. Restrained in good light: saturated-but-textureless
          // skin is what tips "smoothed" over into "creepy". The dark-frame
          // term stays, since a lift genuinely does steal saturation there.
          outC = mix(vec3(outLum), outC, 1.0 + uHdr * (0.10 + darkness * 0.45));

          gl_FragColor = vec4(clamp(outC, 0.0, 1.0), srcAlpha);
        }
      `,
      uniforms: {
        uTex: { value: null },
        uCover: { value: new THREE.Vector2(1, 1) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uHdr: { value: 0 },
        uMirror: { value: 0.0 },
        uWrap: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    // Adaptive HDR finisher — post-processes the final composited output.
    // At uHdr=0 it is a pure passthrough.
    // As uHdr rises, unsharp mask sharpening and ACES filmic tone mapping engage.
    this.finisherMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform vec2 uRes;
        uniform float uHdr;
        uniform float uOverlay;
        uniform sampler2D uOverlayDepth;
        uniform float uOverlayGate;
        uniform float uOverlaySoft;
        uniform float uVibrance;
        uniform float uDarkMode;

        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
        }

        // Vibrance, not flat saturation: pixels that are already vivid get
        // little extra push (they'd just clip to a flat neon block), while
        // muted/desaturated pixels get lifted the most. Keeps the wider
        // color range from reading as "everything is neon."
        vec3 vibrance(vec3 color, float amount) {
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          float maxc = max(color.r, max(color.g, color.b));
          float minc = min(color.r, min(color.g, color.b));
          float chroma = maxc - minc;
          float boost = amount * (1.0 - chroma);
          return mix(vec3(luma), color, 1.0 + boost);
        }

        // Everything upstream is fully aliased (antialias:false on the
        // WebGLRenderer, and every effect quad is a raw full-screen pass) —
        // this is the one shared place to buy edges back for every effect at
        // once. Classic compact FXAA: a handful of extra taps, no extra pass.
        vec3 fxaa(sampler2D tex, vec2 uv, vec2 res) {
          vec2 px = 1.0 / res;
          vec3 rgbNW = texture2D(tex, uv + vec2(-1.0, -1.0) * px).rgb;
          vec3 rgbNE = texture2D(tex, uv + vec2( 1.0, -1.0) * px).rgb;
          vec3 rgbSW = texture2D(tex, uv + vec2(-1.0,  1.0) * px).rgb;
          vec3 rgbSE = texture2D(tex, uv + vec2( 1.0,  1.0) * px).rgb;
          vec3 rgbM  = texture2D(tex, uv).rgb;

          const vec3 luma = vec3(0.299, 0.587, 0.114);
          float lumaNW = dot(rgbNW, luma);
          float lumaNE = dot(rgbNE, luma);
          float lumaSW = dot(rgbSW, luma);
          float lumaSE = dot(rgbSE, luma);
          float lumaM  = dot(rgbM,  luma);

          float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
          float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

          vec2 dir;
          dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
          dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

          float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * 0.03125, 1.0 / 128.0);
          float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
          dir = clamp(dir * rcpDirMin, -8.0, 8.0) * px;

          vec3 rgbA = 0.5 * (
            texture2D(tex, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
            texture2D(tex, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
          vec3 rgbB = rgbA * 0.5 + 0.25 * (
            texture2D(tex, uv + dir * -0.5).rgb +
            texture2D(tex, uv + dir *  0.5).rgb);

          float lumaB = dot(rgbB, luma);
          return (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
        }

        void main() {
          vec4 col = texture2D(uTex, vUv);
          col.rgb = fxaa(uTex, vUv, uRes);

          // 4-tap cross blur for unsharp mask
          vec2 px = 1.5 / uRes;
          vec3 blurred = (
            texture2D(uTex, vUv + vec2(px.x, 0.0)).rgb +
            texture2D(uTex, vUv - vec2(px.x, 0.0)).rgb +
            texture2D(uTex, vUv + vec2(0.0, px.y)).rgb +
            texture2D(uTex, vUv - vec2(0.0, px.y)).rgb
          ) * 0.25;

          // Bell-curve sharpening — peaks at mid mosh, keeps edges defined during chaos
          float sharpAmt = uHdr * (1.0 - uHdr) * 1.4;
          vec3 sharpened = col.rgb + (col.rgb - blurred) * sharpAmt;

          // ACES filmic tone mapping fades in above 0.25 intensity
          vec3 tonemapped = aces(sharpened);
          vec3 result = mix(sharpened, tonemapped, smoothstep(0.25, 0.9, uHdr));

          // At uHdr=0: pure passthrough. Above 0.08: processing fully active.
          vec3 rgb = mix(col.rgb, result, smoothstep(0.0, 0.08, uHdr));

          // Baseline vibrance lift — applied to every frame regardless of
          // uHdr, since it's a default look rather than a mosh-intensity
          // effect. Runs after tone mapping so it grades the final colors,
          // not the pre-ACES intermediate.
          rgb = vibrance(rgb, uVibrance);

          /* Dark Mode. Not a global invert or a flat darken — both of those
             either torch every light in the frame or just look muddy. The
             old accidental version that this revives crushed everything
             indiscriminately and left only stray light as scan-thin traces;
             this one is selective instead: a pixel with real color in it
             survives and gets pushed hotter, a pixel that's mostly just
             luma (white, pale grey, washed highlights) falls into true
             black. The frame ends up mostly-black with color punching
             through it, rather than mostly-black with white lines. */
          if (uDarkMode > 0.001) {
            float dmLuma = dot(rgb, vec3(0.299, 0.587, 0.114));
            float dmMax = max(rgb.r, max(rgb.g, rgb.b));
            float dmMin = min(rgb.r, min(rgb.g, rgb.b));
            float dmSat = dmMax < 0.02 ? 0.0 : (dmMax - dmMin) / dmMax;
            // Only the bright, low-color part of the frame crushes — dark
            // pixels (already reading as shadow) are left alone so black
            // isn't spread any further than it needs to be.
            float dmCrush = (1.0 - dmSat) * smoothstep(0.1, 0.8, dmLuma);
            vec3 dmBlacked = rgb * (1.0 - dmCrush * 0.96);
            // What's left gets shoved toward neon: colored pixels get an
            // extra vibrance kick proportional to their own saturation, so
            // the hottest hues in frame come out hottest.
            vec3 dmNeon = vibrance(dmBlacked, 0.55 + dmSat * 0.35) * (1.0 + dmSat * 0.4);
            rgb = mix(rgb, clamp(dmNeon, 0.0, 4.0), uDarkMode);
          }

          /* Overlay keying.

             Done here rather than earlier because this is the last pass before
             the screen — keying sooner would let subsequent effects sample and
             smear the transparency around, which reads as grey fringing rather
             than as a clean cut.

             1 SUBJECT — alpha from the depth proxy. Keeps the person, drops the
               room. What a streamer wants composited over gameplay.
             2 LUMA — alpha from brightness. Blacks vanish, light survives. More
               robust than subject keying because it depends on nothing being
               tracked, and it is what most reactive stream overlays actually
               want: light laid over the scene rather than a cut-out of one. */
          float a = col.a;
          if (uOverlay > 0.5 && uOverlay < 1.5) {
            a *= smoothstep(uOverlayGate - uOverlaySoft, uOverlayGate + uOverlaySoft,
                            texture2D(uOverlayDepth, vUv).r);
          } else if (uOverlay >= 1.5) {
            float l = dot(rgb, vec3(0.299, 0.587, 0.114));
            a *= smoothstep(uOverlayGate - uOverlaySoft, uOverlayGate + uOverlaySoft, l);
          }

          gl_FragColor = vec4(rgb, clamp(a, 0.0, 1.0));
        }
      `,
      uniforms: {
        uTex: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uHdr: { value: 0 },
        uOverlay: { value: 0 },
        uOverlayDepth: { value: null },
        uOverlayGate: { value: 0.4 },
        uOverlaySoft: { value: 0.18 },
        uVibrance: { value: 0.35 },
        uDarkMode: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    /* Depth proxy.

       There is no depth sensor and no segmentation model here, and there does
       not need to be one — a live camera hands over three cues that separate a
       person from the room behind them almost for free:

         motion — the subject moves, the room does not. By far the strongest
                  signal, and the only one that is actually about depth.
         saturation — skin and clothing sit well above the desaturated walls,
                  ceilings and daylight that make up most backgrounds.
         centre bias — people frame themselves near the middle.

       None of the three is reliable alone. Motion vanishes the moment someone
       holds still; saturation is fooled by a colourful poster; centre bias is
       just a guess. Accumulated over time and diffused over space they agree
       often enough to carve a usable foreground mask, which is all the effects
       downstream need to stop treating the frame as one flat sheet. */
    this.depthMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uSrc;
        uniform sampler2D uPrevSrc;
        uniform sampler2D uPrevDepth;
        uniform vec2 uResolution;
        uniform float uPrimed;

        float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main(){
          vec3 c = texture2D(uSrc, vUv).rgb;
          vec3 p = texture2D(uPrevSrc, vUv).rgb;

          // Motion. Thresholded low enough to catch a slow lean, high enough
          // that sensor noise in a dim room doesn't light up the whole frame.
          float motion = smoothstep(0.02, 0.17, abs(luma(c) - luma(p)));

          float mx = max(max(c.r, c.g), c.b);
          float mn = min(min(c.r, c.g), c.b);
          float sat = mx < 0.04 ? 0.0 : (mx - mn) / mx;

          // Ellipse, not a circle — frames are wider than they are tall and so
          // is the region a subject occupies.
          vec2 d = (vUv - 0.5) * vec2(1.0, 0.70);
          float centre = 1.0 - smoothstep(0.15, 0.54, length(d));

          // What we would guess with no history at all. Also the floor the
          // estimate relaxes back to once motion has decayed away.
          float staticCue = clamp(centre * 0.60 + sat * 0.40, 0.0, 1.0);

          /* Spatial diffusion, done by reading the NEIGHBOURHOOD of last frame's
             estimate rather than blurring this one. Four taps per frame, but
             because the result feeds back in every frame the blur compounds —
             after a handful of frames it is a wide, coherent blob. A real
             kernel that wide would cost 20+ taps every frame. */
          vec2 r = 3.0 / uResolution;
          float prev = (
            texture2D(uPrevDepth, vUv).r * 0.44 +
            texture2D(uPrevDepth, vUv + vec2(r.x, 0.0)).r * 0.14 +
            texture2D(uPrevDepth, vUv - vec2(r.x, 0.0)).r * 0.14 +
            texture2D(uPrevDepth, vUv + vec2(0.0, r.y)).r * 0.14 +
            texture2D(uPrevDepth, vUv - vec2(0.0, r.y)).r * 0.14
          ) * uPrimed;

          // Charge fast, discharge slowly: someone who moves is marked
          // foreground immediately and stays marked while they hold still.
          float charged = max(prev * 0.955, motion);

          float depth = clamp(charged * 0.72 + staticCue * 0.42, 0.0, 1.0);
          depth = mix(staticCue, depth, 0.78);
          gl_FragColor = vec4(depth, depth, depth, 1.0);
        }
      `,
      uniforms: {
        uSrc: { value: null },
        uPrevSrc: { value: null },
        uPrevDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPrimed: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    /* Optical flow, by the normal-flow approximation.

       Real dense flow (Lucas-Kanade, Horn-Schunck) is an iterative solve and
       far beyond a per-frame budget here. But the brightness-constancy
       assumption gives a closed form in one step: a surface's apparent motion
       along its own gradient is -It * grad / |grad|^2, where It is the temporal
       difference. It only recovers motion perpendicular to edges — the aperture
       problem — and that limitation is invisible for this purpose, because what
       we do with the vector is drag pixels around, not measure anything.

       Smoothed hard over time. Raw per-frame flow is dominated by sensor noise
       in flat regions, and displacing by it looks like static rather than
       like motion. */
    this.flowMaterial = new THREE.ShaderMaterial({
      vertexShader: PASSTHROUGH_VERT,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uSrc;
        uniform sampler2D uPrevSrc;
        uniform sampler2D uPrevFlow;
        uniform vec2 uResolution;
        uniform float uPrimed;

        float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

        void main(){
          vec2 px = 1.0 / uResolution;
          float c  = luma(texture2D(uSrc, vUv).rgb);
          float l  = luma(texture2D(uSrc, vUv - vec2(px.x, 0.0)).rgb);
          float r  = luma(texture2D(uSrc, vUv + vec2(px.x, 0.0)).rgb);
          float d  = luma(texture2D(uSrc, vUv - vec2(0.0, px.y)).rgb);
          float u  = luma(texture2D(uSrc, vUv + vec2(0.0, px.y)).rgb);
          float p  = luma(texture2D(uPrevSrc, vUv).rgb);

          vec2 grad = vec2(r - l, u - d) * 0.5;
          float dt = c - p;

          // The epsilon is doing real work: where the gradient vanishes the
          // division explodes, and a flat wall would otherwise report the
          // fastest motion in the frame.
          float denom = dot(grad, grad) + 0.0025;
          vec2 flow = -dt * grad / denom;

          // Clamp before smoothing. A single specular flash produces an
          // enormous spurious vector, and letting it into the accumulator
          // poisons the field for a second afterwards.
          flow = clamp(flow, vec2(-1.0), vec2(1.0));

          vec2 prev = (texture2D(uPrevFlow, vUv).rg * 2.0 - 1.0) * uPrimed;
          vec2 outF = mix(prev, flow, 0.18);

          gl_FragColor = vec4(outF * 0.5 + 0.5, 0.0, 1.0);
        }
      `,
      uniforms: {
        uSrc: { value: null },
        uPrevSrc: { value: null },
        uPrevFlow: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPrimed: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.allocTargets(2, 2);
  }

  private _halfFloatSupport: boolean | null = null;
  private supportsHalfFloatTargets(): boolean {
    if (this._halfFloatSupport === null) {
      const ext = this.renderer.extensions;
      this._halfFloatSupport = ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float");
    }
    return this._halfFloatSupport;
  }

  private allocTargets(w: number, h: number) {
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.rtC?.dispose();
    this.rtHistA?.dispose();
    this.rtHistB?.dispose();
    this.rtDepthA?.dispose();
    this.rtDepthB?.dispose();
    this.rtSrcPrev?.dispose();
    this.rtFlowA?.dispose();
    this.rtFlowB?.dispose();
    for (const rt of this.rtRing) rt.dispose();
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

    // The feedback/history pair is what compounds banding: uFeedback reads
    // last frame's output back in every frame, so any quantization here gets
    // re-quantized over and over across a chained effect stack. Half-float
    // just on these two (not the other ~12 targets) kills that without
    // doubling memory/bandwidth for the whole pipeline. Falls back to 8-bit
    // on hardware without a color-renderable float extension.
    const histOpts: THREE.RenderTargetOptions = {
      ...opts,
      type: this.supportsHalfFloatTargets() ? THREE.HalfFloatType : THREE.UnsignedByteType,
    };
    this.rtHistA = new THREE.WebGLRenderTarget(w, h, histOpts);
    this.rtHistB = new THREE.WebGLRenderTarget(w, h, histOpts);

    // Depth runs at quarter resolution. It is a soft blob mask that gets
    // diffused anyway, so full-res detail in it would be spent and then blurred
    // away — and this keeps the extra pass close to free on mobile.
    const dw = Math.max(2, Math.floor(w * 0.5));
    const dh = Math.max(2, Math.floor(h * 0.5));
    this.rtDepthA = new THREE.WebGLRenderTarget(dw, dh, opts);
    this.rtDepthB = new THREE.WebGLRenderTarget(dw, dh, opts);
    this.rtSrcPrev = new THREE.WebGLRenderTarget(dw, dh, opts);
    this.rtFlowA = new THREE.WebGLRenderTarget(dw, dh, opts);
    this.rtFlowB = new THREE.WebGLRenderTarget(dw, dh, opts);

    // Ring depth: a phone cannot spare four extra full-size buffers, and the
    // effect still reads at three.
    const ringSize = (typeof window !== "undefined" && window.innerWidth < 768) ? 3 : 4;
    this.rtRing = Array.from({ length: ringSize }, () => new THREE.WebGLRenderTarget(w, h, opts));
    this.ringWrite = 0;
    this.ringCount = 0;

    // Resized buffers start undefined; treat history as cold so the first
    // frame after a resize doesn't sample garbage.
    this.historyPrimed = false;
    this.depthPrimed = false;
    // Freshly allocated targets default to clamped; a resize must not silently
    // reintroduce seams into a tile that was already set up.
    if (this._tileableSampling) this.setTileableSampling(true);
    if (this.rtTile) {
      this.rtTile.dispose();
      this.rtTile = new THREE.WebGLRenderTarget(w, h, opts);
    }
  }

  /** True when the source canvas/video updates each frame. */
  private perFrameUpdate = false;

  /** Mirror the source horizontally (true for front-facing / selfie cameras). */
  setSourceMirror(mirror: boolean) {
    this.sourceFillMaterial.uniforms.uMirror.value = mirror ? 1.0 : 0.0;
  }

  /**
   * Switch every sampler between clamped and wrapped addressing.
   *
   * Clamping is right for a photo or a camera frame: sampling past the edge
   * should smear the edge pixel, not teleport to the far side. For a tile it is
   * exactly wrong — an effect that offsets its UV past the boundary should
   * continue into the neighbouring copy, because that is what the pattern will
   * actually do when printed. Flipping the wrap mode is what lets ordinary
   * displacement effects stay seamless rather than having to be rewritten.
   *
   * Effects that clamp their own coordinates in the shader bypass this, which
   * is why tileSafety also excludes them by inspection.
   */
  setTileableSampling(on: boolean) {
    const mode = on ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    const targets = [
      this.rtA, this.rtB, this.rtC,
      this.rtHistA, this.rtHistB, this.rtTile,
      ...this.rtRing,
    ];
    for (const rt of targets) {
      if (!rt) continue;
      rt.texture.wrapS = mode;
      rt.texture.wrapT = mode;
      rt.texture.needsUpdate = true;
    }
    if (this.sourceTex) {
      this.sourceTex.wrapS = mode;
      this.sourceTex.wrapT = mode;
      this.sourceTex.needsUpdate = true;
    }
    this._tileableSampling = on;
    this.sourceFillMaterial.uniforms.uWrap.value = on ? 1 : 0;
    // A tile must fill its frame exactly. Cover-cropping to the viewport aspect
    // would scale the pattern and cut the seam in a different place each resize.
    if (on) (this.sourceFillMaterial.uniforms.uCover.value as THREE.Vector2).set(1, 1);
    this.resize(this.cssWidth, this.cssHeight);
  }

  /** Set the HDR finisher intensity (0 = pure passthrough, 1 = full ACES filmic).
   *  Call each frame from the render loop with a score derived from active layers. */
  setHdrIntensity(v: number) {
    this._hdrIntensity = Math.max(0, Math.min(1, v));
  }

  /** Dark Mode — a finisher-level grade, independent of the effect stack.
   *  Crushes low-saturation/bright content (whites, pale highlights, flat
   *  grey) toward true black while protecting and boosting whatever color
   *  survives, so neon hues read as hot against real black instead of the
   *  usual mid-grey ambient light. Fades in/out over a few frames rather
   *  than snapping when toggled. */
  setDarkMode(on: boolean) {
    this._darkModeTarget = on ? 1 : 0;
  }

  /**
   * Key the output to transparency so it can be composited over something else
   * — an OBS scene, a projection, a video track.
   *
   * "subject" keys on the depth proxy and keeps the person; "luma" keys on
   * brightness and keeps the light. Luma is the more dependable of the two
   * because it relies on nothing being tracked correctly, and for a reactive
   * overlay it is usually what is actually wanted.
   */
  setOverlayMode(mode: "off" | "subject" | "luma", opts: { gate?: number; soft?: number } = {}) {
    const u = this.finisherMaterial.uniforms;
    u.uOverlay.value = mode === "subject" ? 1 : mode === "luma" ? 2 : 0;
    u.uOverlayGate.value = opts.gate ?? (mode === "luma" ? 0.16 : 0.4);
    u.uOverlaySoft.value = opts.soft ?? (mode === "luma" ? 0.22 : 0.18);
  }

  private _cancelRvfc() {
    if (this._rvfcVideo && this._rvfcId) {
      try { (this._rvfcVideo as any).cancelVideoFrameCallback?.(this._rvfcId); } catch {}
    }
    this._rvfcVideo = null;
    this._rvfcId = 0;
  }

  private _scheduleRvfc(video: HTMLVideoElement) {
    this._rvfcId = (video as any).requestVideoFrameCallback((_now: number, _meta: unknown) => {
      // Upload exactly when the browser has a fresh decoded frame ready — not every RAF.
      if (this.sourceTex && this._rvfcVideo === video) {
        this.sourceTex.needsUpdate = true;
        this._scheduleRvfc(video);
      }
    });
  }

  setSourceImage(image: HTMLImageElement) {
    this._cancelRvfc();
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
    // A still image is never a selfie. Clearing the mirror here rather than
    // trusting upstream state makes this class of bug impossible: mirroring is
    // a property of the live camera, so it cannot outlive one.
    this.setSourceMirror(false);
    this.resize(this.cssWidth, this.cssHeight);
    this.scheduleWarmup();
  }

  /** Use a self-updating Canvas2D buffer (procedural ambient) as the source. */
  setSourceCanvas(canvas: HTMLCanvasElement) {
    this._cancelRvfc();
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

  /** Use a live <video> (camera / MediaStream) as the source.
   *  Uses requestVideoFrameCallback when available for zero-waste texture uploads
   *  — only uploads when the browser has a fresh decoded frame, not every RAF.
   *  Falls back to per-frame upload on browsers without rVFC support. */
  setSourceVideo(video: HTMLVideoElement) {
    this._cancelRvfc();
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
    const w = video.videoWidth || 16;
    const h = video.videoHeight || 9;
    this.sourceAspect = w / h;
    if ('requestVideoFrameCallback' in video) {
      this.perFrameUpdate = false;
      this._rvfcVideo = video;
      this._scheduleRvfc(video);
    } else {
      this.perFrameUpdate = true;
    }
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

    // A tile maps 1:1 to its frame. Cover-cropping would rescale the pattern
    // and move where the seam falls on every resize, so tileable mode opts out.
    if (this._tileableSampling) {
      (this.sourceFillMaterial.uniforms.uCover.value as THREE.Vector2).set(1, 1);
    } else {
      const dstA = drawW / Math.max(1, drawH);
      const srcA = this.sourceAspect || 1;
      const coverX = Math.min(1, dstA / srcA);
      const coverY = Math.min(1, srcA / dstA);
      (this.sourceFillMaterial.uniforms.uCover.value as THREE.Vector2).set(coverX, coverY);
    }

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

  /** Baseline vibrance lift, 0..1. Independent of setHdrIntensity: this is a
   *  house grade applied to every frame, not something that fades in with the
   *  size of the effect stack. Drive it from the frame's own measured
   *  saturation — see adaptiveVibrance — rather than leaving it parked, which
   *  is what it did for as long as it had no setter. */
  setVibrance(amount: number) {
    this.finisherMaterial.uniforms.uVibrance.value = Math.max(0, Math.min(1, amount));
  }

  setRenderScale(scale: number) {
    this.renderScale = Math.max(0.42, Math.min(0.9, scale));
    this.resize(this.cssWidth, this.cssHeight);
  }

  /** Restrict warmup pre-compilation to this set of effect ids instead of the
   *  full catalog. Call before the first setSource*() so it takes effect on
   *  the initial warmup pass. */
  setWarmupEffects(ids: string[]) {
    this.warmupEffectIds = ids;
  }

  private scheduleWarmup() {
    if (this.warmupHandle != null) return;
    this.warmupHandle = window.setTimeout(() => {
      this.warmupHandle = null;
      if (!this.sourceTex) return;
      const previous = this.quad.material;
      const defs = this.warmupEffectIds
        ? this.warmupEffectIds.map(id => EFFECTS_BY_ID[id]).filter(Boolean)
        : Object.values(EFFECTS_BY_ID);
      for (const def of defs) {
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
      uDepthTex: { value: null },
      uFlowTex: { value: null },
      uHist0: { value: null },
      uHist1: { value: null },
      uHist2: { value: null },
      uHist3: { value: null },
      uHistDepth: { value: 0 },
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
      this.renderer.setRenderTarget(this.xrTarget);
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

    // Step 1b — update the depth proxy from the fresh source, then stash the
    // source for next frame's motion difference. Both run at half res.
    this.depthMaterial.uniforms.uSrc.value = this.rtA.texture;
    this.depthMaterial.uniforms.uPrevSrc.value = this.rtSrcPrev.texture;
    this.depthMaterial.uniforms.uPrevDepth.value = this.rtDepthA.texture;
    this.depthMaterial.uniforms.uPrimed.value = this.depthPrimed ? 1 : 0;
    (this.depthMaterial.uniforms.uResolution.value as THREE.Vector2)
      .set(this.rtDepthA.width, this.rtDepthA.height);
    this.quad.material = this.depthMaterial;
    this.renderer.setRenderTarget(this.rtDepthB);
    this.renderer.render(this.scene, this.camera);
    const depthSwap = this.rtDepthA;
    this.rtDepthA = this.rtDepthB;
    this.rtDepthB = depthSwap;
    this.depthPrimed = true;

    // Flow must run before rtSrcPrev is overwritten — it needs the same
    // previous frame the depth pass just used.
    this.flowMaterial.uniforms.uSrc.value = this.rtA.texture;
    this.flowMaterial.uniforms.uPrevSrc.value = this.rtSrcPrev.texture;
    this.flowMaterial.uniforms.uPrevFlow.value = this.rtFlowA.texture;
    this.flowMaterial.uniforms.uPrimed.value = this.depthPrimed ? 1 : 0;
    (this.flowMaterial.uniforms.uResolution.value as THREE.Vector2)
      .set(this.rtFlowA.width, this.rtFlowA.height);
    this.quad.material = this.flowMaterial;
    this.renderer.setRenderTarget(this.rtFlowB);
    this.renderer.render(this.scene, this.camera);
    const flowSwap = this.rtFlowA;
    this.rtFlowA = this.rtFlowB;
    this.rtFlowB = flowSwap;

    this.blitMaterial.uniforms.uTex.value = this.rtA.texture;
    this.quad.material = this.blitMaterial;
    this.renderer.setRenderTarget(this.rtSrcPrev);
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
      uni.uDepthTex.value = this.rtDepthA.texture;
      uni.uFlowTex.value = this.rtFlowA.texture;
      // Ring entries newest-first. Anything past what has actually been written
      // reads as the newest frame, so a cold ring degrades to "no time offset"
      // instead of sampling an undefined buffer.
      const newest = this.ringCount > 0
        ? this.rtRing[(this.ringWrite - 1 + this.rtRing.length) % this.rtRing.length]
        : null;
      for (let k = 0; k < 4; k++) {
        const slot = `uHist${k}`;
        if (!(slot in uni)) continue;
        if (k < this.ringCount) {
          const idx = (this.ringWrite - 1 - k + this.rtRing.length * 2) % this.rtRing.length;
          uni[slot].value = this.rtRing[idx].texture;
        } else {
          uni[slot].value = newest ? newest.texture : read.texture;
        }
      }
      uni.uHistDepth.value = this.ringCount;
      (uni.uResolution.value as THREE.Vector2).set(w, h);
      uni.uTime.value = time;
      uni.uPulse.value = pulse;
      for (const p of def.params) {
        const k = `u${p.key[0].toUpperCase() + p.key.slice(1)}`;
        let v = layer.params[p.key] ?? p.default;
        if (p.key === "amount") {
          // Nearly every effect's primary intensity dial is declared 0..1,
          // but the shader bodies were tuned against a muted top end (many
          // multiply this by a small constant like 0.13-0.3 before it ever
          // touches a pixel). Zero stays zero; the top of the dial now
          // drives noticeably harder than the shaders' original headroom —
          // this is the single choke point every effect's amount flows
          // through, so boosting it here raises the ceiling everywhere at
          // once instead of hand-tuning ~90 shader bodies individually.
          // AMOUNT_RENDER_BOOST is shared with effectRegistry.ts's
          // `renderedMax` so the declared range and the real one can't drift.
          const span = p.max - p.min || 1;
          const t = Math.max(0, (v - p.min) / span);
          v = p.min + Math.min(1, t) * span * AMOUNT_RENDER_BOOST;
        }
        uni[k].value = v;
      }
      this.quad.material = entry.material;
      this.renderer.setRenderTarget(effectTarget);
      this.renderer.render(this.scene, this.camera);

      const region = layer.region && layer.region.mode !== "none" ? layer.region : null;

      // The fast path swaps buffers instead of compositing — which also skips
      // the region mask, so a confined layer must never take it however opaque
      // it is.
      if (!region && layer.blend === "normal" && layer.opacity >= 0.995) {
        read = effectTarget;
        continue;
      }

      this.compositor.uniforms.uPrev.value = read.texture;
      this.compositor.uniforms.uCur.value = effectTarget.texture;
      this.compositor.uniforms.uOpacity.value = layer.opacity;
      this.compositor.uniforms.uMode.value = BLEND_INDEX[layer.blend];
      this.compositor.uniforms.uRegionDepth.value = this.rtDepthA.texture;
      this.compositor.uniforms.uRegionMode.value = region ? REGION_INDEX[region.mode] : 0;
      this.compositor.uniforms.uRegionScale.value = region?.scale ?? 1;
      this.compositor.uniforms.uRegionPhase.value = region?.phase ?? 0;
      this.compositor.uniforms.uRegionGate.value = region?.gate ?? 0.5;
      this.compositor.uniforms.uRegionFeather.value = region?.feather ?? 0.12;
      this.compositor.uniforms.uRegionInvert.value = region?.invert ? 1 : 0;
      (this.compositor.uniforms.uAspect.value as THREE.Vector2)
        .set(Math.max(1, w / Math.max(1, h)), 1);
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

    // --- Time ring write ---
    // Strided: one slot every `ringStride` frames, so four slots reach back a
    // quarter second rather than four frames. A four-frame reach is invisible;
    // a quarter second is the difference between a smear and seeing your own
    // past self.
    this.frameCounter++;
    if (this.frameCounter % this.ringStride === 0 && this.rtRing.length) {
      this.blitMaterial.uniforms.uTex.value = finalTex;
      this.quad.material = this.blitMaterial;
      this.renderer.setRenderTarget(this.rtRing[this.ringWrite]);
      this.renderer.render(this.scene, this.camera);
      this.ringWrite = (this.ringWrite + 1) % this.rtRing.length;
      this.ringCount = Math.min(this.ringCount + 1, this.rtRing.length);
    }

    // Adaptive HDR finisher → screen blit.
    // Pure passthrough at _hdrIntensity=0, ACES filmic tone-mapping at 1.
    this.finisherMaterial.uniforms.uTex.value = finalTex;
    (this.finisherMaterial.uniforms.uRes.value as THREE.Vector2).set(w, h);
    this.finisherMaterial.uniforms.uHdr.value = this._hdrIntensity;
    this._darkMode += (this._darkModeTarget - this._darkMode) * 0.12;
    this.finisherMaterial.uniforms.uDarkMode.value = this._darkMode;
    this.finisherMaterial.uniforms.uOverlayDepth.value = this.rtDepthA.texture;
    this.quad.material = this.finisherMaterial;
    this.renderer.setRenderTarget(this.xrTarget);
    this.renderer.render(this.scene, this.camera);
  }

  /** Redirect the final composited frame for immersive playback. */
  setXrTarget(target: THREE.WebGLRenderTarget | null): void {
    this.xrTarget = target;
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
    this._cancelRvfc();
    if (this.warmupHandle != null) window.clearTimeout(this.warmupHandle);
    this.shaderCache.forEach(e => e.material.dispose());
    this.shaderCache.clear();
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtC.dispose();
    this.rtHistA.dispose();
    this.rtHistB.dispose();
    this.rtDepthA?.dispose();
    this.rtDepthB?.dispose();
    this.rtSrcPrev?.dispose();
    this.rtFlowA?.dispose();
    this.rtFlowB?.dispose();
    for (const rt of this.rtRing) rt.dispose();
    this.rtRing = [];
    this.sourceTex?.dispose();
    this.compositor.dispose();
    this.blitMaterial.dispose();
    this.sourceFillMaterial.dispose();
    this.depthMaterial?.dispose();
    this.flowMaterial?.dispose();
    this.finisherMaterial.dispose();
    this.tileMaterial?.dispose();
    this.rtTile?.dispose();
    try {
      const ext = this.renderer.getContext().getExtension("WEBGL_lose_context");
      ext?.loseContext();
    } catch {}
    this.renderer.dispose();
  }
}
