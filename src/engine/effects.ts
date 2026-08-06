export type ParamSchema = {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
};

export type EffectCategory = "corruption" | "color" | "geometry" | "atmosphere";

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
};

const COMMON_HEADER = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPulse;

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
    vec2 off = (vec2(rand(block+1.7), rand(block+5.3))-0.5) * uAmount * 0.4 * step(0.55, n);
    gl_FragColor = texture2D(uTex, vUv + off);
    `),

  fx("blockShift", "Block Shift", "corruption", "Horizontal slabs torn loose.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "rows", label: "Density", min: 4, max: 200, default: 40, step: 1 }],
    `
    float row = floor(vUv.y * uRows);
    float seed = rand(vec2(row, floor(uTime*2.0)));
    float shift = (seed-0.5) * uAmount * step(0.7, seed);
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
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 }],
    `
    float t = uTime*30.0 + uPulse*3.0;
    vec2 j = vec2(noise(vec2(vUv.y*40.0,t)), noise(vec2(vUv.x*40.0,t+11.0))) - 0.5;
    gl_FragColor = texture2D(uTex, vUv + j*uAmount*0.11);
    `),

  fx("scanBreak", "Scan Break", "corruption", "Horizontal line tears.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    // step(0.97, ...) tore only ~3% of scanlines, so the effect barely showed.
    // A wider gate plus a bigger displacement makes the tearing read.
    float band = step(0.80, sin(vUv.y*120.0 + uTime*uSpeed*8.0));
    float shift = (rand(vec2(floor(vUv.y*200.0), floor(uTime*4.0))) - 0.5)*uAmount*1.4;
    vec2 uv = vec2(fract(vUv.x + shift*band), vUv.y);
    gl_FragColor = texture2D(uTex, uv);
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
    vec4 a = texture2D(uTex, vUv);
    vec4 b = texture2D(uTex, vUv + vec2(uOffset, uOffset*0.6));
    vec4 c = texture2D(uTex, vUv - vec2(uOffset*0.7, uOffset*0.3));
    gl_FragColor = mix(a, max(max(a,b),c), uAmount);
    `),

  // ── COLOR CHAOS ───────────────────────────────────────────────────
  fx("rgbShift", "RGB Shift", "color", "Classic chromatic aberration.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "angle", label: "Angle", min: 0, max: 3.14159, default: 0 }],
    `
    // Half a turn, not a full one: at 2*PI the direction is identical to 0, so
    // a full drag of the pad's Y axis landed exactly where it started. Offset
    // also widened — 4% of frame was barely visible.
    vec2 dir = vec2(cos(uAngle), sin(uAngle)) * uAmount * 0.09;
    float r = texture2D(uTex, vUv + dir).r;
    float g = texture2D(uTex, vUv).g;
    float b = texture2D(uTex, vUv - dir).b;
    gl_FragColor = vec4(r,g,b, texture2D(uTex,vUv).a);
    `),

  fx("hueRotate", "Hue Rotate", "color", "Rotate the entire color wheel.",
    [{ key: "amount", label: "Amount", min: -1, max: 1, default: 0.3 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 hsv = rgb2hsv(c.rgb);
    hsv.x = fract(hsv.x + uAmount);
    gl_FragColor = vec4(hsv2rgb(hsv), c.a);
    `),

  fx("solarize", "Solarize", "color", "Invert highlights — print blowout.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 inv = 1.0 - c.rgb;
    vec3 sol = mix(c.rgb, inv, step(0.5, c.rgb));
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
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 }],
    `
    float r = texture2D(uTex, vUv + vec2(0.030*uAmount, 0.0)).r;
    float g = texture2D(uTex, vUv).g;
    float b = texture2D(uTex, vUv - vec2(0.044*uAmount, 0.0)).b;
    float band = sin(vUv.y*800.0)*0.10*uAmount;
    gl_FragColor = vec4(r+band, g, b-band, 1.0);
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
    [{ key: "levels", label: "Levels", min: 2, max: 16, default: 5, step: 1 }],
    `
    vec4 c = texture2D(uTex, vUv);
    c.rgb = floor(c.rgb*uLevels)/uLevels;
    gl_FragColor = c;
    `),

  fx("thermal", "Thermal", "color", "Heat-vision colormap.",
    [{ key: "amount", label: "Mix", min: 0, max: 1, default: 0.8 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float l = dot(c.rgb, vec3(0.299,0.587,0.114));
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
    [{ key: "segments", label: "Segments", min: 2, max: 16, default: 6, step: 1 }],
    `
    vec2 p = vUv-0.5;
    float a = atan(p.y,p.x);
    float r = length(p);
    float seg = 6.2831853/uSegments;
    a = mod(a, seg);
    a = abs(a - seg*0.5);
    vec2 uv = vec2(cos(a), sin(a))*r + 0.5;
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("mirror", "Mirror", "geometry", "Reflect across axis.",
    [{ key: "axis", label: "Axis", min: 0, max: 1, default: 0, step: 1 }],
    `
    vec2 uv = vUv;
    if (uAxis < 0.5) uv.x = uv.x < 0.5 ? uv.x*2.0 : (1.0 - uv.x)*2.0;
    else             uv.y = uv.y < 0.5 ? uv.y*2.0 : (1.0 - uv.y)*2.0;
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("lensWarp", "Lens Warp", "geometry", "Barrel/pincushion distortion.",
    [{ key: "amount", label: "Amount", min: -1, max: 1, default: 0.4 }],
    `
    vec2 p = vUv-0.5;
    float r2 = dot(p,p);
    p *= 1.0 + uAmount*r2*2.0;
    gl_FragColor = texture2D(uTex, p+0.5);
    `),

  fx("twirl", "Twirl", "geometry", "Spiral swirl from center.",
    [{ key: "amount", label: "Amount", min: -2, max: 2, default: 0.8 }],
    `
    vec2 p = vUv-0.5;
    float r = length(p);
    float a = atan(p.y,p.x) + uAmount * (1.0 - r) * 3.0;
    gl_FragColor = texture2D(uTex, vec2(cos(a),sin(a))*r + 0.5);
    `),

  // ── ATMOSPHERE ────────────────────────────────────────────────────
  fx("filmGrain", "Film Grain", "atmosphere", "Soft analog grain.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.3 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float g = (rand(vUv + uTime) - 0.5) * uAmount * 0.4;
    gl_FragColor = vec4(c.rgb + g, c.a);
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
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.3 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float n = rand(vUv*vec2(1024.,768.) + uTime*100.0);
    gl_FragColor = vec4(mix(c.rgb, vec3(n), uAmount*0.6), c.a);
    `),

  fx("fog", "Fog", "atmosphere", "Soft volumetric haze.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.4 },
     { key: "hue", label: "Hue", min: 0, max: 1, default: 0.85 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float f = noise(vUv*3.0 + uTime*0.1);
    vec3 haze = hsv2rgb(vec3(uHue, 0.4, 0.95));
    gl_FragColor = vec4(mix(c.rgb, haze, f*uAmount*0.6), c.a);
    `),

  fx("lightLeak", "Light Leak", "atmosphere", "Vintage edge flares.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float d = distance(vUv, vec2(0.1 + sin(uTime*0.3)*0.1, 0.5));
    vec3 leak = vec3(1.0,0.4,0.7) * smoothstep(0.6, 0.0, d);
    gl_FragColor = vec4(c.rgb + leak*uAmount, c.a);
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
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 }],
    `
    vec2 p = vUv - 0.5;
    vec4 base = texture2D(uTex, vUv);
    float l = dot(base.rgb, vec3(0.299,0.587,0.114));
    vec2 uv = vUv - p * (l - 0.5) * uAmount * 0.6;
    gl_FragColor = texture2D(uTex, uv);
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
    gl_FragColor = vec4(r,g,b,1.0);
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
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 swap = vec3(c.g, c.b*0.6 + c.r*0.4, c.r);
    swap.r = pow(swap.r, 0.7);
    gl_FragColor = vec4(mix(c.rgb, swap, uAmount), c.a);
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
     { key: "scale", label: "Scale", min: 1, max: 16, default: 5 },
     { key: "speed", label: "Speed", min: 0, max: 3, default: 0.6 }],
    `
    vec2 p = vUv*uScale + uTime*uSpeed*0.2;
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

  fx("zoomBlur", "Zoom Blur", "geometry", "Radial motion zoom from center.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 }],
    `
    vec2 p = vUv - 0.5;
    vec4 acc = vec4(0.0);
    for (int i=0; i<10; i++) {
      float t = float(i)/10.0;
      acc += texture2D(uTex, 0.5 + p*(1.0 - t*uAmount*0.3));
    }
    gl_FragColor = acc/10.0;
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
     { key: "scale", label: "Scale", min: 1, max: 20, default: 6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec2 p = vUv*uScale;
    float t = uTime*uSpeed;
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
    float freeze = smoothstep(0.22, 0.0, abs(band - 0.5));
    float frost = noise(vUv*60.0 + band*10.0);
    // Displace inside the band too, so it reads as a frozen tear rather than a
    // faint tint.
    vec3 ice = vec3(0.7, 0.9, 1.0) * frost;
    c = texture2D(uTex, vUv + vec2((frost-0.5)*0.04*freeze, 0.0));
    gl_FragColor = vec4(mix(c.rgb, c.rgb*0.5 + ice, freeze*uAmount), c.a);
    `),

  fx("filmicTone", "Filmic Tone", "color", "Contrast, shadow density and colour depth — the remaster pass.",
    [{ key: "punch", label: "Punch", min: 0, max: 1, default: 0.55 },
     { key: "depth", label: "Depth", min: 0, max: 1, default: 0.4 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(clamp(mix(vec3(l), s, 1.0 + uPunch * 0.45), 0.0, 1.0), 1.0);
    `),

  // ── SIGNATURE SET ─────────────────────────────────────────────────
  // Built for the quadrant instrument. Every effect below takes exactly
  // TWO continuous params, because a quadrant drag binds X to params[0]
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
    vec2 off = dir * ring * amt * 0.06;
    // Split the channels across the wavefront — refraction, not just offset.
    vec3 col = vec3(
      texture2D(uTex, vUv + off * 1.3).r,
      texture2D(uTex, vUv + off).g,
      texture2D(uTex, vUv + off * 0.7).b
    );
    col += vec3(0.55, 0.75, 1.0) * max(0.0, ring) * amt * 0.55;
    gl_FragColor = vec4(col, 1.0);
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
    gl_FragColor = vec4(col, 1.0);
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
     { key: "bend", label: "Bend", min: 0, max: 1, default: 0.35 }],
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
    float reach = uSpread * mix(0.08, 0.08 + r * 0.16, uBend);
    vec3 acc = vec3(0.0);
    vec3 wsum = vec3(0.0);
    // Nine spectral taps, violet through red, each displaced by its own
    // "wavelength" — the further the tap, the longer the wavelength.
    for (int i = 0; i < 9; i++) {
      float lam = float(i) / 8.0;
      float t = (lam - 0.5) * 2.0;
      vec3 w = hsv2rgb(vec3(0.75 - lam * 0.75, 0.9, 1.0));
      acc += texture2D(uTex, vUv + dir * t * reach).rgb * w;
      wsum += w;
    }
    vec3 col = acc / max(wsum, vec3(1e-3));
    // Faint travelling interference fringes sell the grating.
    float fringe = sin(dot(vUv, dir) * 140.0 - uTime * 1.5) * 0.5 + 0.5;
    col *= 1.0 + fringe * uSpread * 0.12;
    gl_FragColor = vec4(col, 1.0);
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
    gl_FragColor = vec4(col, 1.0);
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
    vec2 uv = vUv + curl * uFlow * 0.02;
    // A second advection step lengthens the streamlines into ribbons.
    vec2 p2 = uv * sc;
    vec2 curl2 = vec2(noise(p2 + vec2(0.0, e) + t) - noise(p2 - vec2(0.0, e) + t),
                     -(noise(p2 + vec2(e, 0.0) - t) - noise(p2 - vec2(e, 0.0) - t))) / (2.0 * e);
    uv += curl2 * uFlow * 0.014;
    vec4 col = texture2D(uTex, uv);
    float dens = clamp(length(curl) * 0.06, 0.0, 1.0);
    col.rgb = mix(col.rgb, col.rgb * (1.0 - dens * 0.5) + vec3(0.05, 0.07, 0.12) * dens, uFlow);
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
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(mix(c, 1.0 - outC, uAmount), 1.0);
    `),

  fx("crossHatch", "Cross Hatch", "color", "Pen-and-ink engraving that follows the shading.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.75 },
     { key: "density", label: "Density", min: 0, max: 1, default: 0.5 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec2 a = vUv * uResolution / uResolution.y * mix(90.0, 320.0, uDensity);
    // Four hatch layers, each cutting in as the tone gets darker.
    float h = 1.0;
    if (l < 0.85) h = min(h, smoothstep(0.0, 0.5, abs(sin((a.x + a.y) * 0.7))));
    if (l < 0.62) h = min(h, smoothstep(0.0, 0.5, abs(sin((a.x - a.y) * 0.7))));
    if (l < 0.42) h = min(h, smoothstep(0.0, 0.5, abs(sin(a.y * 0.9))));
    if (l < 0.22) h = min(h, smoothstep(0.0, 0.5, abs(sin(a.x * 0.9))));
    vec3 ink = mix(vec3(0.06, 0.05, 0.08), vec3(0.98, 0.97, 0.94), h);
    gl_FragColor = vec4(mix(c, ink, uAmount), 1.0);
    `),

  fx("kuwahara", "Painterly", "color", "Kuwahara smoothing — oil paint that keeps its edges.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "radius", label: "Brush", min: 2, max: 16, default: 7 }],
    `
    vec2 px = uRadius / uResolution;
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(mix(c, bestMean, uAmount), 1.0);
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
    gl_FragColor = vec4(mix(texture2D(uTex, vUv).rgb, stereo, uAmount), 1.0);
    `),

  fx("photocopy", "Photocopy", "color", "Blown-out repro with toner grain.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.8 },
     { key: "bias", label: "Exposure", min: 0, max: 1, default: 0.5 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    // Local average decides the cut, so the whole frame doesn't crush to one
    // tone the way a fixed threshold would.
    float local = dot(discBlur(vUv, 9.0), vec3(0.299, 0.587, 0.114));
    float cut = local + (uBias - 0.5) * 0.45;
    float toner = smoothstep(cut + 0.05, cut - 0.05, l);
    toner *= 0.82 + 0.18 * noise(vUv * 420.0);
    vec3 paper = vec3(0.96, 0.95, 0.92);
    vec3 res = mix(paper, vec3(0.05, 0.05, 0.07), toner);
    gl_FragColor = vec4(mix(c, res, uAmount), 1.0);
    `),

  fx("contourMap", "Contour Map", "color", "Tone quantised into topographic bands.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.7 },
     { key: "bands", label: "Bands", min: 0, max: 1, default: 0.45 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float n = mix(4.0, 26.0, uBands);
    float q = floor(l * n) / n;
    // Bright line exactly on each contour, like an elevation map.
    float edge = abs(fract(l * n) - 0.5) * 2.0;
    float line = smoothstep(0.86, 1.0, edge);
    vec3 banded = hsv2rgb(vec3(fract(0.62 - q * 0.72), 0.62, 0.35 + q * 0.75));
    gl_FragColor = vec4(mix(c, banded + line * 0.55, uAmount), 1.0);
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
    gl_FragColor = vec4(mix(texture2D(uTex, vUv).rgb, metal, uAmount), 1.0);
    `),

  fx("spinBlur", "Spin Blur", "geometry", "Rotational motion blur around the centre.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.55 },
     { key: "centre", label: "Offset", min: 0, max: 1, default: 0.5 }],
    `
    // Distinct from Zoom Blur: this smears ALONG the arc rather than outward.
    vec2 mid = vec2(0.5, mix(0.2, 0.8, uCentre));
    vec2 d = vUv - mid;
    float r = length(d);
    float a0 = atan(d.y, d.x);
    float sweep = uAmount * 0.85;
    vec4 acc = vec4(0.0);
    float w = 0.0;
    for (int i = 0; i < 9; i++) {
      float t = (float(i) / 8.0 - 0.5) * sweep;
      float k = 1.0 - abs(float(i) / 8.0 - 0.5) * 1.2;
      float a = a0 + t;
      acc += texture2D(uTex, mid + vec2(cos(a), sin(a)) * r) * k;
      w += k;
    }
    gl_FragColor = acc / w;
    `),

  fx("moire", "Moire", "geometry", "Two grids beating against each other.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "pitch", label: "Pitch", min: 0, max: 1, default: 0.5 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(mix(c, c * (0.35 + beat * 1.3) * tint * 1.4, uAmount), 1.0);
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
    vec3 c = texture2D(uTex, uv).rgb;
    // Seam highlight so the slice boundaries stay legible.
    float seam = smoothstep(0.0, 0.02, abs(fract(vUv.x * n) - 0.5) * 2.0);
    gl_FragColor = vec4(c * (0.75 + seam * 0.35), 1.0);
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
    vec3 c = texture2D(uTex, uv).rgb;
    // Slight per-row exposure drift, as real sensors show under flicker.
    c *= 0.9 + 0.2 * sin(t * 2.0 + row * 40.0) * uAmount;
    gl_FragColor = vec4(c, 1.0);
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
      float k = pow(uAmount, t) * 0.85;
      acc += texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb * k;
      w += k;
    }
    gl_FragColor = vec4(acc / w, 1.0);
    `),

  fx("caustics", "Caustics", "atmosphere", "Pool light dancing over everything.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "scale", label: "Scale", min: 0, max: 1, default: 0.5 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(c + light * uAmount * 2.2 * (0.7 + uPulse * 0.6), 1.0);
    `),

  fx("anamorphic", "Anamorphic Flare", "atmosphere", "Horizontal blue streaks off the highlights.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "length", label: "Length", min: 0, max: 1, default: 0.55 }],
    `
    vec3 c = texture2D(uTex, vUv).rgb;
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
    gl_FragColor = vec4(c + streak * vec3(0.35, 0.6, 1.0) * uAmount * 9.0, 1.0);
    `),
];

export const EFFECTS_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map(e => [e.id, e]));

export const CATEGORY_LABELS: Record<EffectCategory, string> = {
  corruption: "Data Corruption",
  color: "Color Chaos",
  geometry: "Geometry",
  atmosphere: "Atmosphere",
};
