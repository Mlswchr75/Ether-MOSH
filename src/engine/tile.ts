// Seamless tile post-process pass.
// Two algorithms:
//   - seamless: edges are blended so the design tiles infinitely in any
//     direction with no mirroring (a true wallpaper repeat).
//   - mirror: kaleidoscopic mirror-tile with frequency-domain seam blend
//     (mirror look, but the seams stay clean).
// Runs on the final composited output, after every effect in the layer stack.

export type TileMode = "none" | "seamless" | "mirror";

export type TileUniforms = {
  angle: number;   // radians, 0..2π
  scale: number;   // 1..4 tile repeat count
  phaseX: number;  // 0..1 horizontal phase offset
  phaseY: number;  // 0..1 vertical phase offset
  blend: number;   // 0.05..0.4 seam blend width
  blur: number;    // 0..1 frequency blur radius (mirror only)
};

export const DEFAULT_TILE_UNIFORMS: TileUniforms = {
  angle: 0,
  scale: 1,
  phaseX: 0,
  phaseY: 0,
  blend: 0.15,
  blur: 0.5,
};

export const TILE_MODE_LABELS: Record<TileMode, string> = {
  none:     "OFF",
  seamless: "SEAMLESS",
  mirror:   "MIRROR",
};

const COMMON_HEADER = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uAngle;
uniform float uScale;
uniform float uPhaseX;
uniform float uPhaseY;
uniform float uBlend;
uniform float uBlur;

vec2 applyTransform(vec2 uv) {
  if (uAngle != 0.0) {
    vec2 c = uv - 0.5;
    float cs = cos(uAngle), sn = sin(uAngle);
    c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
    uv = c + 0.5;
  }
  return fract(uv * uScale + vec2(uPhaseX, uPhaseY));
}
`;

export const TILE_MIRROR_FRAG = `${COMMON_HEADER}
vec4 mirrorSample(vec2 uv) {
  float mx = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  float my = uv.y > 0.5 ? 1.0 - uv.y : uv.y;
  return texture2D(uTex, vec2(mx * 2.0, my * 2.0));
}
void main() {
  vec2 uv = applyTransform(vUv);
  gl_FragColor = mirrorSample(uv);
}
`;

export const TILE_OFFSET_FRAG = `${COMMON_HEADER}
float fadeWeight(float v, float zone) {
  float hz = zone * 0.5;
  return smoothstep(0.0, hz, v) * smoothstep(1.0, 1.0 - hz, v);
}
void main() {
  vec2 uv = applyTransform(vUv);
  vec4 colA = texture2D(uTex, uv);
  vec4 colB = texture2D(uTex, fract(uv + 0.5));
  float wx = fadeWeight(uv.x, uBlend);
  float wy = fadeWeight(uv.y, uBlend);
  float wA = wx * wy;
  gl_FragColor = mix(colB, colA, wA);
}
`;

export const TILE_FREQ_FRAG = `${COMMON_HEADER}
vec4 sampleLow(vec2 uv, float r) {
  vec4 c = vec4(0.0);
  float step = r * 0.02;
  c += texture2D(uTex, uv);
  c += texture2D(uTex, uv + vec2( step,  0.0));
  c += texture2D(uTex, uv + vec2(-step,  0.0));
  c += texture2D(uTex, uv + vec2( 0.0,  step));
  c += texture2D(uTex, uv + vec2( 0.0, -step));
  return c / 5.0;
}
vec4 mirrorSample(vec2 uv) {
  float mx = uv.x > 0.5 ? 1.0 - uv.x : uv.x;
  float my = uv.y > 0.5 ? 1.0 - uv.y : uv.y;
  return texture2D(uTex, vec2(mx * 2.0, my * 2.0));
}
void main() {
  vec2 uv = applyTransform(vUv);

  // Low frequency: cross-fade at seam zones (offset blend).
  vec4 lowA = sampleLow(uv, uBlur);
  vec4 lowB = sampleLow(fract(uv + 0.5), uBlur);
  float wx = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x);
  float wy = smoothstep(0.0, 0.15, uv.y) * smoothstep(1.0, 0.85, uv.y);
  vec4 low = mix(lowB, lowA, wx * wy);

  // High frequency residual (mirror-tiled minus its own low-pass = seam-free detail).
  vec4 high = mirrorSample(uv);
  vec4 highFreq = high - sampleLow(uv, uBlur);

  gl_FragColor = vec4(clamp((low + highFreq).rgb, 0.0, 1.0), 1.0);
}
`;
