/**
 * Blend mode helpers shared by the compositor shader.
 * The compositor takes `prev` (accumulated) and `cur` (effect output, RGBA)
 * and mixes them with `opacity` and a `mode` integer.
 */
export const BLEND_MODES = [
  "normal",
  "screen",
  "multiply",
  "difference",
  "overlay",
  "hardLight",
  "additive",
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const BLEND_INDEX: Record<BlendMode, number> = {
  normal: 0,
  screen: 1,
  multiply: 2,
  difference: 3,
  overlay: 4,
  hardLight: 5,
  additive: 6,
};

/**
 * Spatial region kinds. A layer carrying one of these is confined to part of the
 * frame instead of covering all of it.
 *
 * `foreground` / `background` are the important ones: they gate on the depth
 * proxy, so ANY effect in the library can be pointed at just the subject or just
 * the room behind them. That is what turns a flat filter into a dimensional one,
 * and it costs nothing per-effect because the gate lives here in the compositor.
 */
export const REGION_MODES = [
  "none",
  "foreground",
  "background",
  "hbands",
  "vbands",
  "radial",
  "shards",
] as const;
export type RegionMode = (typeof REGION_MODES)[number];

export const REGION_INDEX: Record<RegionMode, number> = {
  none: 0,
  foreground: 1,
  background: 2,
  hbands: 3,
  vbands: 4,
  radial: 5,
  shards: 6,
};

export type LayerRegion = {
  mode: RegionMode;
  /** Meaning varies by mode: band count, radius, shard density. */
  scale?: number;
  /** Phase/rotation offset — animates bands and reseeds shards. */
  phase?: number;
  /** Depth cutoff for foreground/background gating (0..1). */
  gate?: number;
  /** Edge softness. 0 is a hard cut, higher values dissolve the boundary. */
  feather?: number;
  /** Flip the mask. */
  invert?: boolean;
};

export const COMPOSITOR_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform sampler2D uRegionDepth;
uniform float uOpacity;
uniform int uMode;
uniform int uRegionMode;
uniform float uRegionScale;
uniform float uRegionPhase;
uniform float uRegionGate;
uniform float uRegionFeather;
uniform float uRegionInvert;
uniform vec2 uAspect;

vec3 blendOverlay(vec3 b, vec3 t) {
  return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, b));
}
vec3 blendHardLight(vec3 b, vec3 t) {
  return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, t));
}

/* Every texture read here is sRGB-encoded 8-bit. Blending (and the final
   alpha-over) directly on those values is the classic wrong-space compositing
   bug — screen/additive read darker than they should, and 50% mixes look
   murky instead of a clean halfway point. Converting to linear light for the
   math and back to sRGB for the framebuffer write fixes both without
   changing any UI-facing opacity/mode semantics. */
vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/* Angular shards on a skewed grid.

   True Voronoi would need a 3x3 neighbour search — nine hashes and nine
   distance tests in a pass that already runs once per layer. Skewing the grid
   and hashing the cell gets the shattered-plate look for one hash, because what
   reads as "shattered" is the irregular ANGLE of the seams, not the exact
   Voronoi topology. */
float shardMask(vec2 uv, float density, float phase){
  vec2 p = uv * max(1.0, density);
  p += vec2(p.y * 0.62, p.x * 0.28);   // skew: kills the tell-tale square grid
  vec2 cell = floor(p);
  float h = hash21(cell + floor(phase));
  return h;
}

float regionMask(vec2 uv){
  if (uRegionMode == 0) return 1.0;

  float m = 1.0;
  float f = max(0.001, uRegionFeather);

  if (uRegionMode == 1 || uRegionMode == 2) {
    float d = texture2D(uRegionDepth, uv).r;
    m = smoothstep(uRegionGate - f, uRegionGate + f, d);
    if (uRegionMode == 2) m = 1.0 - m;
  } else if (uRegionMode == 3) {
    float band = sin((uv.y * max(1.0, uRegionScale) + uRegionPhase) * 6.2831853);
    m = smoothstep(-f, f, band);
  } else if (uRegionMode == 4) {
    float band = sin((uv.x * max(1.0, uRegionScale) + uRegionPhase) * 6.2831853);
    m = smoothstep(-f, f, band);
  } else if (uRegionMode == 5) {
    // Aspect-corrected so the falloff is a circle on screen, not an ellipse.
    float r = length((uv - 0.5) * uAspect);
    float rad = max(0.02, uRegionScale);
    m = 1.0 - smoothstep(rad - f, rad + f, r);
  } else {
    // Shards: keep the cells whose hash falls under the threshold. uRegionScale
    // doubles as density, so one control gives both "how many" and "how big".
    float h = shardMask(uv, uRegionScale, uRegionPhase);
    m = smoothstep(uRegionGate - f, uRegionGate + f, h);
  }

  return mix(m, 1.0 - m, uRegionInvert);
}

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec4 cur  = texture2D(uCur,  vUv);
  vec3 b = srgbToLinear(prev.rgb);
  vec3 t = srgbToLinear(cur.rgb);
  vec3 outRgb;
  if (uMode == 0)      outRgb = t;
  else if (uMode == 1) outRgb = 1.0 - (1.0 - b) * (1.0 - t);
  else if (uMode == 2) outRgb = b * t;
  else if (uMode == 3) outRgb = abs(b - t);
  else if (uMode == 4) outRgb = blendOverlay(b, t);
  else if (uMode == 5) outRgb = blendHardLight(b, t);
  else                 outRgb = b + t;
  float a = uOpacity * cur.a * regionMask(vUv);
  outRgb = mix(b, outRgb, a);
  gl_FragColor = vec4(linearToSrgb(outRgb), max(prev.a, a));
}
`;

export const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
