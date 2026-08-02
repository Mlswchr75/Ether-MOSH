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
     { key: "threshold", label: "Threshold", min: 0, max: 1, default: 0.45 }],
    `
    vec2 uv=vUv;
    vec4 c=texture2D(uTex,uv);
    float lum=dot(c.rgb,vec3(0.299,0.587,0.114));
    float s=step(uThreshold,lum)*uAmount;
    float n=noise(vec2(uv.y*120.0,uTime*0.3));
    uv.x = mix(uv.x, fract(uv.x + (n-0.5)*0.6*s + s*0.2), s);
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
    gl_FragColor = texture2D(uTex, vUv + j*uAmount*0.04);
    `),

  fx("scanBreak", "Scan Break", "corruption", "Horizontal line tears.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "speed", label: "Speed", min: 0, max: 4, default: 1 }],
    `
    float band = step(0.97, sin(vUv.y*120.0 + uTime*uSpeed*8.0));
    float shift = (rand(vec2(floor(vUv.y*200.0), floor(uTime*4.0))) - 0.5)*uAmount*0.5;
    vec2 uv = vec2(fract(vUv.x + shift*band), vUv.y);
    gl_FragColor = texture2D(uTex, uv);
    `),

  fx("frameSmear", "Frame Smear", "corruption", "Directional motion smear.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.5 },
     { key: "angle", label: "Angle", min: 0, max: 6.283, default: 0.5 }],
    `
    vec2 dir = vec2(cos(uAngle), sin(uAngle));
    vec4 acc = vec4(0.0);
    float w = 0.0;
    for (int i=0;i<8;i++){
      float t = float(i)/8.0;
      float k = 1.0 - t;
      acc += texture2D(uTex, vUv - dir*t*uAmount*0.08) * k;
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
     { key: "angle", label: "Angle", min: 0, max: 6.283, default: 0 }],
    `
    vec2 dir = vec2(cos(uAngle), sin(uAngle)) * uAmount * 0.04;
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
    float r = texture2D(uTex, vUv + vec2(0.012*uAmount, 0.0)).r;
    float g = texture2D(uTex, vUv).g;
    float b = texture2D(uTex, vUv - vec2(0.018*uAmount, 0.0)).b;
    float band = sin(vUv.y*800.0)*0.04*uAmount;
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
     { key: "threshold", label: "Threshold", min: 0, max: 1, default: 0.6 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 sum = vec3(0.0);
    float w = 0.0;
    for(int x=-3;x<=3;x++){
      for(int y=-3;y<=3;y++){
        vec2 o = vec2(float(x), float(y))/uResolution * 4.0;
        vec3 s = texture2D(uTex, vUv+o).rgb;
        float l = max(0.0, dot(s, vec3(0.299,0.587,0.114)) - uThreshold);
        sum += s * l;
        w += 1.0;
      }
    }
    gl_FragColor = vec4(c.rgb + sum/w * uAmount * 4.0, c.a);
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
     { key: "twist", label: "Twist", min: 0, max: 6.283, default: 1.5 }],
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
     { key: "angle", label: "Angle", min: 0, max: 6.283, default: 0.785 }],
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
    vec2 dir = (vUv - src)/12.0;
    vec2 uv = vUv;
    vec3 acc = vec3(0.0);
    float w = 1.0;
    for (int i=0;i<12;i++) {
      uv -= dir;
      vec3 s = texture2D(uTex, uv).rgb;
      float l = max(0.0, dot(s, vec3(0.299,0.587,0.114)) - 0.4);
      acc += s * l * w;
      w *= uDecay;
    }
    vec4 c = texture2D(uTex, vUv);
    gl_FragColor = vec4(c.rgb + acc*uAmount*0.3, c.a);
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
    vec2 p = vUv*uDensity;
    vec2 ip = floor(p), fp = fract(p) - 0.5;
    vec2 off = vec2(rand(ip), rand(ip+5.3))*0.5;
    fp -= off + vec2(sin(uTime*0.5+rand(ip)*6.28), cos(uTime*0.4+rand(ip)*6.28))*0.2;
    float d = length(fp);
    float mote = smoothstep(0.15, 0.0, d) * step(0.9, rand(ip+1.7));
    gl_FragColor = vec4(c.rgb + mote*uAmount, c.a);
    `),

  fx("dreamGlow", "Dream Glow", "atmosphere", "Soft Orton-effect dreamy diffusion.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "radius", label: "Radius", min: 1, max: 12, default: 5 }],
    `
    vec4 c = texture2D(uTex, vUv);
    vec3 blur = vec3(0.0);
    float w = 0.0;
    for (int x=-3;x<=3;x++) for (int y=-3;y<=3;y++) {
      vec2 o = vec2(float(x), float(y))/uResolution * uRadius;
      float k = exp(-(float(x*x+y*y))/8.0);
      blur += texture2D(uTex, vUv+o).rgb * k;
      w += k;
    }
    blur /= w;
    vec3 screen = 1.0 - (1.0 - c.rgb) * (1.0 - blur);
    gl_FragColor = vec4(mix(c.rgb, screen, uAmount), c.a);
    `),

  fx("vignette", "Vignette", "atmosphere", "Cinematic edge darkening with optional color.",
    [{ key: "amount", label: "Amount", min: 0, max: 1, default: 0.6 },
     { key: "size", label: "Size", min: 0.2, max: 1.5, default: 0.8 }],
    `
    vec4 c = texture2D(uTex, vUv);
    float d = distance(vUv, vec2(0.5));
    float v = smoothstep(uSize, uSize*0.4, d);
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
    float freeze = smoothstep(0.05, 0.0, abs(band - 0.5));
    float frost = noise(vUv*60.0 + band*10.0);
    vec3 ice = vec3(0.7, 0.9, 1.0) * frost;
    gl_FragColor = vec4(mix(c.rgb, c.rgb*0.5 + ice, freeze*uAmount), c.a);
    `),
];

export const EFFECTS_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map(e => [e.id, e]));

export const CATEGORY_LABELS: Record<EffectCategory, string> = {
  corruption: "Data Corruption",
  color: "Color Chaos",
  geometry: "Geometry",
  atmosphere: "Atmosphere",
};
