/**
 * Canonical GLSL for the PostChain grade pass (WebGL2 / GLSL ES 3.00).
 *
 * This is the color-correct pipeline validated in the app. The critical detail
 * — the one that caused the repeated "too much black" regressions — is the
 * OUTPUT ENCODE: the grade runs in linear-ish space and encodes to sRGB
 * exactly ONCE at the very end (`linearToSrgb`). Do not also set an sRGB output
 * color space on the target, or the image double-encodes and crushes to black.
 *
 * The TS reference in `color.ts` mirrors the grade math (minus GPU-only CAS /
 * bloom / grain) and is unit-tested to guarantee no darkening at defaults.
 */

export const GRADE_VERT = /* glsl */ `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const GRADE_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;     // HDR/effect output (linear-ish)
uniform sampler2D uOriginal;  // untouched source, for the blend
uniform sampler2D uBloom;     // additive bloom (never darkens)
uniform vec2  uTexel;         // 1.0 / resolution
uniform float uTime;

uniform float uBloomStrength;
uniform float uSharpness;
uniform float uSaturation;
uniform float uVibrance;
uniform float uContrast;
uniform float uAberration;
uniform float uVignette;
uniform float uToneMap;
uniform float uGrain;
uniform float uMix;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 sat(vec3 c, float s) { float l = dot(c, LUMA); return mix(vec3(l), c, s); }
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.7); }
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 linearToSrgb(vec3 c) {
  return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

void main() {
  vec2 uv = vUv;

  // Chromatic aberration — subtle, edge-weighted.
  vec2 dir = uv - 0.5;
  float ca = uAberration * dot(dir, dir);
  vec3 scene;
  scene.r = texture(uScene, uv + dir * ca).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - dir * ca).b;

  // CAS (contrast adaptive sharpening).
  vec3 a = texture(uScene, uv + vec2(-uTexel.x,  uTexel.y)).rgb;
  vec3 b = texture(uScene, uv + vec2( uTexel.x,  uTexel.y)).rgb;
  vec3 c = texture(uScene, uv + vec2(-uTexel.x, -uTexel.y)).rgb;
  vec3 d = texture(uScene, uv + vec2( uTexel.x, -uTexel.y)).rgb;
  vec3 mn = min(min(min(a, b), c), min(d, scene));
  vec3 mx = max(max(max(a, b), c), max(d, scene));
  vec3 amp = clamp(min(mn, 2.0 - mx) / mx, 0.0, 1.0);
  vec3 w = sqrt(amp);
  float wn = -(1.0 / (mix(8.0, 5.0, clamp(uSharpness, 0.0, 1.0)) * 4.0 - 1.0));
  vec3 color = clamp((scene * (1.0 - 4.0 * wn) + (a + b + c + d) * wn) /
    (1.0 + (w.r + w.g + w.b) / 3.0 * (4.0 * wn - 1.0)), 0.0, 1.0);

  // Bloom is purely additive — it can only add light, never darken.
  color += texture(uBloom, uv).rgb * uBloomStrength;

  // Grade.
  color = sat(color, uSaturation);
  float cs = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
  color = sat(color, 1.0 + uVibrance * (1.0 - cs));
  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Vignette (default strength 0 → no-op).
  float vig = 1.0 - uVignette * smoothstep(0.2, 0.9, length(dir));
  color *= vig;

  // Optional filmic tone-map (default 0 → neutral).
  color = mix(color, aces(color), uToneMap);

  // Grain.
  color += (rand(uv) - 0.5) * uGrain;
  color = clamp(color, 0.0, 1.0);

  // Blend with the untouched original so true color/detail always shows.
  vec3 original = texture(uOriginal, uv).rgb;
  color = mix(original, color, uMix);

  // Encode to sRGB EXACTLY ONCE here. Do not also mark the output sRGB.
  fragColor = vec4(linearToSrgb(color), 1.0);
}
`;
