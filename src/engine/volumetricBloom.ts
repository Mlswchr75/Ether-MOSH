/**
 * Volumetric Bloom — the one GPU-native generator. A small sibling to
 * MoshRenderer: its own WebGLRenderer, its own full-screen quad, its own
 * context-loss handling, following the exact same construction pattern
 * (antialias off, mediump precision, high-performance power preference) so
 * it behaves consistently with the rest of the app's WebGL usage. Renders a
 * smooth-union of three animated spheres via sphere-tracing — a lit,
 * breathing, morphing form against near-black, composited into Forge's
 * source canvas the same way a base photo already is.
 */
import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform float uEnergy;
uniform float uBeat;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uStepBudget;

#define MAX_STEPS 64
#define MAX_DIST 12.0
#define SURF_EPS 0.01

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float map(vec3 p) {
  float t = uTime * 0.6;
  vec3 p1 = p + vec3(sin(t * 0.9) * 0.5, cos(t * 0.7) * 0.4, sin(t * 1.1) * 0.3);
  vec3 p2 = p + vec3(cos(t * 1.2) * 0.45, sin(t * 0.5) * 0.5, cos(t * 0.8) * 0.35);
  vec3 p3 = p + vec3(sin(t * 0.4 + 2.0) * 0.4, cos(t * 1.3 + 1.0) * 0.3, sin(t * 0.6) * 0.45);
  float r = 0.85 + uBeat * 0.18;
  float d1 = sdSphere(p1, r * 0.55);
  float d2 = sdSphere(p2, r * 0.45);
  float d3 = sdSphere(p3, r * 0.4);
  return smin(smin(d1, d2, 0.5), d3, 0.5);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (vUv - 0.5) * 2.0;
  uv.x *= uResolution.x / uResolution.y;

  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv, -1.6));

  float dist = 0.0;
  bool hit = false;
  vec3 p = ro;
  for (int i = 0; i < MAX_STEPS; i++) {
    if (float(i) >= uStepBudget) break;
    p = ro + rd * dist;
    float d = map(p);
    if (d < SURF_EPS) { hit = true; break; }
    dist += d;
    if (dist > MAX_DIST) break;
  }

  vec3 col = vec3(0.0);
  if (hit) {
    vec3 n = normalAt(p);
    vec3 lightDir = normalize(vec3(0.5, 0.7, 0.6));
    float diff = max(0.0, dot(n, lightDir));
    float rim = pow(1.0 - max(0.0, dot(n, -rd)), 2.5);
    vec3 base = mix(uColorA, uColorB, 0.5 + 0.5 * sin(dist * 1.3 + uTime * 0.4));
    col = base * (0.25 + diff * 0.75) + base * rim * 1.4;
    col += uEnergy * 0.3 * base;
  } else {
    float glow = 1.0 / (1.0 + dist * dist * 0.35);
    col = mix(uColorA, uColorB, 0.5) * glow * 0.5;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export type VolumetricBloomFrame = {
  energy: number;
  beat: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
  stepBudget: number;
};

export class VolumetricBloomRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private canvas: HTMLCanvasElement;
  private lost = false;
  private onLost = () => { this.lost = true; };
  private onRestored = () => { this.lost = false; };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(canvas.width || 1, canvas.height || 1) },
        uEnergy: { value: 0 },
        uBeat: { value: 0 },
        uColorA: { value: new THREE.Vector3(1, 1, 1) },
        uColorB: { value: new THREE.Vector3(1, 1, 1) },
        uStepBudget: { value: 48 },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    // Throws here if WebGL is unavailable — the caller is expected to catch
    // construction and fall back to a different generator, matching how
    // MoshingBackdrop already treats its own renderer construction.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setClearColor(0x000000, 1);

    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  get isLost(): boolean {
    return this.lost;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  render(t: number, frame: VolumetricBloomFrame) {
    if (this.lost) return;
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uEnergy.value = frame.energy;
    u.uBeat.value = frame.beat;
    u.uStepBudget.value = frame.stepBudget;
    (u.uColorA.value as THREE.Vector3).set(frame.colorA[0], frame.colorA[1], frame.colorA[2]);
    (u.uColorB.value as THREE.Vector3).set(frame.colorB[0], frame.colorB[1], frame.colorB[2]);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.material.dispose();
    this.renderer.dispose();
  }
}
