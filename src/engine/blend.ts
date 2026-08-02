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

export const COMPOSITOR_FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uPrev;
uniform sampler2D uCur;
uniform float uOpacity;
uniform int uMode;

vec3 blendOverlay(vec3 b, vec3 t) {
  return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, b));
}
vec3 blendHardLight(vec3 b, vec3 t) {
  return mix(2.0 * b * t, 1.0 - 2.0 * (1.0 - b) * (1.0 - t), step(0.5, t));
}

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec4 cur  = texture2D(uCur,  vUv);
  vec3 b = prev.rgb;
  vec3 t = cur.rgb;
  vec3 outRgb;
  if (uMode == 0)      outRgb = t;
  else if (uMode == 1) outRgb = 1.0 - (1.0 - b) * (1.0 - t);
  else if (uMode == 2) outRgb = b * t;
  else if (uMode == 3) outRgb = abs(b - t);
  else if (uMode == 4) outRgb = blendOverlay(b, t);
  else if (uMode == 5) outRgb = blendHardLight(b, t);
  else                 outRgb = b + t;
  outRgb = mix(b, outRgb, uOpacity * cur.a);
  gl_FragColor = vec4(outRgb, max(prev.a, cur.a * uOpacity));
}
`;

export const PASSTHROUGH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
