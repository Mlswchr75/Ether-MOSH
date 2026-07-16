/**
 * Seamless-tile post-process. Runs after the effect stack, before the screen
 * blit, so any moshed frame can be turned into a repeatable texture.
 *
 * Two strategies:
 *  - "seamless": classic wrap-offset cross-blend. Sample the frame and a
 *    half-period-offset copy, and fade between them near the tile seams.
 *  - "mirror": mirror-repeat folding. Inherently seamless, reads as a
 *    kaleidoscopic weave at low scales.
 */
export type TileMode = "none" | "seamless" | "mirror";

export type TileUniforms = {
  /** rotation of the tile lattice, radians */
  angle: number;
  /** tiles across the frame (1 = whole frame) */
  scale: number;
  /** lattice phase offsets, 0..1 */
  phaseX: number;
  phaseY: number;
  /** seam cross-fade width, 0..0.5 */
  blend: number;
  /** extra softening at seams, 0..1 */
  blur: number;
};

export const DEFAULT_TILE_UNIFORMS: TileUniforms = {
  angle: 0,
  scale: 1,
  phaseX: 0,
  phaseY: 0,
  blend: 0.18,
  blur: 0,
};

const TILE_HEADER = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uAngle;
uniform float uScale;
uniform float uPhaseX;
uniform float uPhaseY;
uniform float uBlend;
uniform float uBlur;

vec2 lattice(vec2 uv) {
  vec2 p = uv - 0.5;
  float c = cos(uAngle), s = sin(uAngle);
  p = mat2(c, -s, s, c) * p;
  return p * max(uScale, 0.001) + 0.5 + vec2(uPhaseX, uPhaseY);
}

vec4 softSample(vec2 uv) {
  vec4 c = texture2D(uTex, uv);
  if (uBlur > 0.001) {
    float r = uBlur * 0.006;
    c += texture2D(uTex, uv + vec2( r,  0.0));
    c += texture2D(uTex, uv + vec2(-r,  0.0));
    c += texture2D(uTex, uv + vec2(0.0,  r));
    c += texture2D(uTex, uv + vec2(0.0, -r));
    c /= 5.0;
  }
  return c;
}
`;

/** Wrap-offset cross-blend: hides the seam by fading to a half-offset copy. */
export const TILE_OFFSET_FRAG = /* glsl */ `
${TILE_HEADER}
void main() {
  vec2 p = lattice(vUv);
  vec2 uv = fract(p);
  vec4 a = softSample(uv);
  vec4 b = softSample(fract(uv + 0.5));
  float w = max(uBlend, 0.001);
  float wx = smoothstep(0.0, w, min(uv.x, 1.0 - uv.x));
  float wy = smoothstep(0.0, w, min(uv.y, 1.0 - uv.y));
  gl_FragColor = mix(b, a, min(wx, wy));
}
`;

/** Mirror-repeat folding: abs(fract) triangle wave, always continuous. */
export const TILE_FREQ_FRAG = /* glsl */ `
${TILE_HEADER}
void main() {
  vec2 p = lattice(vUv);
  vec2 uv = abs(fract(p * 0.5) * 2.0 - 1.0);
  gl_FragColor = softSample(uv);
}
`;
