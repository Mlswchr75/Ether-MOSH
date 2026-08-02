/**
 * vrMode — immersive WebXR playback for Quest / Occlusion-class headsets.
 *
 * The mosh pipeline keeps rendering exactly as it does on the flat canvas,
 * except the final blit is redirected into an offscreen render target. That
 * texture is then mapped onto a huge inward-facing sphere so the viewer is
 * fully engulfed by the visualizer in 360°.
 *
 * Controls in-headset:
 *   • Controller trigger on empty space   → MOSH
 *   • Controller ray + trigger on panel   → panel button
 *   • Squeeze / grip                      → reroll seed
 *   • Gaze + tap (no controllers)         → same select path
 * The floating panel billboards back in front of the viewer whenever they
 * turn away from it, so the controls are always reachable.
 */
import * as THREE from "three";
import { MoshRenderer } from "./Renderer";
import { useStore } from "@/store/useStore";
import type { Intensity } from "@/store/types";

const INTENSITIES: Intensity[] = ["mild", "savage", "nuclear", "interdimensional"];

type Btn = { label: () => string; run: () => void };

const PANEL_W = 0.62;
const PANEL_H = 0.38;
const COLS = 2;

export class VrMode {
  active = false;
  private session: XRSession | null = null;
  private mosh: MoshRenderer | null = null;
  private renderFrame: (() => void) | null = null;
  private scene = new THREE.Scene();
  private rtOut: THREE.WebGLRenderTarget | null = null;
  private dome: THREE.Mesh | null = null;
  private panel: THREE.Mesh | null = null;
  private panelCanvas: HTMLCanvasElement | null = null;
  private panelTex: THREE.CanvasTexture | null = null;
  private controllers: THREE.Group[] = [];
  private raycaster = new THREE.Raycaster();
  private hoverIndex = -1;
  private prevXrEnabled = false;
  private listeners = new Set<(active: boolean) => void>();

  private buttons: Btn[] = [
    { label: () => "MOSH", run: () => useStore.getState().mosh() },
    { label: () => "RESHUFFLE", run: () => useStore.getState().rerollSeed() },
    { label: () => "UNDO", run: () => useStore.getState().undo() },
    { label: () => "CLEAR", run: () => useStore.getState().clearLayers() },
    {
      label: () => useStore.getState().intensity.toUpperCase(),
      run: () => {
        const cur = useStore.getState().intensity;
        const next = INTENSITIES[(INTENSITIES.indexOf(cur) + 1) % INTENSITIES.length];
        useStore.getState().setIntensity(next);
      },
    },
    {
      label: () => (useStore.getState().micEnabled ? "MIC ON" : "MIC OFF"),
      run: () => useStore.getState().setMicEnabled(!useStore.getState().micEnabled),
    },
    { label: () => "EXIT VR", run: () => void this.exit() },
  ];

  onChange(fn: (active: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() { for (const fn of this.listeners) fn(this.active); }

  async isSupported(): Promise<boolean> {
    const xr = (navigator as any).xr;
    if (!xr?.isSessionSupported) return false;
    try { return await xr.isSessionSupported("immersive-vr"); } catch { return false; }
  }

  async enter(mosh: MoshRenderer, renderFrame: () => void) {
    if (this.active) return;
    const xr = (navigator as any).xr;
    if (!xr) throw new Error("WebXR unavailable");

    const session: XRSession = await xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    });

    this.mosh = mosh;
    this.renderFrame = renderFrame;
    this.session = session;

    const gl = mosh.renderer;
    this.prevXrEnabled = gl.xr.enabled;
    gl.xr.enabled = true;
    await gl.xr.setSession(session as any);
    try { gl.xr.setReferenceSpaceType("local-floor"); } catch { /* fallback handled by three */ }

    this.buildScene();
    this.active = true;
    this.emit();

    session.addEventListener("end", () => this.cleanup());

    gl.setAnimationLoop(() => this.frame());
  }

  async exit() {
    try { await this.session?.end(); } catch { /* already ending */ }
    this.cleanup();
  }

  /* ---------- scene ---------- */

  private buildScene() {
    const mosh = this.mosh!;
    const rt = new THREE.WebGLRenderTarget(2048, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.rtOut = rt;
    mosh.setXrTarget(rt);

    // 360° dome — the viewer sits inside the visualizer.
    const domeGeo = new THREE.SphereGeometry(24, 64, 40);
    const domeMat = new THREE.MeshBasicMaterial({
      map: rt.texture,
      side: THREE.BackSide,
      toneMapped: false,
      depthWrite: false,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.scene.add(this.dome);

    // Control panel.
    const canvas = document.createElement("canvas");
    canvas.width = 620; canvas.height = 380;
    this.panelCanvas = canvas;
    this.panelTex = new THREE.CanvasTexture(canvas);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panel = new THREE.Mesh(
      new THREE.PlaneGeometry(PANEL_W, PANEL_H),
      new THREE.MeshBasicMaterial({ map: this.panelTex, transparent: true, toneMapped: false })
    );
    this.panel.position.set(0, 1.3, -0.9);
    this.scene.add(this.panel);
    this.paintPanel();

    // Controllers + laser rays.
    const gl = this.mosh!.renderer;
    for (let i = 0; i < 2; i++) {
      const c = gl.xr.getController(i);
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }));
      line.name = "ray";
      line.scale.z = 3;
      c.add(line);
      c.addEventListener("selectstart", () => this.onSelect(c));
      c.addEventListener("squeezestart", () => useStore.getState().rerollSeed());
      this.scene.add(c);
      this.controllers.push(c);
    }
    // Gaze / tap fallback when no controllers are present.
    this.session?.addEventListener("select", (e: any) => {
      if (e?.inputSource?.targetRayMode === "gaze") this.onSelect(null);
    });
  }

  private paintPanel() {
    const c = this.panelCanvas;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const rows = Math.ceil(this.buttons.length / COLS);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(6,6,10,0.82)";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, c.width - 3, c.height - 3);

    const pad = 14;
    const cw = (c.width - pad * (COLS + 1)) / COLS;
    const ch = (c.height - pad * (rows + 1)) / rows;
    this.buttons.forEach((b, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const x = pad + col * (cw + pad);
      const y = pad + row * (ch + pad);
      const hot = i === this.hoverIndex;
      ctx.fillStyle = hot ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.08)";
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = hot ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cw, ch);
      ctx.fillStyle = hot ? "#08080c" : "rgba(255,255,255,0.92)";
      ctx.font = "600 26px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label(), x + cw / 2, y + ch / 2);
    });
    if (this.panelTex) this.panelTex.needsUpdate = true;
  }

  /* ---------- interaction ---------- */

  private hitTest(source: THREE.Object3D | null): number {
    if (!this.panel) return -1;
    const ray = this.raycaster;
    if (source) {
      const m = new THREE.Matrix4().identity().extractRotation(source.matrixWorld);
      ray.ray.origin.setFromMatrixPosition(source.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
    } else {
      const cam = this.mosh!.renderer.xr.getCamera();
      ray.ray.origin.setFromMatrixPosition(cam.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(new THREE.Matrix4().extractRotation(cam.matrixWorld));
    }
    const hits = ray.intersectObject(this.panel, false);
    if (!hits.length || !hits[0].uv) return -1;
    const rows = Math.ceil(this.buttons.length / COLS);
    const col = Math.min(COLS - 1, Math.floor(hits[0].uv.x * COLS));
    const row = Math.min(rows - 1, Math.floor((1 - hits[0].uv.y) * rows));
    const idx = row * COLS + col;
    return idx < this.buttons.length ? idx : -1;
  }

  private onSelect(source: THREE.Object3D | null) {
    const idx = this.hitTest(source);
    if (idx >= 0) this.buttons[idx].run();
    else useStore.getState().mosh(); // trigger anywhere in the void
    this.paintPanel();
  }

  /* ---------- frame ---------- */

  private frame() {
    if (!this.active || !this.mosh) return;
    // 1) Run the normal mosh pipeline — it now blits into rtOut.
    this.renderFrame?.();

    const gl = this.mosh.renderer;
    const cam = gl.xr.getCamera();

    // Keep the panel reachable: billboard it back in front of the viewer.
    if (this.panel) {
      const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const fwd = new THREE.Vector3(0, 0, -1).applyMatrix4(
        new THREE.Matrix4().extractRotation(cam.matrixWorld)
      );
      const want = camPos.clone().add(fwd.multiplyScalar(0.95)).add(new THREE.Vector3(0, -0.25, 0));
      if (this.panel.position.distanceTo(want) > 0.45) {
        this.panel.position.lerp(want, 0.08);
      }
      this.panel.lookAt(camPos);
    }

    // Hover feedback from either controller.
    let hover = -1;
    for (const c of this.controllers) {
      const idx = this.hitTest(c);
      if (idx >= 0) { hover = idx; break; }
    }
    if (hover !== this.hoverIndex) { this.hoverIndex = hover; this.paintPanel(); }

    // 2) Draw the immersive scene to the headset.
    gl.setRenderTarget(null);
    gl.render(this.scene, cam);
  }

  /* ---------- teardown ---------- */

  private cleanup() {
    if (!this.mosh) { this.active = false; this.emit(); return; }
    const gl = this.mosh.renderer;
    gl.setAnimationLoop(null);
    gl.xr.enabled = this.prevXrEnabled;
    this.mosh.setXrTarget(null);

    this.controllers.forEach(c => this.scene.remove(c));
    this.controllers = [];
    if (this.dome) {
      this.dome.geometry.dispose();
      (this.dome.material as THREE.Material).dispose();
      this.scene.remove(this.dome);
      this.dome = null;
    }
    if (this.panel) {
      this.panel.geometry.dispose();
      (this.panel.material as THREE.Material).dispose();
      this.scene.remove(this.panel);
      this.panel = null;
    }
    this.panelTex?.dispose(); this.panelTex = null; this.panelCanvas = null;
    this.rtOut?.dispose(); this.rtOut = null;

    this.session = null;
    this.mosh = null;
    this.renderFrame = null;
    this.hoverIndex = -1;
    this.active = false;
    this.emit();
  }
}

export const vrMode = new VrMode();
