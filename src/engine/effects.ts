export type ParamSchema = {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
};

/**
 * `dimension` is not just another bucket of filters. Every other category
 * transforms the frame as a single flat sheet; these read the depth proxy and
 * the time ring, so they can move the subject independently of the room, or
 * show two parts of the image at two different moments. They are the only
 * effects that add structure rather than surface, which is why the director
 * treats one of them as the load-bearing layer in a stack instead of just
 * another ingredient.
 */
export type EffectCategory = "corruption" | "color" | "geometry" | "atmosphere" | "dimension";

export type EffectDef = {
  id: string;
  name: string;
  category: EffectCategory;
  blurb: string;
  params: ParamSchema[];
  /** Fragment shader. Receives:
   *   uniform sampler2D uTex;
   *   uniform vec2 uResolution;
   *   uniform float uTime;
   *   uniform float uPulse;
   *   plus one float uniform per param (key prefixed with `u`, capitalized: e.g. `amount` -> `uAmount`).
   *   varying vec2 vUv;
   * Output gl_FragColor.
   */
  frag: string;
  /** True for effects driven entirely by a runtime manager (params it alone
   *  knows how to set, e.g. a live pointer position) rather than by a user
   *  dragging sliders. Excluded from every user-facing catalog (FxPicker,
   *  sticker layers, journey's random swap, the transition-boundary roll) —
   *  picking one there would show a static blob frozen at its param defaults
   *  instead of the manager's live-driven effect. Still fully renderable via
   *  EFFECTS_BY_ID and still gets warmup-precompiled. */
  internal?: boolean;
};

/** Common texture uniforms reserved by every effect shader. Keep scalar params
 * outside this namespace so their saved keys remain valid GLSL uniforms. */
export const EFFECT_SAMPLER_NAMES = [
  "uTex", "uFeedback", "uDepthTex", "uFlowTex", "uHist0", "uHist1", "uHist2", "uHist3",
] as const;

const COMMON_HEADER = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
// Last frame's finished output — the only way an effect can have memory.
// Black on the first frame and after a resize, so always fade it in rather
// than assuming it holds something.
uniform sampler2D uFeedback;
/* Foreground/background estimate, 1 = subject, 0 = the room behind them.
   Soft and blobby by construction — treat it as a gradient to displace along,
   not as a hard cut-out. See the depth pass in Renderer.ts for how it is built. */
uniform sampler2D uDepthTex;
/* Strided ring of past output frames, newest first, reaching back ~250ms.
   Sample through timeAt() rather than directly so a cold ring degrades cleanly. */
uniform sampler2D uHist0;
uniform sampler2D uHist1;
uniform sampler2D uHist2;
uniform sampler2D uHist3;
uniform float uHistDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPulse;

/* Per-pixel motion, signed. Points the way the surface under this pixel is
   travelling, magnitude roughly proportional to speed. Recovers motion
   perpendicular to edges only (the aperture problem) — irrelevant here, since
   it is used to drag pixels around rather than to measure anything. */
uniform sampler2D uFlowTex;

float depthAt(vec2 uv){ return texture2D(uDepthTex, clamp(uv, 0.0, 1.0)).r; }
vec2 flowAt(vec2 uv){ return texture2D(uFlowTex, clamp(uv, 0.0, 1.0)).rg * 2.0 - 1.0; }

/* Sample the output as it was 'age' ago — 0 is the most recent retained frame,
   1 is the far end of the ring. Interpolates between adjacent slots so a moving
   age sweeps continuously through time instead of stepping between snapshots. */
vec3 timeAt(vec2 uv, float age){
  vec2 c = clamp(uv, 0.0, 1.0);
  float a = clamp(age, 0.0, 1.0) * 3.0;
  if (a < 1.0) return mix(texture2D(uHist0, c).rgb, texture2D(uHist1, c).rgb, a);
  if (a < 2.0) return mix(texture2D(uHist1, c).rgb, texture2D(uHist2, c).rgb, a - 1.0);
  return mix(texture2D(uHist2, c).rgb, texture2D(uHist3, c).rgb, a - 2.0);
}

float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  float a=rand(i), b=rand(i+vec2(1.,0.)), c=rand(i+vec2(0.,1.)), d=rand(i+vec2(1.,1.));
  vec2 u=f*f*(3.0-2.0*f);
  return mix(a,b,u.x)+(c-a)*u.y*(1.-u.x)+(d-b)*u.x*u.y;
}
vec3 rgb2hsv(vec3 c){
  vec4 K=vec4(0.,-1./3.,2./3.,-1.);
  vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
  vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
  float d=q.x-min(q.w,q.y);
  float e=1.0e-10;
  return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)), d/(q.x+e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K=vec4(1.,2./3.,1./3.,3.);
  vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
  return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}
/* 13-tap disc blur: centre plus two hexagonal rings, hand-unrolled so there is
   no loop and no trig. For a diffusion glow this is visually indistinguishable
   from a 7x7 Gaussian while doing a quarter of the texture fetches — and these
   run on every frame of every stack, so the fetches are the frame budget. */
vec3 discBlur(vec2 uv, float radiusPx){
  vec2 r = radiusPx / uResolution;
  vec3 b = texture2D(uTex, uv).rgb * 0.148;
  b += texture2D(uTex, uv + vec2( 0.476,  0.275)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2( 0.000,  0.550)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2(-0.476,  0.275)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2(-0.476, -0.275)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2( 0.000, -0.550)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2( 0.476, -0.275)*r).rgb * 0.085;
  b += texture2D(uTex, uv + vec2( 1.000,  0.000)*r).rgb * 0.057;
  b += texture2D(uTex, uv + vec2( 0.500,  0.866)*r).rgb * 0.057;
  b += texture2D(uTex, uv + vec2(-0.500,  0.866)*r).rgb * 0.057;
  b += texture2D(uTex, uv + vec2(-1.000,  0.000)*r).rgb * 0.057;
  b += texture2D(uTex, uv + vec2(-0.500, -0.866)*r).rgb * 0.057;
  b += texture2D(uTex, uv + vec2( 0.500, -0.866)*r).rgb * 0.057;
  return b;
}
/* The gather half of a bloom on the same 13-tap disc: each tap weighted by how
   far it exceeds a luminance threshold. The directions are advanced by a 60
   degree rotation matrix per step, so the loop runs without any trig. */
vec3 discBright(vec2 uv, float radiusPx, float thresh){
  vec2 r = radiusPx / uResolution;
  vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 s = texture2D(uTex, uv).rgb;
  vec3 sum = s * max(0.0, dot(s, L) - thresh);
  float w = 1.0;
  mat2 rot60 = mat2(0.5, 0.866025, -0.866025, 0.5);
  vec2 d = vec2(1.0, 0.0);
  vec2 e = vec2(0.866025, 0.5) * 0.55;   // inner ring, offset 30 degrees
  for (int i = 0; i < 6; i++) {
    s = texture2D(uTex, uv + d * r).rgb;
    sum += s * max(0.0, dot(s, L) - thresh);
    s = texture2D(uTex, uv + e * r).rgb;
    sum += s * max(0.0, dot(s, L) - thresh);
    w += 2.0;
    d = rot60 * d;
    e = rot60 * e;
  }
  return sum / w;
}
`;

const fx = (id: string, name: string, category: EffectCategory, blurb: string, params: ParamSchema[], body: string): EffectDef => ({
  id,
  name,
  category,
  blurb,
  params,
  frag: COMMON_HEADER + params.map(p => `uniform float u${p.key[0].toUpperCase() + p.key.slice(1)};`).join("\n") + "\nvoid main(){\n" + body + "\n}",
});

export const EFFECTS: EffectDef[] = [
  // ── DATA CORRUPTION ───────────────────────────────────────────────
  fx("pixelSort", "Pixel Sort", "corruption", "Brightness-driven horizontal smear.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "threshold", label: "Threshold", min: 0, max: 0.85, default: 0.4 }],
    `
    vec2 uv=vUv;
    vec4 c=texture2D(uTex,uv);
    float lum=dot(c.rgb,vec3(0.299,0.587,0.114));
    // Soft gate, and capped below 1.0: a hard step() against a threshold that
    // could reach 1.0 passed nothing at all, so the sort disappeared at the top
    // of its own range. smoothstep also gives the sort a feathered edge.
    float s=smoothstep(uThreshold, uThreshold+0.18, lum)*uAmount;
    float n=noise(vec2(uv.y*120.0,uTime*0.3));
    uv.x = mix(uv.x, fract(uv.x + (n-0.5)*1.1*s + s*0.35), s);
    gl_FragColor = texture2D(uTex,uv);
    `),

  fx("datamosh", "Datamosh", "corruption", "Block reuse from previous frames.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Block Size", min: 0.005, max: 0.08, default: 0.025 }],
    `
    vec2 block = floor(vUv/uScale)*uScale;
    float n = rand(block + floor(uTime*4.0)*0.13);
    // How many blocks ever get touched now scales with amount too, not just
    // how far they move — at max, nearly every block is fair game instead of
    // a fixed ~45% no matter how hard the dial is pushed.
    float thresh = 1.0 - clamp(uAmount, 0.0, 1.0) * 0.92;
    vec2 off = (vec2(rand(block+1.7), rand(block+5.3))-0.5) * uAmount * 0.4 * step(thresh, n);
    gl_FragColor = texture2D(uTex, vUv + off);
    `),

  fx("blockShift", "Block Shift", "corruption", "Horizontal slabs torn loose.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "rows", label: "Density", min: 4, max: 200, default: 40, step: 1 }],
    `
    float row = floor(vUv.y * uRows);
    float seed = rand(vec2(row, floor(uTime*2.0)));
    // Fraction of rows that ever shift now scales with amount — at max,
    // nearly every row is in play instead of a fixed ~30% ceiling.
    float thresh = 1.0 - clamp(uAmount, 0.0, 1.0) * 0.94;
    float shift = (seed-0.5) * uAmount * step(thresh, seed);
    gl_FragColor = texture2D(uTex, vec2(fract(vUv.x + shift), vUv.y));
    `),

  fx("compressionTears", "Compression Tears", "corruption", "JPEG-like quantization fractures.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "size", label: "Block", min: 4, max: 64, default: 16, step: 1 }],
    `
    vec2 px = 1.0/uResolution;
    vec2 block = floor(vUv/(px*uSize))*(px*uSize);
    vec4 c = texture2D(uTex, block);
    float q = mix(64.0, 4.0, uAmount);
    c.rgb = floor(c.rgb*q)/q;
    gl_FragColor = c;
    `),

  fx("jitter", "Jitter", "corruption", "Per-pixel chromatic shake.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.45 },
     { key: "rate", label: "Rate", min: 0, max: 1, default: 0.5 }],
    `
    float t = uTime * mix(6.0, 70.0, uRate) + uPulse*3.0;
    vec2 j = vec2(noise(vec2(vUv.y*40.0,t)), noise(vec2(vUv.x*40.0,t+11.0))) - 0.5;
    // Per-channel shake, which is what "chromatic" in the blurb promised and
    // what keeps this distinct from a plain positional wobble.
    vec2 o = j * uAmount * 0.13;
    vec3 col;
    col.r = texture2D(uTex, vUv + o * 1.35).r;
    col.g = texture2D(uTex, vUv + o * 0.15).g;
    col.b = texture2D(uTex, vUv - o * 1.05).b;
    // Alpha has no channels to chromatically split, so it rides the
    // unshifted position — that's still the shake's own displacement of
    // vUv upstream, so a transparent source's silhouette still shakes with
    // the effect, just without the per-channel fringing that only makes
    // sense for color.
    gl_FragColor = vec4(col, texture2D(uTex, vUv).a);
    `),

  fx("scanBreak", "Scan Break", "corruption", "Horizontal line tears.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    // Torn scanlines that also split their colour channels and jump vertically.
    // A pure horizontal slide read as interchangeable with every other smear in
    // the library and vanished the moment anything was stacked on it.
    float band = step(0.74, sin(vUv.y*120.0 + uTime*uSpeed*8.0));
    float row = floor(vUv.y*200.0);
    float shift = (rand(vec2(row, floor(uTime*4.0))) - 0.5)*uAmount*1.7;
    // Torn rows grab from elsewhere in the frame rather than merely sliding.
    float vjump = (rand(vec2(row+13.0, floor(uTime*4.0))) - 0.5)*uAmount*0.22*band;
    vec2 uv = vec2(fract(vUv.x + shift*band), clamp(vUv.y + vjump, 0.0, 1.0));
    float sep = shift * band * 0.16;
    vec3 col;
    col.r = texture2D(uTex, uv + vec2(sep, 0.0)).r;
    col.g = texture2D(uTex, uv).g;
    col.b = texture2D(uTex, uv - vec2(sep, 0.0)).b;
    // Signal spike along the tear edge.
    col += vec3(0.7, 0.85, 1.0) * band * abs(shift) * 0.5;
    // uv already carries the tear's own horizontal/vertical displacement, so
    // sampling alpha there lets a transparent source's silhouette tear with
    // the rest of the frame instead of staying fixed underneath it.
    gl_FragColor = vec4(col, texture2D(uTex, uv).a);
    `),

  fx("frameSmear", "Frame Smear", "corruption", "Directional motion smear.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "angle", label: "Angle", min: 0, max: 3.14159, default: 0.5 }],
    `
    // Half turn — a full 2*PI sweep returns to its own starting direction.
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    vec4 acc = vec4(0.0);
    float w = 0.0;
    for (int i=0;i<8;i++){
      float t = float(i)/8.0;
      float k = 1.0 - t;
      acc += texture2D(uTex, vUv - dir*t*uAmount*0.16) * k;
      w += k;
    }
    gl_FragColor = acc/w;
    `),

  fx("sliceDrift", "Slice Drift", "corruption", "Vertical slab drift.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "cols", label: "Columns", min: 4, max: 120, default: 24, step: 1 }],
    `
    float col = floor(vUv.x*uCols);
    float drift = (sin(col*1.7 + uTime*0.7)*0.5 + noise(vec2(col, uTime*0.4))-0.5) * uAmount * 0.3;
    gl_FragColor = texture2D(uTex, vec2(vUv.x, fract(vUv.y + drift)));
    `),

  fx("bufferEcho", "Buffer Echo", "corruption", "Self-feedback ghosts.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "offset", label: "Offset", min: 0, max: 0.2, default: 0.04 }],
    `
    // Phosphor persistence rather than a three-tap lighten. Bright areas burn a
    // decaying trail into the frame the way a CRT does, which is a different
    // idea from Echo Trails' rotating ghosts and no longer reads like haze.
    vec4 curTex = texture2D(uTex, vUv);
    vec3 cur = curTex.rgb;
    vec3 burn = vec3(0.0);
    float w = 0.0;
    vec2 drift = vec2(uOffset, uOffset * 0.45);
    for (int i = 1; i < 7; i++) {
      float t = float(i);
      vec3 s = texture2D(uTex, clamp(vUv - drift * t, 0.0, 1.0)).rgb;
      // Only what was bright leaves a trail — that is what makes it phosphor.
      float hot = max(0.0, dot(s, vec3(0.299, 0.587, 0.114)) - 0.34);
      float k = exp(-t * 0.55);
      burn += s * hot * k;
      w += k;
    }
    burn /= max(w, 0.001);
    // Trails skew green-white as real phosphor decay does.
    vec3 col = cur + burn * vec3(0.72, 1.0, 0.80) * uAmount * 4.5;
    // The burn is an additive glow within the current frame's own
    // silhouette, not a separate object, so alpha just follows the base
    // sample rather than blending in the trail taps' own alpha.
    gl_FragColor = vec4(col, curTex.a);
    `),

  // ── COLOR CHAOS ───────────────────────────────────────────────────
  fx("rgbShift", "RGB Shift", "color", "Classic chromatic aberration.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "angle", label: "Angle", min: 0, max: 3.14159, default: 0 }],
    `
    // Radial prismatic divergence rather than a flat linear offset: channels
    // separate outward from a moving focus, so this reads as a lens breaking
    // apart rather than as the horizontal tape smear VHS Bleed already owns.
    // It was the single most redundant effect in the library before this,
    // appearing in ten near-duplicate pairs.
    vec2 focus = vec2(0.5) + 0.22 * vec2(cos(uAngle * 2.0), sin(uAngle * 2.0));
    vec2 d = vUv - focus;
    float rr = length(d);
    vec2 dir = d / max(rr, 1e-4);
    // Divergence grows with radius, the way real chromatic aberration does.
    float k = uAmount * 0.19 * (0.25 + rr * 1.8);
    vec3 col;
    col.r = texture2D(uTex, vUv + dir * k * 1.00).r;
    col.g = texture2D(uTex, vUv + dir * k * 0.25).g;
    col.b = texture2D(uTex, vUv - dir * k * 0.85).b;
    // Prismatic rim where the split is widest.
    float rim = smoothstep(0.25, 0.75, rr) * uAmount;
    col += vec3(0.40, 0.14, 0.62) * rim * 0.45;
    // Alpha rides the green channel's sample — the smallest divergence of
    // the three, closest to the undisplaced position.
    gl_FragColor = vec4(col, texture2D(uTex, vUv + dir * k * 0.25).a);
    `),

  fx("hueRotate", "Hue Rotate", "color", "Rotate the entire color wheel.",
    [{ key: "amount", label: "Amount", min: -1, max: 1, default: 0.3 },
     { key: "vividness", label: "Vividness", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 hsv = rgb2hsv(c.rgb);
    hsv.x = fract(hsv.x + uAmount);
    // Rotating hue alone left the pad's Y axis dead; saturation is the natural
    // partner and runs this from washed out to electric.
    hsv.y = clamp(hsv.y * mix(0.15, 2.4, uVividness), 0.0, 1.0);
    gl_FragColor = vec4(hsv2rgb(hsv), c.a);
    `),

  fx("solarize", "Solarize", "color", "Invert highlights — print blowout.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "pivot", label: "Pivot", min: 0.15, max: 0.85, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 inv = 1.0 - c.rgb;
    // Pivot moves which tones invert — the whole character of a solarisation.
    vec3 sol = mix(c.rgb, inv, step(vec3(uPivot), c.rgb));
    gl_FragColor = vec4(mix(c.rgb, sol, uAmount), c.a);
    `),

  fx("rainbowMap", "Rainbow Map", "color", "Map luminance to a rainbow.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.7 },
     { key: "speed", label: "Cycle", min: 0, max: 2, default: 0.4 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    vec3 rb = hsv2rgb(vec3(fract(l + uTime*uSpeed*0.2), 1.0, 1.0));
    gl_FragColor = vec4(mix(c.rgb, rb, uAmount), c.a);
    `),

  fx("vhsBleed", "VHS Bleed", "color", "Horizontal chroma smear, retro tape.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "tracking", label: "Tracking", min: 0, max: 1, default: 0.5 }],
    `
    // Full tape damage: chroma smear, drifting tracking bands, dropouts and a
    // head-switching tear along the bottom. Previously a faint horizontal
    // chroma offset, which is why it read as interchangeable with RGB Shift.
    float tape = uTime * 0.6;
    float trackBand = smoothstep(mix(0.85, 0.05, uTracking), 1.0, sin(vUv.y * 34.0 - tape * 3.0));
    float wobble = (noise(vec2(vUv.y * 90.0, tape * 4.0)) - 0.5) * uAmount * 0.18 * trackBand;
    // Head switching: the bottom of the frame shears hard, as on a real deck.
    float headSwitch = smoothstep(0.10, 0.0, vUv.y);
    wobble += (noise(vec2(vUv.y * 220.0, tape * 9.0)) - 0.5) * uAmount * 0.34 * headSwitch;
    vec2 uv = vec2(fract(vUv.x + wobble), vUv.y);
    vec3 col;
    col.r = texture2D(uTex, uv + vec2(0.028*uAmount, 0.0)).r;
    col.g = texture2D(uTex, uv).g;
    col.b = texture2D(uTex, uv - vec2(0.040*uAmount, 0.0)).b;
    // Dropouts and luma noise, concentrated in the tracking bands.
    float dropout = step(0.985, noise(vec2(vUv.y * 300.0, tape * 12.0)));
    col = mix(col, vec3(0.78), dropout * uAmount * 0.85);
    col += (noise(vUv * vec2(60.0, 700.0) + tape) - 0.5) * uAmount * 0.34 * (0.3 + trackBand);
    // Interlace darkening so it reads as a tape image rather than a tint.
    col *= 1.0 - 0.24 * uAmount * step(0.5, fract(vUv.y * uResolution.y * 0.5));
    // uv already carries the tracking wobble, so a transparent source's
    // silhouette wobbles with the tape rather than staying rigid under it.
    gl_FragColor = vec4(col, texture2D(uTex, uv).a);
    `),

  fx("scanlines", "CRT Scanlines", "color", "Cathode ray tube banding.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "density", label: "Density", min: 100, max: 1200, default: 600, step: 1 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float s = sin(vUv.y * uDensity) * 0.5 + 0.5;
    c.rgb *= mix(1.0, s, uAmount);
    gl_FragColor = c;
    `),

  fx("posterize", "Posterize", "color", "Quantize tone bands.",
    [{ key: "levels", label: "Levels", min: 2, max: 16, default: 5 },
     { key: "bias", label: "Bias", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // Levels unstepped, because a stepped param snaps under a dragging finger.
    // Bias shifts where the bands land, so one level count can posterise into
    // shadow detail or into highlight detail.
    c.rgb = floor(clamp(c.rgb + (uBias - 0.5) * 0.4, 0.0, 1.0)*uLevels)/uLevels;
    gl_FragColor = c;
    `),

  fx("thermal", "Thermal", "color", "Heat-vision colormap.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.8 },
     { key: "range", label: "Range", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // Range narrows or widens the temperature window.
    float l = clamp((dot(c.rgb, vec3(0.299,0.587,0.114)) - 0.5) * mix(0.45, 2.6, uRange) + 0.5, 0.0, 1.0);
    vec3 cold = vec3(0.05,0.0,0.4);
    vec3 mid  = vec3(0.95,0.2,0.6);
    vec3 hot  = vec3(1.0,1.0,0.4);
    vec3 t = mix(cold, mid, smoothstep(0.0,0.5,l));
    t = mix(t, hot, smoothstep(0.5,1.0,l));
    gl_FragColor = vec4(mix(c.rgb, t, uAmount), c.a);
    `),

  fx("duotone", "Duotone", "color", "Two-color gradient mapping.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.8 },
     { key: "hue", label: "Hue", min: 0, max: 1, default: 0.85 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    vec3 a = hsv2rgb(vec3(uHue, 0.9, 0.15));
    vec3 b = hsv2rgb(vec3(fract(uHue+0.5), 0.9, 1.0));
    gl_FragColor = vec4(mix(c.rgb, mix(a,b,l), uAmount), c.a);
    `),

  fx("noiseTint", "Noise Tint", "color", "Animated tinted grain.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "hue", label: "Hue", min: 0, max: 1, default: 0.9 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float n = rand(vUv*vec2(800.,600.) + uTime*60.0);
    vec3 tint = hsv2rgb(vec3(uHue, 0.9, n));
    gl_FragColor = vec4(mix(c.rgb, c.rgb*0.6 + tint, uAmount), c.a);
    `),

  // ── GEOMETRY ──────────────────────────────────────────────────────
  fx("melt", "Melt", "geometry", "Vertical drip downward.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "speed", label: "Drip", min: 0, max: 2, default: 0.6 }],
    `
    float drip = noise(vec2(vUv.x*40.0, 0.0));
    float t = uTime * uSpeed * 0.3;
    float y = vUv.y + drip * uAmount * (sin(t + drip*10.0)*0.5+0.5) * 0.3;
    gl_FragColor = texture2D(uTex, vec2(vUv.x, clamp(y,0.0,1.0)));
    `),

  fx("liquidWarp", "Liquid Warp", "geometry", "Flowing fluid distortion.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "scale", label: "Scale", min: 1, max: 12, default: 4 }],
    `
    vec2 p = vUv*uScale;
    vec2 d = vec2(noise(p+uTime*0.4), noise(p+10.0-uTime*0.3))-0.5;
    gl_FragColor = texture2D(uTex, vUv + d*uAmount*0.15);
    `),

  fx("ripple", "Ripple", "geometry", "Concentric water ripple.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "freq", label: "Frequency", min: 4, max: 80, default: 30 }],
    `
    vec2 p = vUv-0.5;
    float r = length(p);
    float w = sin(r*uFreq - uTime*4.0) * uAmount * 0.04;
    gl_FragColor = texture2D(uTex, vUv + normalize(p+0.0001)*w);
    `),

  fx("kaleidoscope", "Kaleidoscope", "geometry", "Mirror-symmetry mandala.",
    [{ key: "segments", label: "Segments", min: 2, max: 16, default: 6 },
     { key: "spin", label: "Spin", min: 0, max: 1, default: 0.3 }],
    `
    vec2 p = vUv-0.5;
    float a = atan(p.y,p.x) + uSpin * uTime * 0.6;
    float r = length(p);
    float seg = 6.2831853/uSegments;
    a = mod(a, seg);
    a = abs(a - seg*0.5);
    vec2 uv = vec2(cos(a), sin(a))*r + 0.5;
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("mirror", "Mirror", "geometry", "Reflect across axis.",
    [{ key: "axis", label: "Axis", min: 0, max: 1, default: 0 },
     { key: "seam", label: "Seam", min: 0.15, max: 0.85, default: 0.5 }],
    `
    vec2 uv = vUv;
    // Seam moves the fold off centre, turning a symmetric mirror into an
    // off-axis one and giving the pad a live second axis.
    if (uAxis < 0.5) uv.x = uv.x < uSeam ? uv.x/uSeam : (1.0 - uv.x)/(1.0 - uSeam);
    else             uv.y = uv.y < uSeam ? uv.y/uSeam : (1.0 - uv.y)/(1.0 - uSeam);
    gl_FragColor = texture2D(uTex, clamp(uv, 0.0, 1.0));
    `),

  fx("lensWarp", "Lens Warp", "geometry", "Barrel/pincushion distortion.",
    [{ key: "amount", label: "Amount", min: -1, max: 1, default: 0.45 },
     { key: "fringe", label: "Fringe", min: 0, max: 1, default: 0.4 }],
    `
    vec2 p = vUv-0.5;
    float r2 = dot(p,p);
    // Real glass disperses as it bends; per-channel fringing is what makes this
    // read as a lens rather than a plain pinch.
    float k = 1.0 + uAmount*r2*2.0;
    vec3 col;
    col.r = texture2D(uTex, p * (k * (1.0 + uFringe*0.10)) + 0.5).r;
    col.g = texture2D(uTex, p * k + 0.5).g;
    col.b = texture2D(uTex, p * (k * (1.0 - uFringe*0.10)) + 0.5).b;
    // Alpha follows the un-fringed lens curve (the green channel's UV) — a
    // transparent source's silhouette barrels/pinches with the lens, just
    // without the chromatic fringe that only applies to color.
    gl_FragColor = vec4(col, texture2D(uTex, p * k + 0.5).a);
    `),

  fx("twirl", "Twirl", "geometry", "Spiral swirl from center.",
    [{ key: "amount", label: "Amount", min: -2, max: 2, default: 0.9 },
     { key: "falloff", label: "Falloff", min: 0, max: 1, default: 0.5 }],
    `
    vec2 p = vUv-0.5;
    float r = length(p);
    // Falloff sets how fast the twist dies with radius: tight vortex through
    // to a whole-frame rotation.
    float a = atan(p.y,p.x) + uAmount * pow(max(0.0, 1.0 - r), mix(0.35, 3.5, uFalloff)) * 3.0;
    gl_FragColor = texture2D(uTex, vec2(cos(a),sin(a))*r + 0.5);
    `),

  // ── ATMOSPHERE ────────────────────────────────────────────────────
  fx("filmGrain", "Film Grain", "atmosphere", "Emulsion grain with halation bleeding off the highlights.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "halation", label: "Halation", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // Real grain peaks in the midtones and vanishes in clean black and blown
    // white. A flat noise add — what this was — is exactly the sort of uniform
    // veil that gets averaged away the moment anything is stacked on it. It
    // also only had one param, so the pad's Y axis fell through to opacity.
    float response = 4.0 * l * (1.0 - l);
    float n1 = rand(vUv * uResolution + fract(uTime) * 100.0) - 0.5;
    float n2 = rand(vUv * uResolution * 0.5 + fract(uTime * 1.7) * 57.0) - 0.5;
    float grain = (n1 * 0.65 + n2 * 0.35) * response;
    // Grain lives in three emulsion layers, so it is coloured, not monochrome.
    vec3 chroma = vec3(rand(vUv * uResolution + 1.3),
                       rand(vUv * uResolution + 7.7),
                       rand(vUv * uResolution + 3.1)) - 0.5;
    vec3 col = c.rgb + (grain * 1.6 + chroma * 0.5 * response) * uAmount;
    // Halation: bright areas bleed a warm ring into the emulsion around them.
    float hal = max(0.0, dot(discBlur(vUv, 11.0), vec3(0.299, 0.587, 0.114)) - 0.55);
    col += vec3(1.0, 0.40, 0.20) * hal * uHalation * 1.8;
    gl_FragColor = vec4(col, c.a);
    `),

  fx("bloom", "Bloom", "atmosphere", "Fake luminous halo.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "threshold", label: "Threshold", min: 0, max: 0.8, default: 0.45 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // 13-tap disc rather than a 7x7 grid: the old kernel spanned +/-3 taps at
    // 4px spacing, so 12px of reach buys the same halo for a quarter of the cost.
    vec3 glow = discBright(vUv, 14.0, uThreshold);
    // Threshold capped below 1.0 and the gain renormalised by what survives it.
    // At threshold 1.0 nothing exceeded the cut and the effect vanished
    // completely — dragging the pad's Y axis up used to switch bloom OFF.
    float gain = 5.5 / max(0.25, 1.0 - uThreshold);
    gl_FragColor = vec4(c.rgb + glow * uAmount * gain, c.a);
    `),

  fx("staticSnow", "Static Snow", "atmosphere", "Dead-channel TV noise.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "coarse", label: "Coarse", min: 0, max: 1, default: 0.3 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // Coarse runs the snow from fine sensor noise to chunky dead-channel
    // blocks — a different texture, not merely more of the same.
    vec2 grid = mix(vec2(1024.0, 768.0), vec2(90.0, 64.0), uCoarse);
    float n = rand(floor(vUv*grid) + floor(uTime*24.0));
    gl_FragColor = vec4(mix(c.rgb, vec3(n), uAmount*0.85), c.a);
    `),

  fx("fog", "Fog", "atmosphere", "Drifting banks lit from behind, with real depth.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "hue", label: "Hue", min: 0, max: 1, default: 0.6 }],
    `
    // Layered drifting banks with light scattering through them, rather than
    // one flat noise tint — the old version veiled uniformly and disappeared
    // under any other effect.
    float t = uTime * 0.06;
    float n1 = noise(vUv * vec2(3.0, 1.6) + vec2(t, t * 0.3));
    float n2 = noise(vUv * vec2(7.0, 3.2) - vec2(t * 1.7, t * 0.4));
    float bank = n1 * 0.65 + n2 * 0.35;
    // Thickest low in the frame, thinning with height.
    float depth = smoothstep(1.05, -0.15, vUv.y);
    float density = clamp(bank * depth * uAmount * 2.1, 0.0, 1.0);
    // Refract through the fog so it displaces as well as tints; a pure tint is
    // what made it interchangeable with grain and haze.
    vec2 uv = vUv + vec2(n1 - 0.5, n2 - 0.5) * density * 0.045;
    vec4 cTex = texture2D(uTex, uv);
    vec3 c = cTex.rgb;
    // Scattering: the bank glows where the frame behind it is bright.
    float glow = max(0.0, dot(discBlur(vUv, 16.0), vec3(0.299, 0.587, 0.114)) - 0.32);
    vec3 haze = mix(hsv2rgb(vec3(uHue, 0.35, 0.72)), vec3(1.0, 0.95, 0.86), clamp(glow * 1.8, 0.0, 1.0));
    // The haze is atmosphere sitting in front of the subject, not a
    // separate opaque object, so it shouldn't punch new holes in — or fill
    // in — a transparent source's own silhouette. Alpha rides the
    // refracted uv (the fog's own displacement), unaffected by the color mix.
    gl_FragColor = vec4(mix(c, haze, density), cTex.a);
    `),

  fx("lightLeak", "Light Leak", "atmosphere", "Vintage edge flares.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "warmth", label: "Warmth", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float d = distance(vUv, vec2(0.1 + sin(uTime*0.3)*0.1, 0.5));
    // Warmth runs the leak from a cold flare to a sun-struck orange one.
    vec3 tint = mix(vec3(0.35, 0.75, 1.0), vec3(1.0, 0.45, 0.15), uWarmth);
    gl_FragColor = vec4(c.rgb + tint * smoothstep(mix(0.35, 0.95, uWarmth), 0.0, d) * uAmount * 1.5, c.a);
    `),

  fx("holoShine", "Holographic Shine", "atmosphere", "Iridescent sweep.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float s = sin((vUv.x + vUv.y)*8.0 + uTime*uSpeed)*0.5+0.5;
    vec3 holo = hsv2rgb(vec3(s, 0.8, 1.0));
    gl_FragColor = vec4(mix(c.rgb, c.rgb + holo*0.6, uAmount*s), c.a);
    `),

  // ── ADVANCED CORRUPTION ───────────────────────────────────────────
  fx("asciiCollapse", "ASCII Collapse", "corruption", "Image dissolves into glyph quantization.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "size", label: "Cell", min: 4, max: 40, default: 12, step: 1 }],
    `
    vec2 px = 1.0/uResolution;
    vec2 cell = floor(vUv/(px*uSize))*(px*uSize) + px*uSize*0.5;
    vec4 c = texture2D(uTex, cell);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    vec2 inner = fract(vUv/(px*uSize));
    float glyph = step(0.5 - l*0.5, inner.x) * step(inner.x, 0.5 + l*0.5);
    glyph *= step(0.1, inner.y) * step(inner.y, 0.9);
    glyph += step(0.45, abs(inner.y - (1.0-l))) * 0.3;
    vec3 ascii = c.rgb * glyph;
    gl_FragColor = vec4(mix(c.rgb, ascii, uAmount), c.a);
    `),

  fx("hexShatter", "Hex Shatter", "corruption", "Hexagonal cell fracturing with random offsets.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Scale", min: 5, max: 80, default: 30 }],
    `
    vec2 p = vUv * uScale;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r*0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p + h, r) - h;
    vec2 gv = dot(a,a) < dot(b,b) ? a : b;
    vec2 id = (vUv*uScale - gv);
    vec2 off = (vec2(rand(id), rand(id+3.7)) - 0.5) * uAmount * 0.15;
    float crack = smoothstep(0.45, 0.5, max(abs(gv.x), abs(gv.y)));
    vec4 c = texture2D(uTex, vUv + off);
    gl_FragColor = vec4(c.rgb * (1.0 - crack*uAmount), c.a);
    `),

  fx("bitCrush", "Bit Crush", "corruption", "Quantize coordinates AND color — pure 8-bit decay.",
    [{ key: "bits", label: "Bits", min: 1, max: 8, default: 3, step: 1 },
     { key: "pixels", label: "Pixel Size", min: 1, max: 40, default: 6, step: 1 }],
    `
    vec2 px = 1.0/uResolution * uPixels;
    vec2 uv = floor(vUv/px)*px;
    vec4 c = texture2D(uTex, uv);
    float q = pow(2.0, uBits);
    c.rgb = floor(c.rgb*q)/q;
    gl_FragColor = c;
    `),

  fx("glitchTeleport", "Teleport", "corruption", "Random rectangular regions swap coordinates.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "speed", label: "Speed", min: 0, max: 8, default: 2 }],
    `
    float t = floor(uTime*uSpeed);
    vec2 cell = floor(vUv*8.0);
    float r = rand(cell + t);
    vec2 jump = vec2(rand(cell+t+1.3), rand(cell+t+5.1));
    vec2 uv = mix(vUv, jump + fract(vUv*8.0)/8.0, step(1.0-uAmount*0.6, r));
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("scanlineWarp", "Scanline Warp", "corruption", "Each row sampled from a different time-warped position.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "freq", label: "Frequency", min: 1, max: 60, default: 18 }],
    `
    float w = sin(vUv.y*uFreq + uTime*2.0) * cos(vUv.y*uFreq*0.37 - uTime*1.3);
    vec2 uv = vec2(fract(vUv.x + w*uAmount*0.2), vUv.y);
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("pixelExplode", "Pixel Explode", "corruption", "Pixels fly outward from center based on luminance.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "shatter", label: "Shatter", min: 0, max: 1, default: 0.4 }],
    `
    vec2 p = vUv - 0.5;
    vec4 base = texture2D(uTex, vUv);
    float l = dot(base.rgb, vec3(0.299,0.587,0.114));
    // Shatter breaks the push into blocks, so it reads as fragments flying
    // apart rather than as a smooth warp.
    vec2 cell = vec2(mix(6.0, 48.0, uShatter));
    float bl = dot(texture2D(uTex, floor(vUv * cell) / cell).rgb, vec3(0.299,0.587,0.114));
    vec2 uv = vUv - p * (mix(l, bl, uShatter) - 0.5) * uAmount * 1.1;
    gl_FragColor = texture2D(uTex, clamp(uv, 0.0, 1.0));
    `),

  // ── ADVANCED COLOR ────────────────────────────────────────────────
  fx("chromaPulse", "Chroma Pulse", "color", "RGB channels pulse with independent breathing rhythms.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    float t = uTime * uSpeed;
    vec2 dr = vec2(cos(t), sin(t)) * uAmount * 0.03;
    vec2 dg = vec2(cos(t*1.37+2.0), sin(t*1.37+2.0)) * uAmount * 0.03;
    vec2 db = vec2(cos(t*0.73+4.0), sin(t*0.73+4.0)) * uAmount * 0.03;
    float r = texture2D(uTex, vUv+dr).r;
    float g = texture2D(uTex, vUv+dg).g;
    float b = texture2D(uTex, vUv+db).b;
    // Alpha rides the green channel's own breathing offset.
    gl_FragColor = vec4(r,g,b,texture2D(uTex, vUv+dg).a);
    `),

  fx("oilSlick", "Oil Slick", "color", "Iridescent thin-film interference based on luminance.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "freq", label: "Frequency", min: 1, max: 20, default: 6 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
    float angle = l*uFreq + uTime*0.3 + noise(vUv*4.0)*2.0;
    vec3 oil = 0.5 + 0.5*cos(angle + vec3(0.0, 2.094, 4.188));
    gl_FragColor = vec4(mix(c.rgb, c.rgb*oil*1.5, uAmount), c.a);
    `),

  fx("infraredDream", "Infrared Dream", "color", "Foliage-style false-color channel swap.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "bloom", label: "Bloom", min: 0, max: 1, default: 0.4 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 sw = vec3(c.g, c.b*0.6 + c.r*0.4, c.r);
    sw.r = pow(sw.r, 0.7);
    // Aerochrome foliage glows; blooming the swapped red sells the false colour.
    sw += vec3(1.0, 0.35, 0.55) * max(0.0, sw.r - 0.45) * uBloom * 1.6;
    gl_FragColor = vec4(mix(c.rgb, sw, uAmount), c.a);
    `),

  fx("colorQuake", "Color Quake", "color", "Chaotic per-region hue jolts.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Scale", min: 2, max: 40, default: 12 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec2 cell = floor(vUv*uScale);
    float shift = (rand(cell + floor(uTime*3.0)) - 0.5) * uAmount;
    vec3 hsv = rgb2hsv(c.rgb);
    hsv.x = fract(hsv.x + shift);
    hsv.y = clamp(hsv.y * (1.0 + shift*2.0), 0.0, 1.0);
    gl_FragColor = vec4(hsv2rgb(hsv), c.a);
    `),

  fx("paletteDither", "Palette Dither", "color", "Bayer-dither into a tight retro palette.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.85 },
     { key: "levels", label: "Levels", min: 2, max: 8, default: 4, step: 1 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec2 p = mod(floor(vUv*uResolution), 4.0);
    float bayer = (p.x + p.y*4.0)/16.0 - 0.5;
    vec3 d = c.rgb + bayer*0.15;
    d = floor(d*uLevels)/uLevels;
    gl_FragColor = vec4(mix(c.rgb, d, uAmount), c.a);
    `),

  fx("voltage", "Voltage", "color", "Edge-detected neon outline glow.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "hue", label: "Hue", min: 0, max: 1, default: 0.55 }],
    `
    vec2 px = 1.0/uResolution;
    float l = dot(texture2D(uTex, vUv).rgb, vec3(0.299,0.587,0.114));
    float lx = dot(texture2D(uTex, vUv+vec2(px.x,0.0)).rgb, vec3(0.299,0.587,0.114));
    float ly = dot(texture2D(uTex, vUv+vec2(0.0,px.y)).rgb, vec3(0.299,0.587,0.114));
    float edge = abs(l-lx) + abs(l-ly);
    edge = smoothstep(0.02, 0.3, edge*8.0);
    vec3 neon = hsv2rgb(vec3(uHue + edge*0.2, 1.0, 1.0));
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(mix(c.rgb, c.rgb + neon*edge*2.0, uAmount), c.a);
    `),

  // ── ADVANCED GEOMETRY ─────────────────────────────────────────────
  fx("fractalZoom", "Fractal Zoom", "geometry", "Recursive self-similar zoom into the image.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "depth", label: "Depth", min: 1, max: 6, default: 3, step: 1 }],
    `
    vec2 uv = vUv;
    vec4 c = vec4(0.0);
    float w = 0.0;
    for (int i=0; i<6; i++) {
      if (float(i) >= uDepth) break;
      float s = pow(0.6, float(i));
      vec2 p = (uv - 0.5) * s + 0.5 + vec2(sin(uTime*0.3+float(i)), cos(uTime*0.4+float(i)))*0.05;
      c += texture2D(uTex, p) * s;
      w += s;
    }
    gl_FragColor = mix(texture2D(uTex,vUv), c/w, uAmount);
    `),

  fx("polarFold", "Polar Fold", "geometry", "Convert to polar coords then fold — alien topology.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     // Deliberately past a full turn: twist scales with radius so this is a
     // spiral rather than a plain rotation, but a 0..2*PI range still made the
     // outer edge land back where it started. More range is also more spiral.
     { key: "twist", label: "Twist", min: 0, max: 9.0, default: 1.8 }],
    `
    vec2 p = vUv - 0.5;
    float r = length(p)*2.0;
    float a = atan(p.y, p.x) + uTwist*r;
    vec2 polar = vec2(a/6.2831853 + 0.5, r);
    polar = abs(fract(polar)*2.0 - 1.0);
    vec2 uv = mix(vUv, polar, uAmount);
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("displacement", "Displacement Field", "geometry", "Perlin-driven flowing turbulence with curl.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "scale", label: "Scale", min: 1, max: 16, default: 5 }],
    `
    // Speed folded into a constant: a third param is unreachable from the pad,
    // which binds X to params[0] and Y to params[1].
    vec2 p = vUv*uScale + uTime*0.12;
    float n1 = noise(p);
    float n2 = noise(p + vec2(5.2, 1.3));
    vec2 grad = vec2(noise(p+vec2(0.01,0.0))-n1, noise(p+vec2(0.0,0.01))-n2);
    vec2 curl = vec2(-grad.y, grad.x);
    gl_FragColor = texture2D(uTex, vUv + curl*uAmount*4.0);
    `),

  fx("pageCurl", "Reality Tear", "geometry", "Diagonal page-curl ripping the image apart.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     // Half a turn: a tear direction of 2*PI is identical to 0, so a full drag
     // of the pad's Y axis used to land exactly where it started.
     { key: "angle", label: "Angle", min: 0, max: 3.14159, default: 0.785 }],
    `
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    float d = dot(vUv - 0.5, dir);
    float wave = sin(d*20.0 + uTime*2.0) * uAmount * 0.06;
    vec2 uv = vUv + dir * wave;
    float fold = smoothstep(0.0, 0.3, d - uAmount*0.3);
    uv += dir * fold * uAmount * 0.2;
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("crystalize", "Crystalize", "geometry", "Voronoi shattering into crystal facets.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "scale", label: "Scale", min: 4, max: 60, default: 20 }],
    `
    vec2 p = vUv*uScale;
    vec2 ip = floor(p), fp = fract(p);
    vec2 best = vec2(0.0);
    float bd = 99.0;
    for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) {
      vec2 g = vec2(float(i),float(j));
      vec2 o = vec2(rand(ip+g), rand(ip+g+3.7));
      o = 0.5 + 0.5*sin(uTime*0.3 + 6.28*o);
      vec2 r = g + o - fp;
      float d = dot(r,r);
      if (d < bd) { bd = d; best = ip+g+o; }
    }
    vec2 cuv = best/uScale;
    gl_FragColor = mix(texture2D(uTex,vUv), texture2D(uTex,cuv), uAmount);
    `),

  fx("zoomBlur", "Zoom Blur", "geometry", "Motion blur from the centre — radial through to rotational.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "spin", label: "Spin", min: 0, max: 1, default: 0.25 }],
    `
    // Absorbed the old separate Spin Blur. A pure rotational smear measured as
    // a near-duplicate of this, of Frame Smear and of Prism Dispersion, so the
    // two are now one effect with an axis running radial -> rotational, which
    // also gives Zoom Blur the second param its pad axis was missing.
    vec2 mid = vec2(0.5);
    vec2 p = vUv - mid;
    float r = length(p);
    float a0 = atan(p.y, p.x);
    vec4 acc = vec4(0.0);
    float w = 0.0;
    for (int i = 0; i < 10; i++) {
      float t = float(i) / 10.0;
      // Radial component pulls in toward the centre, rotational sweeps the arc.
      float scale = 1.0 - t * uAmount * 0.34 * (1.0 - uSpin);
      float ang = a0 + (t - 0.5) * uAmount * 1.5 * uSpin;
      vec2 uv = mid + vec2(cos(ang), sin(ang)) * r * scale;
      float k = 1.0 - t * 0.45;
      acc += texture2D(uTex, uv) * k;
      w += k;
    }
    gl_FragColor = acc / w;
    `),

  fx("perspectiveTilt", "Perspective Tilt", "geometry", "3D rotational tilt with depth distortion.",
    [{ key: "amount", label: "Amount", min: -1, max: 1, default: 0.5 },
     { key: "axis", label: "Axis", min: 0, max: 1, default: 0, step: 1 }],
    `
    vec2 p = vUv - 0.5;
    float t = uAmount * 0.7;
    if (uAxis < 0.5) {
      float z = 1.0 + p.x*t;
      p /= z;
    } else {
      float z = 1.0 + p.y*t;
      p /= z;
    }
    gl_FragColor = texture2D(uTex, p+0.5);
    `),

  // ── ADVANCED ATMOSPHERE ───────────────────────────────────────────
  fx("godRays", "God Rays", "atmosphere", "Volumetric light shafts from a moving source.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "decay", label: "Decay", min: 0.8, max: 1.0, default: 0.95 }],
    `
    vec2 src = vec2(0.5 + sin(uTime*0.2)*0.3, 0.5 + cos(uTime*0.15)*0.3);
    // 8 march steps instead of 12, each proportionally longer so the shafts
    // reach just as far. The falloff hides the coarser sampling.
    vec2 dir = (vUv - src)/8.0;
    vec2 uv = vUv;
    vec3 acc = vec3(0.0);
    float w = 1.0;
    for (int i=0;i<8;i++) {
      uv -= dir;
      vec3 s = texture2D(uTex, uv).rgb;
      float l = max(0.0, dot(s, vec3(0.299,0.587,0.114)) - 0.4);
      acc += s * l * w;
      w *= uDecay;
    }
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(c.rgb + acc*uAmount*0.45, c.a);
    `),

  fx("auroraVeil", "Aurora Veil", "atmosphere", "Flowing iridescent curtain overlay.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 3, default: 0.8 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float n = noise(vec2(vUv.x*3.0, vUv.y*8.0 + uTime*uSpeed));
    n *= noise(vec2(vUv.x*7.0 - uTime*uSpeed*0.5, vUv.y*2.0));
    vec3 aurora = hsv2rgb(vec3(0.4 + vUv.y*0.3 + uTime*0.05, 0.8, 1.0));
    gl_FragColor = vec4(c.rgb + aurora*n*uAmount*1.5, c.a);
    `),

  fx("dustMotes", "Dust Motes", "atmosphere", "Floating bokeh particles.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "density", label: "Density", min: 10, max: 200, default: 60 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // Was effectively invisible: only a tenth of cells held a mote and each was
    // a sub-pixel dot, so the whole effect measured ~0.001 change at full
    // strength. Bigger, softer, far more of them, with a warm glow instead of a
    // flat white pixel.
    vec2 p = vUv*uDensity;
    vec2 ip = floor(p), fp = fract(p) - 0.5;
    vec2 off = (vec2(rand(ip), rand(ip+5.3)) - 0.5)*0.6;
    fp -= off + vec2(sin(uTime*0.5+rand(ip)*6.28), cos(uTime*0.4+rand(ip)*6.28))*0.25;
    float d = length(fp);
    float seed = rand(ip+1.7);
    float size = mix(0.16, 0.42, rand(ip+9.1));
    float mote = smoothstep(size, 0.0, d) * step(0.45, seed);
    // Soft halo around each mote so they read as out-of-focus particles.
    mote += smoothstep(size*2.2, 0.0, d) * step(0.45, seed) * 0.35;
    vec3 tint = mix(vec3(1.0, 0.94, 0.82), vec3(0.82, 0.92, 1.0), rand(ip+4.4));
    gl_FragColor = vec4(c.rgb + tint*mote*uAmount*1.6, c.a);
    `),

  fx("dreamGlow", "Dream Glow", "atmosphere", "Soft Orton-effect dreamy diffusion.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "radius", label: "Radius", min: 1, max: 12, default: 5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    // Disc kernel rather than a 7x7 Gaussian: same look, 13 fetches not 49.
    // uRadius*3 matches the old kernel's reach (it stepped +/-3 taps).
    vec3 blur = discBlur(vUv, uRadius * 3.0);
    vec3 screen = 1.0 - (1.0 - c.rgb) * (1.0 - blur);
    gl_FragColor = vec4(mix(c.rgb, screen, uAmount), c.a);
    `),

  fx("vignette", "Vignette", "atmosphere", "Cinematic edge darkening with optional color.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "size", label: "Size", min: 0.25, max: 0.95, default: 0.62 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float d = distance(vUv, vec2(0.5));
    // Max size capped at 0.95: the corners of a UV square are only 0.707 from
    // centre, so a size of 1.5 put the entire falloff outside the frame and the
    // vignette silently did nothing.
    float v = smoothstep(uSize, uSize*0.35, d);
    gl_FragColor = vec4(c.rgb * mix(1.0, v, uAmount), c.a);
    `),

  fx("plasmaField", "Plasma Field", "atmosphere", "Animated plasma overlay — pure psychedelic energy.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "scale", label: "Scale", min: 1, max: 20, default: 6 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec2 p = vUv*uScale;
    // Speed folded into a constant: a third param is unreachable from the pad.
    float t = uTime;
    float v = sin(p.x + t) + sin(p.y + t*1.3) + sin((p.x+p.y)*0.7 + t*0.7) + sin(length(p-uScale*0.5)*1.5 + t);
    vec3 plasma = 0.5 + 0.5*cos(v + vec3(0.0, 2.094, 4.188));
    gl_FragColor = vec4(mix(c.rgb, c.rgb*plasma*1.4, uAmount), c.a);
    `),

  fx("scanFreeze", "Scan Freeze", "atmosphere", "Frozen rolling scanline with frost crystals.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 3, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float band = fract(vUv.y - uTime*uSpeed*0.1);
    // The frozen band covered 5% of the frame; widened so it actually sweeps.
    float freeze = smoothstep(0.34, 0.0, abs(band - 0.5));
    float frost = noise(vUv*60.0 + band*10.0);
    // Displace inside the band too, so it reads as a frozen tear rather than a
    // faint tint.
    vec3 ice = vec3(0.7, 0.9, 1.0) * frost;
    c = texture2D(uTex, vUv + vec2((frost-0.5)*0.11*freeze, 0.0));
    // Inside the band the image crystallises: desaturated, posterised, cold.
    float fl = dot(c.rgb, vec3(0.299,0.587,0.114));
    vec3 frozen = mix(vec3(fl), c.rgb, 0.25) * vec3(0.72, 0.86, 1.12);
    frozen = floor(frozen * 7.0) / 7.0;
    c.rgb = mix(c.rgb, frozen, freeze * 0.85);
    gl_FragColor = vec4(mix(c.rgb, c.rgb*0.5 + ice, freeze*uAmount), c.a);
    `),

  fx("filmicTone", "Filmic Tone", "color", "Contrast, shadow density and colour depth — the remaster pass.",
    [{ key: "punch", label: "Punch", min: 0, max: 1, default: 0.55 },
     { key: "depth", label: "Depth", min: 0, max: 1, default: 0.4 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    // Pull the black point down so shadows have real density instead of sitting
    // grey. Renormalised so highlights don't move with it.
    float bp = uDepth * 0.18;
    c = clamp((c - bp) / max(1e-3, 1.0 - bp), 0.0, 1.0);
    // Filmic S-curve. smoothstep IS an S by construction, so this always
    // steepens the midtones and rolls off softly at both ends rather than
    // hard-clipping the way a straight multiply would. Applied twice at the top
    // of the range for a steeper curve, with no branch.
    float t = uPunch * 2.0;
    vec3 s = mix(c, smoothstep(vec3(0.0), vec3(1.0), c), clamp(t, 0.0, 1.0));
    s = mix(s, smoothstep(vec3(0.0), vec3(1.0), s), clamp(t - 1.0, 0.0, 1.0));
    // A contrast curve desaturates as it compresses — put the colour back.
    float l = dot(s, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(clamp(mix(vec3(l), s, 1.0 + uPunch * 0.45), 0.0, 1.0), srcTex.a);
    `),

  // ── SIGNATURE SET ─────────────────────────────────────────────────
  // Built for the semantic role instrument. Every effect below takes exactly
  // TWO continuous params, because a canvas drag binds X to params[0]
  // and Y to params[1] — a third param would be unreachable by gesture and
  // a single one would push Y onto layer opacity. No `step` either: a
  // stepped param visibly snaps under a finger. Several read uPulse so
  // they answer taps, the mic and the beat clock rather than only the clock.

  fx("drosteTunnel", "Droste Tunnel", "geometry", "Endless recursive zoom — the image falls into itself forever.",
    [{ key: "depth", label: "Depth", min: 0, max: 1, default: 0.5 },
     { key: "twist", label: "Twist", min: -1, max: 1, default: 0.3 }],
    `
    vec2 c = vUv - 0.5;
    c.x *= uResolution.x / max(uResolution.y, 1.0);
    float r = max(length(c), 1e-4);
    float a = atan(c.y, c.x);
    // Log-polar space turns "scale by N" into "translate by log N", so a
    // simple scroll along lr yields a seamless infinite zoom.
    float zoom = mix(1.0, 4.0, uDepth);
    float lr = log(r);
    a += uTwist * lr * 1.2 + uTime * 0.12;
    float band = 6.2831 / zoom;
    float rr = exp(mod(lr - uTime * 0.35, band) - band * 0.5);
    vec2 uv = 0.5 + vec2(cos(a), sin(a)) * rr * 0.5;
    // Mirror-tile the lookup so the recursion never hits a clamped edge.
    vec2 muv = abs(fract(uv * 0.5) * 2.0 - 1.0);
    gl_FragColor = texture2D(uTex, muv);
    `),

  fx("shockwave", "Shockwave", "corruption", "Concentric blast rings that refract light — fires on every pulse.",
    [{ key: "amount", label: "Force", min: 0, max: 1, default: 0.5 },
     { key: "rings", label: "Rings", min: 0, max: 1, default: 0.4 }],
    `
    vec2 c = vUv - 0.5;
    c.x *= uResolution.x / max(uResolution.y, 1.0);
    float r = length(c);
    float freq = mix(6.0, 48.0, uRings);
    // uPulse drives the wavefront outward, so taps and beats visibly detonate.
    float wave = sin(r * freq - uTime * 3.0 - uPulse * 7.0);
    float ring = wave * exp(-r * 2.2);
    float amt = uAmount * (0.35 + uPulse * 0.9);
    vec2 dir = c / max(r, 1e-4);
    vec2 off = dir * ring * amt * 0.16;
    // Split the channels across the wavefront — refraction, not just offset.
    vec3 col = vec3(
      texture2D(uTex, vUv + off * 1.3).r,
      texture2D(uTex, vUv + off).g,
      texture2D(uTex, vUv + off * 0.7).b
    );
    col += vec3(0.55, 0.75, 1.0) * max(0.0, ring) * amt * 1.15;
    // Alpha rides the green channel's own refracted offset.
    gl_FragColor = vec4(col, texture2D(uTex, vUv + off).a);
    `),

  fx("liquidChrome", "Liquid Chrome", "color", "Molten mercury — the frame reskinned as poured metal.",
    [{ key: "flow", label: "Flow", min: 0, max: 1, default: 0.5 },
     { key: "sheen", label: "Sheen", min: 0, max: 1, default: 0.6 }],
    `
    vec2 px = 1.0 / uResolution;
    vec2 uv = vUv + (vec2(noise(vUv * 3.0 + uTime * 0.2),
                          noise(vUv * 3.0 - uTime * 0.17)) - 0.5) * 0.04 * uFlow;
    float sp = mix(1.0, 4.0, uFlow);
    vec3 L = vec3(0.299, 0.587, 0.114);
    vec3 base = texture2D(uTex, uv).rgb;
    float l  = dot(base, L);
    float lx = dot(texture2D(uTex, uv + vec2(px.x * sp, 0.0)).rgb, L);
    float ly = dot(texture2D(uTex, uv + vec2(0.0, px.y * sp)).rgb, L);
    // Treat luminance as a height field; its gradient is the surface normal.
    // Flow also deepens the relief, so X sweeps gentle ripple → violent molten.
    float relief = mix(4.0, 18.0, uFlow);
    vec3 n = normalize(vec3((l - lx) * relief, (l - ly) * relief, 1.0));
    vec3 rfl = reflect(vec3(0.0, 0.0, -1.0), n);
    float band = sin(rfl.y * 6.0 + uTime * 0.6) * 0.5 + 0.5;
    vec3 sky = mix(vec3(0.05, 0.06, 0.13), vec3(0.92, 0.96, 1.0), pow(band, 2.0));
    sky += vec3(1.0, 0.45, 0.85) * pow(max(0.0,  rfl.x), 5.0) * 0.6;
    sky += vec3(0.2, 0.9, 1.0)   * pow(max(0.0, -rfl.x), 5.0) * 0.45;
    // Sheen is the polish axis: matte keeps the frame's own colour, mirror
    // replaces it with the reflected environment. Without this the shader
    // collapses to grey steel and the Y axis does nothing.
    vec3 metal = mix(base * (0.55 + l * 0.9), sky * (0.4 + l * 0.8), uSheen);
    float spec = pow(max(0.0, dot(rfl, normalize(vec3(0.4, 0.6, 1.0)))), mix(6.0, 120.0, uSheen));
    vec3 col = metal + spec * (0.4 + uPulse * 0.8) * mix(0.35, 1.0, uSheen);
    // "Mirror" mode replaces the surface's color, not its identity — the
    // silhouette is still the same object, so alpha rides the same
    // flow-displaced uv the color itself samples from.
    gl_FragColor = vec4(col, texture2D(uTex, uv).a);
    `),

  fx("voronoiShatter", "Voronoi Shatter", "geometry", "Organic cellular fracture — safety glass mid-break.",
    [{ key: "density", label: "Shards", min: 0, max: 1, default: 0.45 },
     { key: "displace", label: "Scatter", min: 0, max: 1, default: 0.5 }],
    `
    float cells = mix(4.0, 26.0, uDensity);
    vec2 g = vUv * cells;
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    float d1 = 8.0;
    float d2 = 8.0;
    vec2 bestCell = gi;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec2 cell = gi + o;
        vec2 h = vec2(rand(cell), rand(cell + 7.3));
        vec2 p = o + h;
        // Reuse h for the drift phase — rand() is a sin internally, so hashing
        // again here doubled the transcendental cost of every cell.
        p += 0.25 * vec2(sin(uTime * 0.7 + h.x * 6.28),
                         cos(uTime * 0.6 + h.y * 6.28));
        float d = length(p - gf);
        // Keep the two nearest sites: their difference is the cell border.
        if (d < d1) { d2 = d1; d1 = d; bestCell = cell; }
        else if (d < d2) { d2 = d; }
      }
    }
    vec2 jitter = (vec2(rand(bestCell + 1.7), rand(bestCell + 9.2)) - 0.5) * uDisplace * 0.25;
    vec2 muv = abs(fract((vUv + jitter) * 0.5) * 2.0 - 1.0);
    vec4 col = texture2D(uTex, muv);
    float edge = smoothstep(0.0, 0.07, d2 - d1);
    col.rgb *= 0.2 + 0.8 * edge;
    col.rgb += vec3(0.6, 0.8, 1.0) * (1.0 - edge) * 0.3;
    gl_FragColor = col;
    `),

  fx("prismDispersion", "Prism Dispersion", "color", "Light torn into its spectrum — a diffraction grating over the frame.",
    [{ key: "spread", label: "Spread", min: 0, max: 1, default: 0.45 },
     // Defaults to the linear grating rather than part-way to the radial halo:
     // at a bend of 0.35 this measured as a near-duplicate of Zoom Blur, which
     // owns the radial look.
     { key: "bend", label: "Bend", min: 0, max: 1, default: 0.12 }],
    `
    vec2 c = vUv - 0.5;
    c.x *= uResolution.x / max(uResolution.y, 1.0);
    float r = length(c);
    vec2 radial = c / max(r, 1e-4);
    float ang = 0.8 + uTime * 0.15;
    vec2 linear = vec2(cos(ang), sin(ang));
    // Bend morphs a straight diffraction grating into a radial prism halo.
    // A plain rotation angle would be a dead axis: 0 and 2PI are the same
    // direction, so a full drag would land exactly where it started.
    vec2 dir = normalize(mix(linear, radial, uBend) + vec2(1e-5));
    float reach = 0.004 + uSpread * mix(0.05, 0.05 + r * 0.13, uBend);
    // A grating does not smear the image, it copies it: a sharp zero order
    // straight through, plus dimmer spectral ghosts either side. Averaging the
    // taps instead (the old approach) converged to a coloured blur, which
    // measured as a near-duplicate of Zoom Blur. Keeping the zero order sharp
    // is what makes this read as a prism and keeps the detail HDR-crisp.
    vec3 base = texture2D(uTex, vUv).rgb;
    vec3 ghost = vec3(0.0);
    vec3 wsum = vec3(1e-3);
    // Seven spectral orders, violet through red, each displaced by its own
    // "wavelength" — the longer the wavelength, the further it is bent.
    for (int i = 0; i < 7; i++) {
      float lam = float(i) / 6.0;
      vec3 w = hsv2rgb(vec3(0.72 - lam * 0.72, 1.0, 1.0));
      float off = mix(0.3, 1.0, lam) * reach;
      ghost += (texture2D(uTex, vUv + dir * off).rgb
              + texture2D(uTex, vUv - dir * off).rgb) * w;
      wsum += w * 2.0;
    }
    ghost /= wsum;
    float gl = dot(ghost, vec3(0.299, 0.587, 0.114));
    // Split the ghost into pure colour fringe and its own brightness: the
    // fringe paints spectral edges everywhere, the brightness term only spills
    // out of highlights, the way a real prism throws its rainbow off bright
    // sources rather than washing the whole frame.
    vec3 chroma = ghost - gl;
    vec3 col = base + chroma * (0.9 + uSpread * 1.8) + ghost * gl * gl * uSpread * 1.2;
    // Faint travelling interference fringes sell the grating.
    float fringe = sin(dot(vUv, dir) * 140.0 - uTime * 1.5) * 0.5 + 0.5;
    col *= 1.0 + fringe * uSpread * 0.12;
    gl_FragColor = vec4(col, texture2D(uTex, vUv).a);
    `),

  fx("neonContour", "Neon Contour", "atmosphere", "Everything redrawn as glowing hue-cycling neon tubing.",
    [{ key: "threshold", label: "Threshold", min: 0, max: 1, default: 0.35 },
     { key: "glow", label: "Glow", min: 0, max: 1, default: 0.6 }],
    `
    vec2 px = 1.0 / uResolution;
    vec3 L = vec3(0.299, 0.587, 0.114);
    float tl = dot(texture2D(uTex, vUv + px * vec2(-1.0,-1.0)).rgb, L);
    float tc = dot(texture2D(uTex, vUv + px * vec2( 0.0,-1.0)).rgb, L);
    float tr = dot(texture2D(uTex, vUv + px * vec2( 1.0,-1.0)).rgb, L);
    float ml = dot(texture2D(uTex, vUv + px * vec2(-1.0, 0.0)).rgb, L);
    float mr = dot(texture2D(uTex, vUv + px * vec2( 1.0, 0.0)).rgb, L);
    float bl = dot(texture2D(uTex, vUv + px * vec2(-1.0, 1.0)).rgb, L);
    float bc = dot(texture2D(uTex, vUv + px * vec2( 0.0, 1.0)).rgb, L);
    float br = dot(texture2D(uTex, vUv + px * vec2( 1.0, 1.0)).rgb, L);
    float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
    float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
    float e = length(vec2(gx, gy));
    float t = mix(0.06, 0.9, uThreshold);
    float edge = smoothstep(t * 0.45, t, e);
    vec3 hue = hsv2rgb(vec3(fract(uTime * 0.06 + vUv.y * 0.35 + vUv.x * 0.15), 0.85, 1.0));
    // Higher glow dims the plate further so the tubing reads as light.
    vec3 base = texture2D(uTex, vUv).rgb * mix(0.55, 0.08, uGlow);
    vec3 col = base + hue * edge * (0.6 + uGlow * 2.2) * (0.75 + uPulse * 0.8);
    gl_FragColor = vec4(col, texture2D(uTex, vUv).a);
    `),

  fx("inkFlow", "Ink Flow", "corruption", "Pixels dragged along a curling current — ink bleeding through water.",
    [{ key: "flow", label: "Current", min: 0, max: 1, default: 0.5 },
     { key: "scale", label: "Turbulence", min: 0, max: 1, default: 0.4 }],
    `
    float sc = mix(1.5, 9.0, uScale);
    float t = uTime * 0.3;
    float e = 0.02;
    // Curl of a scalar noise field is divergence-free, so the image is
    // advected along smooth closed streamlines instead of smearing outward.
    vec2 p = vUv * sc;
    vec2 curl = vec2(noise(p + vec2(0.0, e) + t) - noise(p - vec2(0.0, e) + t),
                    -(noise(p + vec2(e, 0.0) - t) - noise(p - vec2(e, 0.0) - t))) / (2.0 * e);
    vec2 uv = vUv + curl * uFlow * 0.055;
    // A second advection step lengthens the streamlines into ribbons.
    vec2 p2 = uv * sc;
    vec2 curl2 = vec2(noise(p2 + vec2(0.0, e) + t) - noise(p2 - vec2(0.0, e) + t),
                     -(noise(p2 + vec2(e, 0.0) - t) - noise(p2 - vec2(e, 0.0) - t))) / (2.0 * e);
    uv += curl2 * uFlow * 0.04;
    vec4 col = texture2D(uTex, uv);
    // Ink density shading along the flow, strong enough to read through a stack.
    float dens = clamp(length(curl) * 0.14, 0.0, 1.0);
    vec3 ink = mix(vec3(0.03, 0.05, 0.11), vec3(0.55, 0.16, 0.42), dens);
    col.rgb = mix(col.rgb, col.rgb * (1.0 - dens * 0.75) + ink * dens * 1.4, uFlow);
    gl_FragColor = col;
    `),

  // ── EXPANSION SET ─────────────────────────────────────────────────
  // Chosen to cover territory the existing library genuinely lacked rather
  // than to pad a number: print/repro processes, optical artefacts, painterly
  // filters and temporal scanning. Same contract as the signature set — exactly
  // two continuous params, so both pad axes stay live.

  fx("halftone", "Halftone", "color", "CMYK dot screen — newsprint under a loupe.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "scale", label: "Dot Size", min: 0, max: 1, default: 0.45 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    float px = mix(160.0, 26.0, uScale);
    vec2 a = vUv * uResolution / uResolution.y * px;
    // Each ink gets its own screen angle, the way real process printing avoids
    // moire between separations.
    vec3 ink = 1.0 - c;
    vec3 outC = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float ang = 0.2618 + float(i) * 0.5236;
      vec2 r = vec2(a.x * cos(ang) - a.y * sin(ang), a.x * sin(ang) + a.y * cos(ang));
      vec2 cell = fract(r) - 0.5;
      float d = length(cell) * 2.0;
      outC[i] = 1.0 - smoothstep(ink[i] - 0.25, ink[i] + 0.25, d);
    }
    gl_FragColor = vec4(mix(c, 1.0 - outC, uAmount), srcTex.a);
    `),

  fx("crossHatch", "Cross Hatch", "color", "Pen-and-ink engraving that follows the shading.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.75 },
     { key: "density", label: "Density", min: 0, max: 1, default: 0.5 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec2 a = vUv * uResolution / uResolution.y * mix(90.0, 320.0, uDensity);
    // Four hatch layers, each cutting in as the tone gets darker.
    float h = 1.0;
    if (l < 0.85) h = min(h, smoothstep(0.0, 0.5, abs(sin((a.x + a.y) * 0.7))));
    if (l < 0.62) h = min(h, smoothstep(0.0, 0.5, abs(sin((a.x - a.y) * 0.7))));
    if (l < 0.42) h = min(h, smoothstep(0.0, 0.5, abs(sin(a.y * 0.9))));
    if (l < 0.22) h = min(h, smoothstep(0.0, 0.5, abs(sin(a.x * 0.9))));
    vec3 ink = mix(vec3(0.06, 0.05, 0.08), vec3(0.98, 0.97, 0.94), h);
    gl_FragColor = vec4(mix(c, ink, uAmount), srcTex.a);
    `),

  fx("kuwahara", "Painterly", "color", "Kuwahara smoothing — oil paint that keeps its edges.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "radius", label: "Brush", min: 2, max: 16, default: 7 }],
    `
    vec2 px = uRadius / uResolution;
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    // Four overlapping quadrants; the flattest one wins. That is what keeps
    // edges crisp while flat areas go smooth — a blur would soften both.
    vec3 bestMean = c;
    float bestVar = 1e6;
    for (int q = 0; q < 4; q++) {
      vec2 dir = vec2((q == 0 || q == 3) ? 1.0 : -1.0, (q < 2) ? 1.0 : -1.0);
      // 2x2 per quadrant, not 3x3: 16 fetches instead of 36. At 36 this was
      // 19x a passthrough — more than the whole stack's frame budget on its own,
      // which would have made it unreachable by the director.
      vec3 sum = vec3(0.0), sum2 = vec3(0.0);
      for (int i = 0; i < 2; i++) {
        for (int j = 0; j < 2; j++) {
          vec3 t = texture2D(uTex, vUv + dir * vec2(float(i), float(j)) * px * 2.4).rgb;
          sum += t; sum2 += t * t;
        }
      }
      vec3 mean = sum / 4.0;
      vec3 varv = max(vec3(0.0), sum2 / 4.0 - mean * mean);
      float v = varv.r + varv.g + varv.b;
      if (v < bestVar) { bestVar = v; bestMean = mean; }
    }
    gl_FragColor = vec4(mix(c, bestMean, uAmount), srcTex.a);
    `),

  fx("anaglyph", "Anaglyph", "color", "Red/cyan stereo — depth faked from luminance.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "depth", label: "Depth", min: 0, max: 1, default: 0.5 }],
    `
    // Treat brightness as a depth map: bright things read as near, so they get
    // the widest parallax. Crude, but it separates convincingly in motion.
    float l = dot(texture2D(uTex, vUv).rgb, vec3(0.299, 0.587, 0.114));
    // Parallax has to be a real fraction of the frame or the separation is
    // invisible; at 5% it measured as a no-op.
    // Depth needs a baseline separation as well as the luminance-proportional
    // part: with parallax purely proportional to brightness, mid-tones (most of
    // the frame) barely moved and the Depth axis read as dead.
    float par = ((l - 0.45) * 0.65 + 0.35) * uDepth * 0.15;
    vec3 left  = texture2D(uTex, vUv + vec2(par, 0.0)).rgb;
    vec3 right = texture2D(uTex, vUv - vec2(par, 0.0)).rgb;
    // Push the channels apart rather than just swapping them, so the red/cyan
    // fringing reads the way real anaglyph does.
    vec3 stereo = vec3(left.r * 1.15, right.g * 0.95, right.b * 1.1);
    gl_FragColor = vec4(mix(texture2D(uTex, vUv).rgb, stereo, uAmount), texture2D(uTex, vUv).a);
    `),

  fx("photocopy", "Photocopy", "color", "Blown-out repro with toner grain.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "bias", label: "Exposure", min: 0, max: 1, default: 0.5 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    // Local average decides the cut, so the whole frame doesn't crush to one
    // tone the way a fixed threshold would.
    float local = dot(discBlur(vUv, 9.0), vec3(0.299, 0.587, 0.114));
    float cut = local + (uBias - 0.5) * 0.45;
    float toner = smoothstep(cut + 0.05, cut - 0.05, l);
    toner *= 0.82 + 0.18 * noise(vUv * 420.0);
    vec3 paper = vec3(0.96, 0.95, 0.92);
    vec3 res = mix(paper, vec3(0.05, 0.05, 0.07), toner);
    gl_FragColor = vec4(mix(c, res, uAmount), srcTex.a);
    `),

  fx("contourMap", "Contour Map", "color", "Tone quantised into topographic bands.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "bands", label: "Bands", min: 0, max: 1, default: 0.45 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float n = mix(4.0, 26.0, uBands);
    float q = floor(l * n) / n;
    // Bright line exactly on each contour, like an elevation map.
    float edge = abs(fract(l * n) - 0.5) * 2.0;
    float line = smoothstep(0.86, 1.0, edge);
    vec3 banded = hsv2rgb(vec3(fract(0.62 - q * 0.72), 0.62, 0.35 + q * 0.75));
    gl_FragColor = vec4(mix(c, banded + line * 0.55, uAmount), srcTex.a);
    `),

  fx("emboss", "Relief", "geometry", "Lit metal relief stamped from the image.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "depth", label: "Depth", min: 0, max: 1, default: 0.5 }],
    `
    vec2 px = 1.0 / uResolution;
    vec3 L = vec3(0.299, 0.587, 0.114);
    float d = mix(1.0, 5.0, uDepth);
    float l  = dot(texture2D(uTex, vUv).rgb, L);
    float lx = dot(texture2D(uTex, vUv + vec2(px.x * d, 0.0)).rgb, L);
    float ly = dot(texture2D(uTex, vUv + vec2(0.0, px.y * d)).rgb, L);
    float k = 6.0 * (1.0 + uDepth * 3.0);
    vec3 n = normalize(vec3((l - lx) * k, (l - ly) * k, 1.0));
    vec3 lightDir = normalize(vec3(0.6, 0.7, 0.5));
    float diff = max(0.0, dot(n, lightDir));
    float spec = pow(max(0.0, dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0))), 24.0);
    vec3 metal = vec3(0.46, 0.47, 0.52) * (0.35 + diff * 0.9) + spec * 0.85;
    gl_FragColor = vec4(mix(texture2D(uTex, vUv).rgb, metal, uAmount), texture2D(uTex, vUv).a);
    `),

  fx("extrude", "Extrude", "geometry", "The frame pushed into 3D relief and viewed off-axis.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "layers", label: "Depth", min: 0, max: 1, default: 0.5 }],
    `
    // Luminance as a height field, marched as parallax slices. Unlike Relief
    // (which only lights a normal map) or Anaglyph (which splits colour), this
    // physically displaces the frame by depth, so the image reads as extruded
    // geometry seen from an angle.
    vec3 L = vec3(0.299, 0.587, 0.114);
    vec2 view = vec2(0.55, -0.35) * uAmount * 0.16;
    float steps = mix(4.0, 14.0, uLayers);
    vec3 col = texture2D(uTex, vUv).rgb;
    // Tracks the same sample the color comes from — the base pixel until a
    // slice hits, then whichever displaced position "won" — so a transparent
    // source's silhouette gets pushed into the same 3D relief as its color.
    float outA = texture2D(uTex, vUv).a;
    float found = 0.0;
    // March back along the view ray; the first slice whose height clears the
    // ray wins, which produces real occlusion between near and far tones.
    for (int i = 1; i < 15; i++) {
      if (float(i) > steps) break;
      float t = float(i) / steps;
      vec2 uv = vUv + view * t;
      vec4 hitTex = texture2D(uTex, clamp(uv, 0.0, 1.0));
      float h = dot(hitTex.rgb, L);
      if (found < 0.5 && h > 1.0 - t * 1.15) {
        // Shade the extruded wall so the relief has visible sides.
        col = mix(col, hitTex.rgb * (0.45 + 0.75 * (1.0 - t)), uAmount);
        outA = hitTex.a;
        found = 1.0;
      }
    }
    // Rim light along the extrusion edge.
    float edge = abs(dot(texture2D(uTex, vUv + view * 0.35).rgb, L)
                   - dot(texture2D(uTex, vUv).rgb, L));
    col += vec3(0.55, 0.72, 1.0) * smoothstep(0.06, 0.3, edge) * uAmount * 0.55;
    gl_FragColor = vec4(col, outA);
    `),

  fx("moire", "Moire", "geometry", "Two grids beating against each other.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "pitch", label: "Pitch", min: 0, max: 1, default: 0.5 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    vec2 a = vUv * uResolution / uResolution.y;
    float f = mix(60.0, 420.0, uPitch);
    float ang = 0.08 + uTime * 0.05;
    vec2 r = vec2(a.x * cos(ang) - a.y * sin(ang), a.x * sin(ang) + a.y * cos(ang));
    // Interference between two near-identical gratings — the beat pattern is
    // far coarser than either grid, which is what makes moire read.
    float g1 = sin(a.x * f) * sin(a.y * f);
    float g2 = sin(r.x * f * 1.04) * sin(r.y * f * 1.04);
    float beat = (g1 * g2) * 0.5 + 0.5;
    vec3 tint = hsv2rgb(vec3(fract(beat * 0.6 + uTime * 0.03), 0.55, 1.0));
    gl_FragColor = vec4(mix(c, c * (0.35 + beat * 1.3) * tint * 1.4, uAmount), srcTex.a);
    `),

  fx("slitScan", "Slit Scan", "corruption", "Each column sampled from a different moment.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "slices", label: "Slices", min: 0, max: 1, default: 0.4 }],
    `
    // No frame history is available here, so the time offset is expressed as a
    // per-column displacement — the same smeared, stretched read as the real
    // technique, which is what matters.
    float n = mix(6.0, 90.0, uSlices);
    float col = floor(vUv.x * n) / n;
    float phase = sin(col * 24.0 + uTime * 1.6) * 0.5 + 0.5;
    float pull = (phase - 0.5) * uAmount * 0.55;
    vec2 uv = vec2(vUv.x, clamp(vUv.y + pull, 0.0, 1.0));
    vec4 srcTex = texture2D(uTex, uv);
    vec3 c = srcTex.rgb;
    // Seam highlight so the slice boundaries stay legible.
    float seam = smoothstep(0.0, 0.02, abs(fract(vUv.x * n) - 0.5) * 2.0);
    // uv already carries the per-column time-slice pull, so a transparent
    // source's silhouette slit-scans along with its color.
    gl_FragColor = vec4(c * (0.75 + seam * 0.35), srcTex.a);
    `),

  fx("rollingShutter", "Rolling Shutter", "corruption", "CMOS jello — the frame read line by line.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "wobble", label: "Wobble", min: 0, max: 1, default: 0.5 }],
    `
    // A real rolling shutter reads rows at slightly different times, so motion
    // shears the frame. Rows are skewed progressively down the image.
    float t = uTime * mix(1.0, 6.0, uWobble);
    float row = vUv.y;
    float skew = sin(t + row * mix(3.0, 14.0, uWobble)) * uAmount * 0.13;
    skew += (row - 0.5) * uAmount * 0.06;
    vec2 uv = vec2(clamp(vUv.x + skew, 0.0, 1.0), vUv.y);
    vec4 srcTex = texture2D(uTex, uv);
    vec3 c = srcTex.rgb;
    // Slight per-row exposure drift, as real sensors show under flicker.
    c *= 0.9 + 0.2 * sin(t * 2.0 + row * 40.0) * uAmount;
    // uv already carries the row skew, so a transparent source's silhouette
    // shears with the jello rather than staying rigid under it.
    gl_FragColor = vec4(c, srcTex.a);
    `),

  fx("echoTrails", "Echo Trails", "corruption", "Feedback ghosts spiralling off the subject.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "spread", label: "Spread", min: 0, max: 1, default: 0.5 }],
    `
    // Video-feedback look without a frame buffer: successively scaled and
    // rotated samples stand in for the previous frames.
    vec3 acc = texture2D(uTex, vUv).rgb;
    float w = 1.0;
    vec2 mid = vec2(0.5);
    for (int i = 1; i < 7; i++) {
      float t = float(i);
      float sc = 1.0 - t * 0.035 * (0.4 + uSpread);
      float a = t * 0.06 * uSpread + uTime * 0.04;
      vec2 d = vUv - mid;
      vec2 uv = mid + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)) / max(0.35, sc);
      float k = pow(uAmount, t) * 0.95;
      // Each echo is tinted round the hue wheel, so trails read as coloured
      // ghosts rather than as the grey smear Spin Blur and Frame Smear give.
      vec3 tint = hsv2rgb(vec3(fract(t * 0.13 + uTime * 0.05), 0.65, 1.0));
      acc += texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb * mix(vec3(1.0), tint, 0.6) * k;
      w += k;
    }
    // The ghosts are an additive overlay within the base frame's own
    // silhouette, so alpha follows the undisplaced center sample.
    gl_FragColor = vec4(acc / w, texture2D(uTex, vUv).a);
    `),

  fx("caustics", "Caustics", "atmosphere", "Pool light dancing over everything.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Scale", min: 0, max: 1, default: 0.5 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    float sc = mix(4.0, 18.0, uScale);
    vec2 p = vUv * sc;
    float t = uTime * 0.5;
    // Layered ridged noise: the ridges are where light focuses, which is what
    // gives caustics their bright filigree rather than a soft blob.
    float a = abs(noise(p + vec2(t, -t)) - 0.5);
    float b = abs(noise(p * 1.7 + vec2(-t * 0.7, t * 1.1)) - 0.5);
    float ridge = 1.0 - clamp((a + b) * 2.4, 0.0, 1.0);
    ridge = pow(ridge, 3.5);
    vec3 light = vec3(0.62, 0.88, 1.0) * ridge;
    gl_FragColor = vec4(c + light * uAmount * 2.2 * (0.7 + uPulse * 0.6), srcTex.a);
    `),

  fx("anamorphic", "Anamorphic Flare", "atmosphere", "Horizontal blue streaks off the highlights.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "length", label: "Length", min: 0, max: 1, default: 0.55 }],
    `
    vec4 srcTex = texture2D(uTex, vUv);
    vec3 c = srcTex.rgb;
    vec3 L = vec3(0.299, 0.587, 0.114);
    float reach = mix(0.02, 0.20, uLength);
    // Streak purely along X — the signature of an anamorphic lens, and the
    // reason it reads as cinema rather than as a general glow.
    vec3 streak = vec3(0.0);
    float w = 0.0;
    for (int i = -6; i <= 6; i++) {
      float t = float(i) / 6.0;
      vec3 s = texture2D(uTex, vUv + vec2(t * reach, 0.0)).rgb;
      float hi = max(0.0, dot(s, L) - 0.38);
      float k = 1.0 - abs(t);
      streak += s * hi * k;
      w += k;
    }
    streak /= w;
    gl_FragColor = vec4(c + streak * vec3(0.35, 0.6, 1.0) * uAmount * 9.0, srcTex.a);
    `),

  // ── PORTED FROM THE LOVABLE BUILD ─────────────────────────────────
  // These four existed only on the Lovable build and were never in this repo.
  // They are distinct from this library's own caustics / moire / contourMap:
  // those are surface treatments, these are full-frame optical systems.

  fx("feedbackTunnel", "Feedback Tunnel", "geometry", "Fly into an infinite zoom-spiral — the archetypal VJ tunnel remapped from your live feed.",
    [{ key: "speed", label: "Speed", min: 0, max: 4, default: 1.0 },
     { key: "spin", label: "Spin", min: -2, max: 2, default: 0.5 },
     { key: "zoom", label: "Zoom", min: 0.2, max: 3, default: 1.0 }],
    `
    vec2 p = vUv - 0.5;
    float r = max(length(p), 0.0001);
    float a = atan(p.y, p.x);
    float tunnel = -log(r) * uZoom * 0.5 + uTime * uSpeed * 0.4;
    float spinUv = a / 6.2831853 + uTime * uSpin * 0.05;
    vec2 tuv = vec2(fract(spinUv + 0.5), fract(tunnel));
    tuv.x += sin(tuv.y * 6.2831853 + uTime * 0.3) * 0.015 * uZoom;
    vec4 c = texture2D(uTex, tuv);
    float depth = fract(tunnel);
    c.rgb *= 0.2 + 0.8 * (depth * depth);
    c.rgb *= smoothstep(0.0, 0.15, r);
    gl_FragColor = c;
    `),

  fx("topoContour", "Topographic", "color", "Luminance contour bands rendered as animated rainbow elevation lines — like a live topo map.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.85 },
     { key: "bands", label: "Bands", min: 3, max: 30, default: 10, step: 1 },
     { key: "speed", label: "Cycle", min: 0, max: 2, default: 0.4 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float t = lum * uBands + uTime * uSpeed * 0.3;
    float band = fract(t);
    float line = 1.0 - smoothstep(0.0, 0.06, min(band, 1.0 - band));
    float hue = floor(t) / uBands + uTime * uSpeed * 0.04;
    vec3 fillCol = hsv2rgb(vec3(fract(hue), 0.85, 0.9));
    vec3 lineCol = hsv2rgb(vec3(fract(hue + 0.5), 1.0, 1.0));
    vec3 topo = mix(fillCol, lineCol, line);
    gl_FragColor = vec4(mix(c.rgb, topo, uAmount), c.a);
    `),

  fx("causticWater", "Caustic Water", "atmosphere", "Shimmering light refractions as if viewed through a sunlit water surface.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.65 },
     { key: "scale", label: "Scale", min: 1, max: 16, default: 5 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1.2 }],
    `
    float t = uTime * uSpeed * 0.5;
    vec2 p = vUv * uScale;
    float n1 = noise(p + vec2(t * 0.9, t * 0.7));
    float n2 = noise(p * 1.4 - vec2(t * 0.6, t * 0.85));
    float n3 = noise(p * 0.65 + vec2(t * 0.45, -t * 0.6));
    float caustic = n1 * n2 * n3;
    caustic = pow(clamp(caustic * 3.0, 0.0, 1.0), 1.2);
    vec2 refr = vec2(n1 - 0.5, n2 - 0.5) * uAmount * 0.05;
    vec4 c = texture2D(uTex, vUv + refr);
    vec3 lightColor = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.97, 0.92), caustic);
    gl_FragColor = vec4(c.rgb + lightColor * caustic * uAmount * 1.6, c.a);
    `),

  fx("moirePulse", "Moiré Pulse", "geometry", "Two concentric ring systems at incommensurate frequencies — hypnotic interference beats that never repeat.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "density", label: "Density", min: 0.5, max: 3, default: 1.5 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1.5 }],
    `
    vec2 p = vUv - 0.5;
    float rr = length(p) * 28.0 * uDensity;
    float t = uTime * uSpeed;
    float ring1 = sin(rr - t * 2.0);
    float ring2 = sin(rr * 1.0847 + t * 1.73);
    float moire = ring1 * ring2 * 0.5 + 0.5;
    moire = pow(moire, 1.8);
    float hue = moire * 0.5 + t * 0.08 + length(p) * 0.4;
    vec3 col = hsv2rgb(vec3(fract(hue), 0.95, 0.5 + 0.5 * moire));
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(mix(c.rgb, c.rgb * 0.2 + col * 1.6, moire * uAmount), c.a);
    `),

  // ── TEMPORAL ──────────────────────────────────────────────────────
  // These sample uFeedback (last frame's output) and are the only effects
  // with memory. Every one decays toward the live frame so it can never
  // latch on and freeze the screen.

  fx("trailDecay", "Trail Decay", "corruption", "Motion leaves burning trails that decay over seconds — real accumulation, not a blur.",
    [{ key: "persistence", label: "Persistence", min: 0, max: 1, default: 0.7 },
     { key: "bleed", label: "Bleed", min: 0, max: 1, default: 0.35 }],
    `
    vec4 cur = texture2D(uTex, vUv);
    // Sample history slightly spread so trails smear as they fade.
    vec2 g = (1.0/uResolution) * (1.0 + uBleed * 6.0);
    vec3 hist = texture2D(uFeedback, vUv).rgb * 0.5
              + texture2D(uFeedback, vUv + vec2(g.x, 0.0)).rgb * 0.125
              + texture2D(uFeedback, vUv - vec2(g.x, 0.0)).rgb * 0.125
              + texture2D(uFeedback, vUv + vec2(0.0, g.y)).rgb * 0.125
              + texture2D(uFeedback, vUv - vec2(0.0, g.y)).rgb * 0.125;
    // Capped below 1.0 so energy always drains — no runaway white-out.
    float keep = uPersistence * 0.92;
    gl_FragColor = vec4(max(cur.rgb, hist * keep), cur.a);
    `),

  fx("motionMomentum", "Momentum", "corruption", "Pixels that changed get shoved along their direction of travel — the image gains inertia.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "reach", label: "Reach", min: 0, max: 1, default: 0.5 }],
    `
    vec2 px = 1.0/uResolution;
    vec4 cur = texture2D(uTex, vUv);
    // Cheap motion estimate: where does frame difference fall off fastest?
    float d0 = length(cur.rgb - texture2D(uFeedback, vUv).rgb);
    float dx = length(texture2D(uTex, vUv + vec2(px.x*2.0,0.0)).rgb - texture2D(uFeedback, vUv + vec2(px.x*2.0,0.0)).rgb);
    float dy = length(texture2D(uTex, vUv + vec2(0.0,px.y*2.0)).rgb - texture2D(uFeedback, vUv + vec2(0.0,px.y*2.0)).rgb);
    vec2 flow = vec2(dx - d0, dy - d0);
    float m = clamp(d0 * 3.0, 0.0, 1.0);
    vec2 push = flow * uReach * 0.35;
    vec4 shoved = texture2D(uTex, vUv - push);
    vec3 ghost = texture2D(uFeedback, vUv - push * 2.0).rgb;
    gl_FragColor = vec4(mix(cur.rgb, mix(shoved.rgb, ghost, 0.4), m * uAmount), cur.a);
    `),

  fx("infiniteZoom", "Infinite Zoom", "geometry", "The previous frame is re-projected slightly larger each frame — a true recursive corridor that never bottoms out.",
    [{ key: "zoom", label: "Zoom", min: -1, max: 1, default: 0.45 },
     { key: "spin", label: "Spin", min: -1, max: 1, default: 0.15 },
     { key: "feed", label: "Feedback", min: 0, max: 1, default: 0.75 }],
    `
    vec2 p = vUv - 0.5;
    float s = 1.0 - uZoom * 0.03;
    float a = uSpin * 0.02;
    // Rotate + scale the history sample point; iterating this every frame is
    // what builds the endless tunnel.
    mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 huv = rot * p * s + 0.5;
    vec3 hist = texture2D(uFeedback, huv).rgb;
    vec4 cur = texture2D(uTex, vUv);
    // Slight desaturation per hop stops the recursion saturating to neon mush.
    hist *= 0.985;
    gl_FragColor = vec4(mix(cur.rgb, max(cur.rgb * 0.55, hist), uFeed * 0.85), cur.a);
    `),

  fx("timeDisplace", "Time Displace", "corruption", "Brightness decides how far back in time each pixel is sampled — the frame tears itself across multiple moments.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "warp", label: "Warp", min: 0, max: 1, default: 0.4 }],
    `
    vec4 cur = texture2D(uTex, vUv);
    float lum = dot(cur.rgb, vec3(0.299,0.587,0.114));
    // Displace the history lookup by luminance, so bright and dark regions
    // lag by different amounts and the image shears through time.
    vec2 off = vec2(sin(lum*6.2831 + uTime*0.7), cos(lum*6.2831 - uTime*0.5)) * uWarp * 0.05;
    vec3 past = texture2D(uFeedback, vUv + off).rgb;
    float sel = smoothstep(0.25, 0.75, lum);
    gl_FragColor = vec4(mix(cur.rgb, mix(past, cur.rgb, sel), uAmount), cur.a);
    `),

  fx("reactionBloom", "Reaction Bloom", "atmosphere", "Bright areas seed a reaction-diffusion growth that creeps outward frame after frame.",
    [{ key: "growth", label: "Growth", min: 0, max: 1, default: 0.5 },
     { key: "decay", label: "Decay", min: 0, max: 1, default: 0.5 }],
    `
    vec2 px = 1.0/uResolution;
    vec4 cur = texture2D(uTex, vUv);
    // Laplacian of the history = diffusion term.
    vec3 c = texture2D(uFeedback, vUv).rgb;
    vec3 lap = texture2D(uFeedback, vUv + vec2(px.x,0.0)).rgb
             + texture2D(uFeedback, vUv - vec2(px.x,0.0)).rgb
             + texture2D(uFeedback, vUv + vec2(0.0,px.y)).rgb
             + texture2D(uFeedback, vUv - vec2(0.0,px.y)).rgb
             - 4.0 * c;
    float seed = max(0.0, dot(cur.rgb, vec3(0.299,0.587,0.114)) - 0.55);
    vec3 grown = c + lap * uGrowth * 0.28 + seed * 0.25;
    grown *= mix(0.90, 0.985, uDecay);
    gl_FragColor = vec4(max(cur.rgb * 0.85, grown), cur.a);
    `),

  // ── DIMENSIONAL ───────────────────────────────────────────────────
  // The only effects that know the image contains a subject standing in a
  // room, and that the room existed a moment ago as well as now. Everything
  // above this line treats the frame as one flat sheet of pixels; these read
  // uDepthTex and the time ring, so they can pull the two apart.

  fx("depthShear", "Depth Shear", "dimension", "You and the room behind you slide in opposite directions. The frame stops being flat.",
    [{ key: "amount", label: "Separation", min: 0, max: 1, default: 0.5 },
     { key: "angle", label: "Angle", min: 0, max: 1, default: 0.0 },
     { key: "pivot", label: "Pivot Depth", min: 0, max: 1, default: 0.45 }],
    `
    float d = depthAt(vUv);
    // Signed around the pivot: everything nearer than the pivot travels one
    // way, everything further travels the other. A single-sided push would
    // only smear the subject; the opposition is what reads as separation.
    float signedD = (d - uPivot) * 2.0;
    float a = uAngle * 6.2831853;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 off = dir * signedD * uAmount * (0.16 + uPulse * 0.10);
    gl_FragColor = texture2D(uTex, clamp(vUv - off, 0.0, 1.0));
    `),

  fx("dimensionSplit", "Dimension Split", "dimension", "A seam tears across reality and the two halves pull apart at different depths, light bleeding from the rift.",
    [{ key: "amount", label: "Rip", min: 0, max: 1, default: 0.55 },
     { key: "seam", label: "Seam", min: 0, max: 1, default: 0.5 },
     { key: "angle", label: "Angle", min: 0, max: 1, default: 0.0 },
     { key: "glow", label: "Rift Glow", min: 0, max: 1, default: 0.5 }],
    `
    float a = uAngle * 3.14159265;
    vec2 n = vec2(cos(a), sin(a));
    // Signed distance from the seam line through the frame centre.
    float t = dot(vUv - 0.5, n) - (uSeam - 0.5);
    float side = t < 0.0 ? -1.0 : 1.0;

    float d = depthAt(vUv);
    // Depth scales the pull, so the subject travels further through the rift
    // than the wall does — the tear has volume rather than being a flat cut.
    float push = side * uAmount * (0.035 + d * 0.16);
    vec2 uv = clamp(vUv - n * push, 0.0, 1.0);
    vec4 srcTex = texture2D(uTex, uv);
    vec3 c = srcTex.rgb;

    // Rift edge: exposure blows out where the two halves separated, which is
    // what sells it as light escaping from behind the image.
    float edge = exp(-abs(t) * (34.0 - uGlow * 22.0));
    c += edge * uGlow * (0.55 + uPulse * 0.45) * vec3(0.75, 0.86, 1.0);
    // uv already carries the rift's own pull, so a transparent source's
    // silhouette tears apart along with its color.
    gl_FragColor = vec4(c, srcTex.a);
    `),

  fx("timeShatter", "Time Shatter", "dimension", "The image breaks into shards and every shard is showing a different moment. Your head arrives before your shoulders.",
    [{ key: "cells", label: "Shards", min: 2, max: 26, default: 9, step: 1 },
     { key: "spread", label: "Time Spread", min: 0, max: 1, default: 0.7 },
     { key: "slip", label: "Slip", min: 0, max: 1, default: 0.3 }],
    `
    vec2 p = vUv * max(2.0, uCells);
    // Skew before flooring: square cells read as a grid, skewed cells read as
    // broken glass.
    p += vec2(p.y * 0.58, p.x * 0.26);
    vec2 cell = floor(p);
    float h = rand(cell);
    float h2 = rand(cell + 31.7);

    // Each shard gets its own age, so the frame is showing several different
    // moments at once rather than one uniformly delayed one.
    float age = h * uSpread;
    // A small positional slip per shard so the plate looks displaced as well
    // as desynchronised.
    vec2 slip = (vec2(h, h2) - 0.5) * uSlip * 0.05;
    // The history ring (timeAt) only carries color, not alpha, so a
    // transparent source's silhouette follows this shard's own slipped
    // position in the *current* frame rather than its historical shape —
    // close enough for anything that isn't itself changing shape frame to
    // frame, and still moves with the shard's own displacement.
    gl_FragColor = vec4(timeAt(vUv + slip, age), texture2D(uTex, vUv + slip).a);
    `),

  fx("parallaxExplode", "Parallax Explode", "dimension", "Near things fly outward faster than far things. The room turns inside out around you.",
    [{ key: "amount", label: "Thrust", min: 0, max: 1, default: 0.5 },
     { key: "curve", label: "Falloff", min: 0, max: 1, default: 0.5 }],
    `
    float d = depthAt(vUv);
    vec2 dir = vUv - 0.5;
    // Depth raised to a variable power: at low curve everything moves together
    // (a plain zoom), at high curve only the nearest surfaces launch.
    float w = pow(clamp(d, 0.0, 1.0), 0.4 + uCurve * 2.6);
    vec2 off = dir * w * uAmount * (0.42 + uPulse * 0.5);
    gl_FragColor = texture2D(uTex, clamp(vUv - off, 0.0, 1.0));
    `),

  fx("depthEcho", "Depth Echo", "dimension", "Only you leave ghosts. The room behind you stays perfectly still and perfectly sharp.",
    [{ key: "reach", label: "Reach", min: 0, max: 1, default: 0.6 },
     { key: "strength", label: "Strength", min: 0, max: 1, default: 0.7 },
     { key: "gate", label: "Depth Gate", min: 0, max: 1, default: 0.42 }],
    `
    vec4 curTex = texture2D(uTex, vUv);
    vec3 cur = curTex.rgb;
    float d = depthAt(vUv);
    // Three points along the ring rather than one, so the trail is a continuous
    // wake instead of a single detached copy.
    vec3 past = timeAt(vUv, uReach * 0.34) * 0.5
              + timeAt(vUv, uReach * 0.67) * 0.3
              + timeAt(vUv, uReach) * 0.2;
    float g = smoothstep(uGate - 0.16, uGate + 0.16, d);
    vec3 echo = max(cur, past * uStrength);
    // The history ring only carries color, so alpha rides the current
    // frame's own value at this position — the ghosting is additive glow
    // within the subject's current silhouette, not a separate shape.
    gl_FragColor = vec4(mix(cur, echo, g), curTex.a);
    `),

  fx("strataSlice", "Strata", "dimension", "Horizontal strata, each one running on its own clock and sliding by its own depth. Time becomes a place.",
    [{ key: "bands", label: "Strata", min: 2, max: 40, default: 14, step: 1 },
     { key: "timeSpread", label: "Time Spread", min: 0, max: 1, default: 0.6 },
     { key: "slide", label: "Slide", min: 0, max: 1, default: 0.4 }],
    `
    float band = floor(vUv.y * max(2.0, uBands));
    float h = rand(vec2(band, 4.2));
    float age = fract(h * 3.31) * uTimeSpread;
    float d = depthAt(vUv);
    // Depth drives the lateral slide, so a band across the subject travels
    // further than the band above it crossing only wall.
    vec2 uv = vUv;
    uv.x += (h - 0.5) * uSlide * 0.24 * (0.25 + d);
    // timeAt only carries color; alpha follows this same slid uv in the
    // current frame instead.
    gl_FragColor = vec4(timeAt(uv, age), texture2D(uTex, uv).a);
    `),

  fx("chronoBleed", "Chrono Bleed", "dimension", "Red, green and blue arrive from three different moments — colour separated across time instead of space.",
    [{ key: "spread", label: "Spread", min: 0, max: 1, default: 0.5 },
     { key: "depthBias", label: "Depth Bias", min: 0, max: 1, default: 0.6 }],
    `
    float d = depthAt(vUv);
    // Bias the spread by depth so the subject desynchronises hardest while the
    // background stays close to now — the separation reads as depth, not noise.
    float s = uSpread * mix(1.0, 0.25 + d * 1.15, uDepthBias);
    float r = timeAt(vUv, s).r;
    float g = timeAt(vUv, s * 0.45).g;
    vec4 curTex = texture2D(uTex, vUv);
    float b = curTex.b;
    gl_FragColor = vec4(r, g, b, curTex.a);
    `),

  // ── FLOW & OPTICS ─────────────────────────────────────────────────
  // The flow set reads uFlowTex, so their distortion follows whatever is actually
  // moving in frame instead of a fixed axis — wave your hand and the image
  // deforms along your hand. The optics set models real lens and glass
  // behaviour, where the wow comes from the artefact being physically correct
  // rather than from the amount of it.

  fx("flowSmear", "Flow Smear", "dimension", "The image drags along whatever is actually moving. Wave your hand and reality follows it.",
    [{ key: "amount", label: "Drag", min: 0, max: 1, default: 0.55 },
     { key: "reach", label: "Reach", min: 0, max: 1, default: 0.5 }],
    `
    vec2 f = flowAt(vUv);
    // Six taps walked backwards along the flow vector. A single offset only
    // shifts the image; a walk leaves a wake, which is what reads as drag.
    vec2 step = f * uAmount * 0.09 * (0.4 + uReach);
    vec4 acc = texture2D(uTex, vUv);
    float w = 1.0;
    for (int i = 1; i < 6; i++) {
      float fi = float(i);
      float wi = 1.0 - fi / 6.0;
      acc += texture2D(uTex, clamp(vUv - step * fi, 0.0, 1.0)) * wi;
      w += wi;
    }
    gl_FragColor = acc / w;
    `),

  fx("flowTurbulence", "Turbulence", "dimension", "Motion becomes a fluid field — the frame churns and curls around anything that moves.",
    [{ key: "amount", label: "Churn", min: 0, max: 1, default: 0.5 },
     { key: "swirl", label: "Curl", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Scale", min: 0, max: 1, default: 0.45 }],
    `
    vec2 f = flowAt(vUv);
    // Rotating the flow vector 90 degrees turns translation into circulation:
    // the curl of the field rather than the field itself, which is what makes
    // it read as fluid rather than as a shove.
    vec2 curl = vec2(-f.y, f.x);
    vec2 dir = mix(f, curl, uSwirl);
    float n = noise(vUv * (3.0 + uScale * 22.0) + uTime * 0.35);
    vec2 off = dir * uAmount * 0.14 * (0.55 + n * 0.9) * (0.7 + uPulse * 0.7);
    gl_FragColor = texture2D(uTex, clamp(vUv - off, 0.0, 1.0));
    `),

  fx("glassRefract", "Glass", "geometry", "The frame becomes a sheet of moulded glass — living crystal that bends the light behind it.",
    [{ key: "thickness", label: "Thickness", min: 0, max: 1, default: 0.5 },
     { key: "facets", label: "Facets", min: 0, max: 1, default: 0.4 },
     { key: "sheen", label: "Sheen", min: 0, max: 1, default: 0.5 }],
    `
    // Height field -> surface normal -> refracted offset. Modelling it as a
    // real surface rather than a UV wobble is what makes it read as glass
    // instead of as a ripple filter.
    float s = 2.0 + uFacets * 14.0;
    vec2 q = vUv * s + uTime * 0.12;
    float h  = noise(q);
    float hx = noise(q + vec2(0.09, 0.0));
    float hy = noise(q + vec2(0.0, 0.09));
    vec2 n = vec2(hx - h, hy - h) * 9.0;

    vec2 off = n * uThickness * 0.075;
    vec4 srcTex = texture2D(uTex, clamp(vUv + off, 0.0, 1.0));
    vec3 c = srcTex.rgb;

    // Dispersion: the channels take slightly different paths through the
    // thickness, which is the giveaway that light passed through a solid.
    c.r = texture2D(uTex, clamp(vUv + off * 1.12, 0.0, 1.0)).r;
    c.b = texture2D(uTex, clamp(vUv + off * 0.88, 0.0, 1.0)).b;

    // Specular from the same normal — free, and it makes the surface read
    // as having a direction it is being lit from.
    float spec = pow(max(0.0, dot(normalize(n + 0.0001), normalize(vec2(0.6, 0.8)))), 3.0);
    c += spec * uSheen * 0.4;
    // Alpha rides the un-dispersed (green channel's) refracted position —
    // a transparent source's silhouette bends through the "glass" with its
    // color, just without the per-channel dispersion that only applies to
    // hue.
    gl_FragColor = vec4(c, srcTex.a);
    `),

  fx("chromaAberrate", "Aberration", "color", "Real lens dispersion — colour splits harder toward the edges, exactly as glass does it.",
    [{ key: "amount", label: "Dispersion", min: 0, max: 1, default: 0.5 },
     { key: "edge", label: "Edge Bias", min: 0, max: 1, default: 0.7 }],
    `
    // Radial, not uniform. A flat RGB offset is a glitch; dispersion that grows
    // with distance from the optical centre is a lens, and the eye knows the
    // difference even when it cannot name it.
    vec2 rel = vUv - 0.5;
    float r2 = dot(rel, rel);
    float k = uAmount * 0.06 * mix(1.0, r2 * 4.0, uEdge);
    vec3 c;
    c.r = texture2D(uTex, clamp(vUv - rel * k, 0.0, 1.0)).r;
    c.g = texture2D(uTex, vUv).g;
    c.b = texture2D(uTex, clamp(vUv + rel * k, 0.0, 1.0)).b;
    gl_FragColor = vec4(c, texture2D(uTex, vUv).a);
    `),

  fx("crtPhosphor", "CRT", "atmosphere", "Curved glass, phosphor stripes and a bleeding shadow mask. A real tube, not a scanline overlay.",
    [{ key: "curve", label: "Curvature", min: 0, max: 1, default: 0.45 },
     { key: "mask", label: "Shadow Mask", min: 0, max: 1, default: 0.6 },
     { key: "bleed", label: "Bloom", min: 0, max: 1, default: 0.4 }],
    `
    // Barrel-warp the sample position: the picture is painted on the inside of
    // a curved tube, so the geometry has to bend before anything else does.
    vec2 uv = vUv * 2.0 - 1.0;
    uv *= 1.0 + dot(uv, uv) * uCurve * 0.22;
    uv = uv * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      // Off the curved tube's own edge — transparent, not opaque black, so
      // a transparent source's silhouette doesn't gain a solid frame around it.
      gl_FragColor = vec4(0.0); return;
    }

    vec4 srcTex = texture2D(uTex, uv);
    vec3 c = srcTex.rgb;
    c += discBlur(uv, 5.0) * uBleed * 0.6;

    // Aperture grille: each screen column belongs to one phosphor stripe.
    float col = floor(uv.x * uResolution.x / 3.0);
    vec3 stripe = vec3(
      step(0.5, abs(mod(col, 3.0) - 0.0) < 0.5 ? 1.0 : 0.0),
      step(0.5, abs(mod(col, 3.0) - 1.0) < 0.5 ? 1.0 : 0.0),
      step(0.5, abs(mod(col, 3.0) - 2.0) < 0.5 ? 1.0 : 0.0)
    );
    c *= mix(vec3(1.0), stripe * 1.9, uMask * 0.55);

    // Horizontal scanline gaps, and a slight edge falloff for the tube.
    c *= 0.72 + 0.28 * sin(uv.y * uResolution.y * 3.14159);
    vec2 e = abs(uv - 0.5);
    c *= 1.0 - smoothstep(0.42, 0.72, max(e.x, e.y)) * 0.5;
    // uv already carries the tube's own barrel warp, so a transparent
    // source's silhouette curves with the glass.
    gl_FragColor = vec4(c, srcTex.a);
    `),

  fx("mandalaBloom", "Mandala", "geometry", "Radial mirror symmetry with drifting rotation — a kaleidoscope that breathes.",
    [{ key: "slices", label: "Slices", min: 3, max: 24, default: 8, step: 1 },
     { key: "spin", label: "Spin", min: 0, max: 1, default: 0.35 },
     { key: "zoom", label: "Zoom", min: 0, max: 1, default: 0.45 }],
    `
    vec2 rel = vUv - 0.5;
    rel.x *= uResolution.x / max(1.0, uResolution.y);
    float a = atan(rel.y, rel.x);
    float r = length(rel);

    // Fold the angle into one wedge, then mirror alternate wedges so the seams
    // meet instead of butting — a kaleidoscope is mirrors, not copies.
    float seg = 6.2831853 / max(3.0, uSlices);
    a = mod(a + uTime * uSpin * 0.5 + uPulse * 0.4, seg);
    a = abs(a - seg * 0.5);

    r *= 1.0 - uZoom * 0.45;
    vec2 uv = vec2(cos(a), sin(a)) * r;
    uv.x /= uResolution.x / max(1.0, uResolution.y);
    gl_FragColor = texture2D(uTex, clamp(uv + 0.5, 0.0, 1.0));
    `),

  fx("volumetricShaft", "Volumetric Shaft", "atmosphere", "Light shafts cast outward from the brightest points, with dust hanging in them.",
    [{ key: "amount", label: "Shafts", min: 0, max: 1, default: 0.55 },
     { key: "reach", label: "Reach", min: 0, max: 1, default: 0.5 },
     { key: "warmth", label: "Warmth", min: 0, max: 1, default: 0.45 }],
    `
    // Radial occlusion march from the frame centre. Each step samples further
    // out and keeps only what is bright, so light appears to travel through the
    // volume rather than being painted on it.
    vec4 baseTex = texture2D(uTex, vUv);
    vec3 base = baseTex.rgb;
    vec2 dir = (vUv - 0.5) * (0.024 + uReach * 0.055);
    vec3 acc = vec3(0.0);
    float w = 1.0;
    for (int i = 1; i <= 10; i++) {
      vec2 uv = clamp(vUv - dir * float(i), 0.0, 1.0);
      vec3 s = texture2D(uTex, uv).rgb;
      float bright = max(0.0, dot(s, vec3(0.299, 0.587, 0.114)) - 0.58);
      acc += s * bright * w;
      w *= 0.86;
    }
    acc /= 6.0;
    vec3 tint = mix(vec3(1.0), vec3(1.25, 1.02, 0.72), uWarmth);
    gl_FragColor = vec4(base + acc * tint * uAmount * (1.2 + uPulse * 0.8), baseTex.a);
    `),

  fx("emberField", "Embers", "atmosphere", "A field of drifting embers that surges on the beat and lights the frame from within.",
    [{ key: "density", label: "Density", min: 0, max: 1, default: 0.5 },
     { key: "drift", label: "Drift", min: 0, max: 1, default: 0.5 },
     { key: "glow", label: "Glow", min: 0, max: 1, default: 0.6 }],
    `
    vec4 baseTex = texture2D(uTex, vUv);
    vec3 base = baseTex.rgb;
    float cells = 8.0 + uDensity * 30.0;
    vec2 p = vUv * cells;
    p.y -= uTime * (0.25 + uDrift * 1.1);
    // Flow pushes the field around, so the embers are carried by whatever is
    // moving in shot instead of falling on a fixed track.
    p += flowAt(vUv) * 2.4 * uDrift;

    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = rand(cell);
    if (h < 0.55) { gl_FragColor = vec4(base, baseTex.a); return; }

    vec2 c = vec2(rand(cell + 3.1), rand(cell + 7.7));
    float d = length(f - c);
    float spark = exp(-d * (26.0 - uGlow * 13.0));
    // Each ember has its own phase, so the field twinkles rather than pulsing
    // as one sheet, and the beat surges all of them together on top of that.
    float tw = 0.55 + 0.45 * sin(uTime * (2.2 + h * 5.0) + h * 26.0);
    vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.88, 0.6), h);
    gl_FragColor = vec4(base + col * spark * tw * uGlow * (1.0 + uPulse * 1.5), baseTex.a);
    `),

  fx("volumetricPull", "Volumetric Pull", "dimension", "The subject stretches toward the lens while the room falls away behind. Depth as a physical force.",
    [{ key: "amount", label: "Pull", min: 0, max: 1, default: 0.5 },
     { key: "swirl", label: "Swirl", min: 0, max: 1, default: 0.25 }],
    `
    float d = depthAt(vUv);
    vec2 rel = vUv - 0.5;
    // Per-pixel zoom driven by depth: near surfaces magnify, far ones recede,
    // which is the monocular cue the brain reads as approach.
    float z = 1.0 - (d - 0.35) * uAmount * 0.55;
    // Depth-proportional rotation adds the twist that keeps it from reading as
    // a plain vignette zoom.
    float ang = (d - 0.35) * uSwirl * 1.6 * (0.6 + uPulse * 0.8);
    float ca = cos(ang), sa = sin(ang);
    rel = mat2(ca, -sa, sa, ca) * rel * z;
    gl_FragColor = texture2D(uTex, clamp(rel + 0.5, 0.0, 1.0));
    `),

  // ── PAINT & FIRE ──────────────────────────────────────────────────
  // Both built around the same idea the rest of the catalog just got tuned
  // for: uAmount is not a volume knob. It sweeps through genuinely different
  // physical regimes via continuous curves rather than hard cuts, so 0 is a
  // true no-op and 100 looks structurally different from 50, not just louder.

  fx("acrylicBleed", "Acrylic Bleed", "color", "Jewel-tone paint rivers bleed from the image's own colors, flowing from a light stain to a full digital flood.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "viscosity", label: "Viscosity", min: 0, max: 1, default: 0.2 },
     { key: "glitch", label: "Glitch", min: 0, max: 1, default: 0.3 }],
    `
    vec4 src = texture2D(uTex, vUv);

    // Local detail/edge density stands in for "how photoreal is this patch":
    // busy, high-contrast areas read as real; flat regions read as flat.
    // Rivers concentrate on the former until uAmount pushes into the top of
    // its range, where the gate relaxes and paint floods everywhere.
    vec2 texel = 1.0 / uResolution;
    float lx = dot(texture2D(uTex, vUv + vec2(texel.x, 0.0)).rgb - src.rgb, vec3(0.299,0.587,0.114));
    float ly = dot(texture2D(uTex, vUv + vec2(0.0, texel.y)).rgb - src.rgb, vec3(0.299,0.587,0.114));
    float detail = clamp((abs(lx) + abs(ly)) * 6.0, 0.0, 1.0);
    float detailGate = mix(detail, 1.0, smoothstep(0.75, 1.0, uAmount));

    // Viscosity trades flow speed for river thickness: thin, fast rivers at
    // the low default (a "low viscosity liquid"), slow heavy pours as it climbs.
    float speed = mix(0.5, 0.08, uViscosity);
    float thick = mix(0.045, 0.14, uViscosity);
    float sc = mix(2.0, 5.0, 1.0 - uViscosity);
    float t = uTime * speed;
    float e = 0.02;

    // Curl of a scalar noise field is divergence-free, so paint advects along
    // smooth closed streamlines in every direction instead of smearing along
    // one axis -- see Ink Flow above for the same technique.
    vec2 p = vUv * sc;
    vec2 curl = vec2(noise(p + vec2(0.0, e) + t) - noise(p - vec2(0.0, e) + t),
                    -(noise(p + vec2(e, 0.0) - t) - noise(p - vec2(e, 0.0) - t))) / (2.0 * e);
    float flow = noise(vUv * sc * 1.4 + curl * 1.8);

    // Coverage ramps steeply, not linearly, so low amounts stay a light
    // stain and only the top of the range floods the frame.
    float coverage = pow(uAmount, 1.6);
    float edge = mix(0.15, 0.85, coverage);
    float mask = (1.0 - smoothstep(edge - thick, edge + thick, flow)) * detailGate;

    // The trailing edge breaks into isolated puddle-drops instead of a hard
    // cutoff -- a bump just past the river's own reach.
    vec2 dc = floor(vUv * 22.0);
    float dropletHit = step(0.55, rand(dc));
    float dropletBand = smoothstep(edge, edge + thick, flow) * (1.0 - smoothstep(edge + thick, edge + thick * 3.0, flow));
    mask = clamp(mask + dropletHit * dropletBand * detailGate * smoothstep(0.12, 0.5, uAmount), 0.0, 1.0);

    // Colour re-samples live from a point advected along the same current,
    // so a river's hue drifts as it crosses different-coloured parts of the
    // image -- then snaps to the nearest of six jewel-tone primaries.
    vec2 pickUv = clamp(vUv + curl * 0.05, 0.0, 1.0);
    vec3 hsv = rgb2hsv(texture2D(uTex, pickUv).rgb);
    hsv.x = floor(hsv.x * 6.0 + 0.5) / 6.0;
    hsv.y = clamp(mix(hsv.y, 1.0, 0.65 + coverage * 0.35), 0.0, 1.0);
    hsv.z = clamp(mix(hsv.z, 1.0, 0.3), 0.0, 1.0);
    vec3 jewel = hsv2rgb(hsv);

    // Photoreal <-> 8-bit VHS glitch is its own dial, independent of
    // coverage -- but the very top of uAmount also forces it in, so the
    // flood regime looks like it's coming apart rather than just bigger.
    float glitchAmt = clamp(uGlitch + smoothstep(0.72, 1.0, uAmount) * 0.6, 0.0, 1.0);
    vec3 posterized = floor(jewel * 5.0) / 4.0;
    vec3 split = vec3(
      texture2D(uTex, pickUv + vec2(0.006, 0.0) * glitchAmt).r,
      texture2D(uTex, pickUv).g,
      texture2D(uTex, pickUv - vec2(0.006, 0.0) * glitchAmt).b
    );
    float scan = step(0.5, fract((vUv.y + uTime * 0.6) * uResolution.y * 0.12));
    vec3 glitchLook = mix(posterized, split, 0.4) * mix(1.0, 0.3 + scan * 1.3, glitchAmt);
    vec3 paint = mix(jewel, glitchLook, glitchAmt);

    gl_FragColor = vec4(mix(src.rgb, paint, mask * clamp(uAmount * 1.4, 0.0, 1.0)), src.a);
    `),

  fx("prismFlame", "Prism Flame", "dimension", "The subject's silhouette catches fire in countless rainbow gemstone facets, from a thin neon halo to structural digital breakdown.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "spectrumSpeed", label: "Spectrum Speed", min: 0, max: 3, default: 1.0 },
     { key: "facetSize", label: "Facet Size", min: 0, max: 1, default: 0.4 }],
    `
    vec4 src = texture2D(uTex, vUv);
    float d = depthAt(vUv); // 1 = subject, 0 = the room behind them

    // A soft bump right at the silhouette's transition zone: the rim the
    // flame roots from, not the subject's whole body.
    float rim = smoothstep(0.08, 0.4, d) * (1.0 - smoothstep(0.4, 0.92, d));

    // Turbulence drifts upward and outward into the background -- (1.0 - d)
    // keeps it away from the subject's own body -- reach growing steeply
    // with amount so Ember stays a thin halo and Flood genuinely engulfs.
    vec2 drift = vec2(noise(vUv * 3.0 + uTime * 0.35) - 0.5, -noise(vUv * 3.2 + 11.0 + uTime * 0.45)) * 0.22;
    vec2 fUv = vUv + drift * (1.0 - d);
    float turb = noise(fUv * 6.0 - vec2(0.0, uTime * 0.9)) * 0.6
               + noise(fUv * 13.0 - vec2(0.0, uTime * 1.4)) * 0.4;
    float reach = mix(0.05, 0.7, pow(uAmount, 1.4));
    float core = clamp(rim + turb * reach * (1.0 - d), 0.0, 1.0);
    // A wider, softer pass of the same fields for the neon glow halo -- cheap,
    // since it reuses the noise already evaluated rather than a texture blur.
    float glow = clamp(rim * 1.4 + turb * reach * 2.2 * (1.0 - d), 0.0, 1.0);

    // Faceted gemstone shading: nearest-cell hash gives each facet its own
    // flicker and hue offset instead of one smooth flame body.
    vec2 fp = fUv * mix(6.0, 46.0, uFacetSize);
    vec2 fi = floor(fp);
    float facetFlicker = rand(fi + floor(uTime * 2.2));
    float hue = fract(d * 0.15 + facetFlicker * 0.5 + uTime * uSpectrumSpeed * 0.12);
    vec3 jewel = hsv2rgb(vec3(hue, 0.85, 1.0));

    // Peel: past the middle of the range, a second layer of facets drifts
    // further along the same current -- reads as flakes that have detached
    // from the main body rather than more of the same flame.
    float peelAmt = smoothstep(0.55, 0.85, uAmount);
    vec2 peelUv = fUv + drift * 1.8;
    float peelTurb = noise(peelUv * 8.0 - vec2(0.0, uTime * 1.1));
    float peelMask = smoothstep(0.5, 0.75, peelTurb) * peelAmt * (1.0 - d);
    core = clamp(core + peelMask, 0.0, 1.0);

    // Disruption: only the very top of the range, the frame itself starts to
    // tear -- block-glitch offsets sampling for a fraction of cells that
    // grows with amount, so Flood ends in structural breakdown rather than
    // just being brighter.
    float discRegime = smoothstep(0.82, 1.0, uAmount);
    vec2 blockUv = floor(vUv * 26.0) / 26.0;
    float blockRoll = rand(blockUv + floor(uTime * 5.0));
    float tearHit = step(1.0 - discRegime * 0.5, blockRoll);
    vec2 tear = (vec2(rand(blockUv + 3.1), rand(blockUv + 7.2)) - 0.5) * 0.06 * tearHit * discRegime;
    vec3 base = texture2D(uTex, clamp(vUv + tear, 0.0, 1.0)).rgb;

    vec3 lit = base + jewel * glow * mix(0.5, 1.6, uAmount) * (1.0 + uPulse * 0.6);
    float influence = clamp(core + glow * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(mix(base, lit, influence), src.a);
    `),

  // ── INTERNAL — POINTER-DRIVEN ─────────────────────────────────────
  /* Localized GPU distortion anchored to a live (x, y) point instead of
     covering the frame. cursorFx.ts drives x/y/amount/chaos every frame from
     active touch/click state; the shader itself is the only thing enforcing
     "only near the point" — outside uRadius it falls back to an exact
     passthrough, which is also why it's cheap to stack several of these at
     once for multitouch. */
  {
    ...fx("cursorMosh", "Cursor Mosh", "corruption",
      "Localized touch/cursor-point distortion — driven live, not by sliders.",
      [
        // Default is a visible 0.5, not 0: cursorFx.ts always overrides this
        // live and per-frame while a point is active, and only ever appends
        // this layer while one is — so the schema default is never actually
        // seen at runtime. It only matters to the effect audit script, which
        // renders every effect at its defaults and flags an exact passthrough
        // as inert; 0 would fail that for an effect this is correct behavior
        // for, so the default is picked to read clearly there instead.
        { key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
        { key: "radius", label: "Radius", min: 0.02, max: 0.6, default: 0.16 },
        { key: "x", label: "X", min: 0, max: 1, default: 0.5 },
        { key: "y", label: "Y", min: 0, max: 1, default: 0.5 },
        { key: "chaos", label: "Chaos", min: 0, max: 1, default: 0 },
      ],
      `
      vec2 uv = vUv;
      vec4 src = texture2D(uTex, uv);

      float aspect = uResolution.x / max(1.0, uResolution.y);
      vec2 asp = vec2(aspect, 1.0);
      vec2 center = vec2(uX, uY);
      vec2 d = (uv - center) * asp;
      float dist = length(d);
      float rad = max(0.015, uRadius);
      float falloff = 1.0 - smoothstep(0.0, rad, dist);
      falloff = pow(clamp(falloff, 0.0, 1.0), 1.5);

      float strength = uAmount * falloff;
      if (strength <= 0.001) { gl_FragColor = src; return; }

      vec2 dirOut = dist > 0.0001 ? normalize(d) / asp : vec2(0.0);

      // Flowing curl-ish noise for the ambient/drag character.
      float n1 = noise(uv * 10.0 + uTime * 0.7);
      float n2 = noise(uv * 10.0 + 47.0 - uTime * 0.7);
      vec2 flowDisp = (vec2(n1, n2) - 0.5) * 2.0;

      // Blend toward a straight radial push as uChaos rises -- flowing warp
      // at 0, a sharper outward shove once a hold-branch burst sets it high.
      vec2 mixedDisp = mix(flowDisp, dirOut, 0.25 + uChaos * 0.5);

      vec2 offUv = clamp(uv + mixedDisp * strength * mix(0.05, 0.11, uChaos), 0.0, 1.0);
      vec3 moshed = texture2D(uTex, offUv).rgb;

      // Chromatic split, radiating outward from the point -- reads as a
      // shockwave once uChaos pushes the offset wider.
      vec2 chromaOff = dirOut * strength * mix(0.012, 0.03, uChaos);
      float rCh = texture2D(uTex, clamp(offUv + chromaOff, 0.0, 1.0)).r;
      float bCh = texture2D(uTex, clamp(offUv - chromaOff, 0.0, 1.0)).b;
      vec3 split = vec3(rCh, moshed.g, bCh);

      // Block glitch only bites as uChaos rises, so a plain drag stays a
      // smooth warp and a hold-branch burst reads as circuitry breaking.
      vec2 blockUv = floor(uv * 40.0) / 40.0;
      float blockRoll = rand(blockUv + floor(uTime * 14.0));
      float blockHit = step(1.0 - uChaos * 0.55, blockRoll) * falloff;
      vec3 blocked = mix(split, split.brg, blockHit);

      vec3 outc = mix(src.rgb, blocked, strength);
      gl_FragColor = vec4(outc, src.a);
      `),
    internal: true,
  },

  // ── DESTRUCTION INDEX EXPANSION ────────────────────────────────────
  // Ten additions picked from a gap analysis against a wider reference
  // catalog of digital-destruction techniques, chosen for what the library
  // was actually missing rather than for coverage's own sake: a plain
  // negative and a hard threshold (both absent despite being VJ staples), a
  // self-blend composite (a whole glitch family the library didn't have at
  // all), three signal/tape failures distinct from the existing VHS/scanline
  // set, a depth-aware bad-key glow that rides the same uDepthTex every
  // dimensional effect already reads, two motion primitives that lean on
  // uPulse/noise rather than duplicating zoomBlur or jitter, and a second
  // grain stock next to filmGrain's halation-heavy one.
  fx("invert", "Invert", "color", "Full tonal negative, with an audio-driven punch.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 1.0 },
     { key: "punch", label: "Pulse Punch", min: 0, max: 1, default: 0.35 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 inverted = 1.0 - c.rgb;
    float m = clamp(uAmount + uPulse * uPulse * uPunch, 0.0, 1.0);
    gl_FragColor = vec4(mix(c.rgb, inverted, m), c.a);
    `),

  fx("threshold", "Threshold", "color", "Every pixel forced to pure black or white at one cutoff.",
    [{ key: "cut", label: "Cutoff", min: 0, max: 1, default: 0.5 },
     { key: "soft", label: "Edge Softness", min: 0, max: 0.4, default: 0.06 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    float v = smoothstep(uCut - uSoft - 0.001, uCut + uSoft + 0.001, lum);
    gl_FragColor = vec4(vec3(v), c.a);
    `),

  fx("selfBlend", "Self Blend", "color", "The frame differenced against its own offset copy — edges only.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "spread", label: "Spread", min: 0, max: 0.06, default: 0.015 }],
    `
    vec4 base = texture2D(uTex, vUv);
    vec2 off = vec2(uSpread, -uSpread * 0.6);
    vec3 shifted = texture2D(uTex, fract(vUv + off)).rgb;
    vec3 diff = abs(base.rgb - shifted);
    gl_FragColor = vec4(mix(base.rgb, diff, uAmount), base.a);
    `),

  fx("syncRoll", "Sync Roll", "corruption", "Vertical sync lost — the frame rolls continuously off the top.",
    [{ key: "speed", label: "Roll Speed", min: 0, max: 1, default: 0.4 },
     { key: "amount", label: "Tear Amount", min: 0, max: 1, default: 0.5 }],
    `
    vec2 uv = vUv;
    float roll = fract(uTime * uSpeed * 0.5);
    uv.y = fract(uv.y + roll);
    float bandDist = min(uv.y, 1.0 - uv.y);
    float band = smoothstep(0.08, 0.0, bandDist);
    float j = (noise(vec2(uv.y * 40.0, uTime * 6.0)) - 0.5) * uAmount * 0.15 * band;
    uv.x = fract(uv.x + j);
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("interlaceComb", "Interlace Comb", "corruption", "Two fields from different moments woven into one frame.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "age", label: "Field Age", min: 0, max: 1, default: 0.35 }],
    `
    vec4 cur = texture2D(uTex, vUv);
    vec3 past = timeAt(vUv, uAge);
    float row = floor(vUv.y * uResolution.y);
    float oddRow = mod(row, 2.0);
    float mixAmt = uAmount * oddRow;
    gl_FragColor = vec4(mix(cur.rgb, past, mixAmt), cur.a);
    `),

  fx("signalDropout", "Signal Dropout", "corruption", "Bands of missing data replaced with flat noise.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "scale", label: "Band Size", min: 0.01, max: 0.2, default: 0.05 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float band = floor(vUv.y / max(0.005, uScale));
    float bandSeed = rand(vec2(band, floor(uTime * 3.0)));
    float dead = step(1.0 - uAmount * 0.6, bandSeed);
    float n = rand(vUv * vec2(400.0, 900.0) + uTime);
    vec3 noiseCol = vec3(n * 0.15 + 0.02);
    gl_FragColor = vec4(mix(c.rgb, noiseCol, dead), c.a);
    `),

  fx("keyingHalo", "Keying Halo", "atmosphere", "A bad chroma-key edge — glow bleeding backward from where the matte gave up.",
    [{ key: "width", label: "Halo Width", min: 0, max: 1, default: 0.4 },
     { key: "glow", label: "Glow", min: 0, max: 1, default: 0.6 }],
    `
    // The depth proxy is soft and blobby by construction (see the header
    // comment on uDepthTex), never a hard cutout, so a gradient-based edge
    // detector starves against it. A band around the subject/background
    // midpoint finds the same "matte gave up here" zone without depending on
    // how steep the transition happens to be.
    vec4 c = texture2D(uTex, vUv);
    float d = depthAt(vUv);
    float band = clamp(1.0 - abs(d - 0.5) * 2.0, 0.0, 1.0);
    float edge = pow(band, mix(5.0, 0.6, uWidth));
    vec3 haloColor = vec3(0.1, 1.0, 0.5);
    vec3 result = mix(c.rgb, haloColor, edge * uGlow);
    result = mix(result, 1.0 - c.rgb, d * edge * 0.35 * uGlow);
    gl_FragColor = vec4(result, c.a);
    `),

  fx("cameraShake", "Camera Shake", "geometry", "Procedural handheld jitter — the whole frame shudders like a dropped tripod.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "speed", label: "Speed", min: 0.1, max: 3, default: 1.2 }],
    `
    float t = uTime * uSpeed;
    vec2 shake = vec2(noise(vec2(t, 11.0)) - 0.5, noise(vec2(t, 47.0)) - 0.5) * uAmount * 0.06;
    vec2 uv = fract(vUv + shake);
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("zoomPunch", "Zoom Punch", "geometry", "A hard scale-in that snaps back on every beat.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "sharpness", label: "Sharpness", min: 0.3, max: 3, default: 1.2 }],
    `
    vec2 uv = vUv - 0.5;
    float punch = pow(clamp(uPulse, 0.0, 1.0), uSharpness) * uAmount;
    uv *= 1.0 - punch * 0.4;
    uv += 0.5;
    gl_FragColor = texture2D(uTex, clamp(uv, 0.0, 1.0));
    `),

  fx("paperGrain", "Paper Grain", "atmosphere", "Fibrous substrate multiplied over the image — distinct from Film Grain's halation.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "scale", label: "Fiber Scale", min: 20, max: 200, default: 80 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec2 p = vUv * uScale;
    float fiber = noise(p) * 0.5 + noise(p * 2.3 + 7.0) * 0.3 + noise(p * 5.1 - 3.0) * 0.2;
    fiber = fiber * 0.5 + 0.5;
    vec3 toned = c.rgb * mix(1.0, fiber, uAmount);
    gl_FragColor = vec4(toned, c.a);
    `),
];

/** Every effect except the internal, manager-driven ones — what any
 *  user-facing catalog (picker, sticker layer, random-swap/boundary rolls)
 *  should iterate instead of the raw EFFECTS array. */
export const PUBLIC_EFFECTS: EffectDef[] = EFFECTS.filter(e => !e.internal);

export const EFFECTS_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map(e => [e.id, e]));

export const CATEGORY_LABELS: Record<EffectCategory, string> = {
  corruption: "Data Corruption",
  color: "Color Chaos",
  geometry: "Geometry",
  atmosphere: "Atmosphere",
  dimension: "Dimensional",
};
