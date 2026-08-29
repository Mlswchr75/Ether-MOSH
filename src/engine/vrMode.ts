/**
 * Immersive WebXR playback for Meta Quest and other standards-compliant
 * headsets. MOSH renders its normal flat post-processing pipeline into a
 * texture, then this class presents that texture inside a head-centered dome.
 *
 * The always-visible MODE toggle is part of the headset scene, not the MOSH
 * output texture, so it can never leak into still/video exports. Selecting it
 * exits immersive WebXR and returns to Horizon's movable/resizable Browser
 * panel. A horizontal thumbstick flick performs the same switch.
 */
import * as THREE from "three";
import { MoshRenderer } from "./Renderer";
import { useStore } from "@/store/useStore";
import { hasHorizontalThumbstickFlick, isThumbstickCentered, resolveXrTextureSize, runFlatRenderPass } from "./xrCapabilities";
import { activateXrHotTrigger, getXrHotTriggers, type XrHotTrigger } from "./xrHotTriggers";

const DOME_RADIUS = 24;
const TOGGLE_W = 0.42;
const TOGGLE_H = 0.105;
const MENU_ITEM_SIZE = 0.13;

type XrControllerEvents = {
  addEventListener: (type: "selectstart" | "selectend" | "squeezestart", listener: () => void) => void;
  removeEventListener: (type: "selectstart" | "selectend" | "squeezestart", listener: () => void) => void;
};

type XrMenuItem = { trigger: XrHotTrigger; mesh: THREE.Mesh; texture: THREE.CanvasTexture };

export class VrMode {
  active = false;
  private session: XRSession | null = null;
  private mosh: MoshRenderer | null = null;
  private renderFrame: (() => void) | null = null;
  private scene = new THREE.Scene();
  private output: THREE.WebGLRenderTarget | null = null;
  private dome: THREE.Mesh | null = null;
  private toggle: THREE.Mesh | null = null;
  private toggleTexture: THREE.CanvasTexture | null = null;
  private menu = new THREE.Group();
  private menuItems: XrMenuItem[] = [];
  private menuVisible = false;
  private menuSource: THREE.Object3D | null = null;
  private selectStartedWithMenu = false;
  private highlightedMenuItem: XrMenuItem | null = null;
  private controllers: THREE.Group[] = [];
  private controllerDisposables: Array<{
    controller: THREE.Group;
    events: XrControllerEvents;
    ray: THREE.Line;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    onSelect: () => void;
    onSelectEnd: () => void;
    onSqueeze: () => void;
  }> = [];
  private raycaster = new THREE.Raycaster();
  private toggleHovered = false;
  private prevXrEnabled = false;
  private cleaning = false;
  private flickLatched = new WeakSet<object>();
  private listeners = new Set<(active: boolean) => void>();

  onChange(fn: (active: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.active);
  }

  async isSupported(): Promise<boolean> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) return false;
    try {
      return await xr.isSessionSupported("immersive-vr");
    } catch {
      return false;
    }
  }

  async enter(mosh: MoshRenderer, renderFrame: () => void): Promise<void> {
    if (this.active) return;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) throw new Error("WebXR is unavailable in this browser");

    const session = await xr.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    });

    this.mosh = mosh;
    this.renderFrame = renderFrame;
    this.session = session;
    this.cleaning = false;

    const gl = mosh.renderer;
    this.prevXrEnabled = gl.xr.enabled;
    try {
      const enabledFeatures = (session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures;
      gl.xr.setReferenceSpaceType(enabledFeatures?.includes("local-floor") ? "local-floor" : "local");
      gl.xr.enabled = true;
      await gl.xr.setSession(session);

      this.buildScene();
      this.active = true;
      this.emit();

      session.addEventListener("end", () => this.cleanup(), { once: true });
      gl.setAnimationLoop(() => this.frame());
    } catch (error) {
      try { await session.end(); } catch { /* session never fully started */ }
      this.cleanup();
      throw error;
    }
  }

  async exit(): Promise<void> {
    const session = this.session;
    if (!session) {
      this.cleanup();
      return;
    }
    try {
      await session.end();
      this.cleanup();
    } catch {
      this.cleanup();
    }
  }

  private buildScene(): void {
    const mosh = this.mosh!;
    const outputSize = resolveXrTextureSize(
      navigator.hardwareConcurrency || 4,
      mosh.renderer.capabilities.maxTextureSize,
    );
    this.output = new THREE.WebGLRenderTarget(outputSize.width, outputSize.height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    mosh.setXrTarget(this.output);

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({
        map: this.output.texture,
        side: THREE.BackSide,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    this.dome.frustumCulled = false;
    this.scene.add(this.dome);
    this.buildHotTriggerMenu();

    const canvas = document.createElement("canvas");
    canvas.width = 840;
    canvas.height = 210;
    this.toggleTexture = new THREE.CanvasTexture(canvas);
    this.toggleTexture.colorSpace = THREE.SRGBColorSpace;
    this.toggle = new THREE.Mesh(
      new THREE.PlaneGeometry(TOGGLE_W, TOGGLE_H),
      new THREE.MeshBasicMaterial({ map: this.toggleTexture, transparent: true, toneMapped: false, depthTest: false }),
    );
    this.toggle.renderOrder = 1000;
    this.toggle.frustumCulled = false;
    this.scene.add(this.toggle);
    this.paintToggle();

    const gl = mosh.renderer;
    for (let i = 0; i < 2; i++) {
      const controller = gl.xr.getController(i);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const material = new THREE.LineBasicMaterial({ color: 0xff3ca6, transparent: true, opacity: 0.72 });
      const ray = new THREE.Line(geometry, material);
      ray.scale.z = 3;
      controller.add(ray);
      const onSelect = () => this.onSelectStart(controller);
      const onSelectEnd = () => this.onSelectEnd(controller);
      const onSqueeze = () => useStore.getState().rerollSeed();
      const events = controller as unknown as XrControllerEvents;
      events.addEventListener("selectstart", onSelect);
      events.addEventListener("selectend", onSelectEnd);
      events.addEventListener("squeezestart", onSqueeze);
      this.scene.add(controller);
      this.controllers.push(controller);
      this.controllerDisposables.push({ controller, events, ray, geometry, material, onSelect, onSelectEnd, onSqueeze });
    }

    // Gaze-select devices do not necessarily populate getController().
    this.session?.addEventListener("select", (event: XRInputSourceEvent) => {
      // A gaze ray is always centered while the head-locked toggle sits below
      // center, so a gaze-only tap is treated directly as the mode switch.
      if (event.inputSource.targetRayMode === "gaze") void this.exit();
    });
  }

  private buildHotTriggerMenu(): void {
    this.menu.visible = false;
    this.menu.renderOrder = 900;
    const triggers = getXrHotTriggers();
    const outerCount = Math.min(14, triggers.length);
    for (let index = 0; index < triggers.length; index++) {
      const trigger = triggers[index];
      const inner = index >= outerCount;
      const ringIndex = inner ? index - outerCount : index;
      const ringCount = inner ? triggers.length - outerCount : outerCount;
      const angle = (ringIndex / Math.max(1, ringCount)) * Math.PI * 2 - Math.PI / 2;
      const radius = inner ? 0.38 : 0.64;
      const texture = this.makeMenuTexture(trigger.label, false);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(MENU_ITEM_SIZE, MENU_ITEM_SIZE),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false }),
      );
      mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      mesh.renderOrder = 910;
      mesh.userData.xrHotTriggerId = trigger.id;
      this.menu.add(mesh);
      this.menuItems.push({ trigger, mesh, texture });
    }
    this.scene.add(this.menu);
  }

  private makeMenuTexture(label: string, highlighted: boolean): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.fillStyle = highlighted ? "rgba(255,60,166,0.98)" : "rgba(5,5,10,0.88)";
    ctx.fill();
    ctx.lineWidth = highlighted ? 12 : 7;
    ctx.strokeStyle = highlighted ? "#ffffff" : "rgba(255,60,166,0.92)";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 23px ui-monospace, monospace";
    const words = label.toUpperCase().split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > 13 && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    lines.slice(0, 3).forEach((value, i, visible) => ctx.fillText(value, 128, 128 + (i - (visible.length - 1) / 2) * 28));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private paintToggle(): void {
    const canvas = this.toggleTexture?.image as HTMLCanvasElement | undefined;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.roundRect(5, 5, canvas.width - 10, canvas.height - 10, 54);
    ctx.fillStyle = this.toggleHovered ? "rgba(255,60,166,0.96)" : "rgba(5,5,10,0.82)";
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = this.toggleHovered ? "#ffffff" : "rgba(255,60,166,0.95)";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 52px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("WINDOW MODE  ↔", canvas.width / 2, canvas.height / 2);
    this.toggleTexture!.needsUpdate = true;
  }

  private pointsAtToggle(source: THREE.Object3D | null): boolean {
    if (!this.toggle || !this.mosh) return false;
    if (source) {
      const rotation = new THREE.Matrix4().extractRotation(source.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    } else {
      const camera = this.mosh.renderer.xr.getCamera();
      const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    }
    return this.raycaster.intersectObject(this.toggle, false).length > 0;
  }

  private onSelectStart(source: THREE.Object3D): void {
    if (this.pointsAtToggle(source)) {
      void this.exit();
      return;
    }
    this.selectStartedWithMenu = this.menuVisible;
    this.menuSource = source;
    if (!this.menuVisible) this.showMenu();
  }

  private onSelectEnd(source: THREE.Object3D): void {
    if (!this.menuVisible) return;
    this.updateMenuHighlight(source);
    const selection = this.highlightedMenuItem;
    if (selection) {
      activateXrHotTrigger(selection.trigger.id);
      this.hideMenu();
      return;
    }
    // Releasing the gesture that opened the wheel leaves it available. Once it
    // is already persistent, a tap outside dismisses it.
    if (this.selectStartedWithMenu) {
      this.hideMenu();
      return;
    }
    this.menuSource = source;
  }

  private showMenu(): void {
    if (!this.mosh) return;
    const camera = this.mosh.renderer.xr.getCamera();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    camera.getWorldPosition(position);
    camera.getWorldQuaternion(quaternion);
    this.menu.position.copy(position).add(new THREE.Vector3(0, 0, -1.45).applyQuaternion(quaternion));
    this.menu.quaternion.copy(quaternion);
    this.menu.visible = true;
    this.menuVisible = true;
  }

  private hideMenu(): void {
    this.setHighlightedMenuItem(null);
    this.menu.visible = false;
    this.menuVisible = false;
    this.menuSource = null;
    this.selectStartedWithMenu = false;
  }

  private setHighlightedMenuItem(next: XrMenuItem | null): void {
    if (next === this.highlightedMenuItem) return;
    if (this.highlightedMenuItem) this.repaintMenuItem(this.highlightedMenuItem, false);
    this.highlightedMenuItem = next;
    if (next) this.repaintMenuItem(next, true);
  }

  private repaintMenuItem(item: XrMenuItem, highlighted: boolean): void {
    const next = this.makeMenuTexture(item.trigger.label, highlighted);
    (item.mesh.material as THREE.MeshBasicMaterial).map = next;
    item.texture.dispose();
    item.texture = next;
  }

  private updateMenuHighlight(source: THREE.Object3D | null): void {
    if (!this.menuVisible || !source) { this.setHighlightedMenuItem(null); return; }
    const rotation = new THREE.Matrix4().extractRotation(source.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
    const hit = this.raycaster.intersectObjects(this.menuItems.map(item => item.mesh), false)[0];
    this.setHighlightedMenuItem(hit ? this.menuItems.find(item => item.mesh === hit.object) ?? null : null);
  }

  private updateThumbstickSwitch(): void {
    for (const input of this.session?.inputSources ?? []) {
      const gamepad = (input as XRInputSource & { gamepad?: Gamepad }).gamepad;
      if (!gamepad) continue;
      if (this.flickLatched.has(input)) {
        if (isThumbstickCentered(gamepad.axes)) this.flickLatched.delete(input);
        continue;
      }
      if (hasHorizontalThumbstickFlick(gamepad.axes)) {
        this.flickLatched.add(input);
        void this.exit();
        return;
      }
    }
  }

  private frame(): void {
    if (!this.active || !this.mosh) return;
    const gl = this.mosh.renderer;

    // MOSH's post-processing passes use an orthographic camera. Keep WebXR
    // substitution disabled for those offscreen passes, then re-enable it only
    // for the final headset scene. This is the critical separation the old
    // implementation lacked.
    runFlatRenderPass(gl.xr, () => this.renderFrame?.());

    const camera = gl.xr.getCamera();
    const cameraPosition = new THREE.Vector3();
    const cameraQuaternion = new THREE.Quaternion();
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(cameraQuaternion);

    this.dome?.position.copy(cameraPosition);
    if (this.toggle) {
      const localOffset = new THREE.Vector3(0, -0.26, -0.82).applyQuaternion(cameraQuaternion);
      this.toggle.position.copy(cameraPosition).add(localOffset);
      this.toggle.quaternion.copy(cameraQuaternion);
    }

    const hovered = this.controllers.some((controller) => this.pointsAtToggle(controller));
    if (hovered !== this.toggleHovered) {
      this.toggleHovered = hovered;
      this.paintToggle();
    }
    if (this.menuVisible) this.updateMenuHighlight(this.menuSource);
    this.updateThumbstickSwitch();

    gl.setRenderTarget(null);
    gl.render(this.scene, camera);
  }

  private cleanup(): void {
    if (!this.active && !this.mosh && !this.session) return;
    if (this.cleaning) return;
    this.cleaning = true;
    const mosh = this.mosh;
    if (mosh) {
      const gl = mosh.renderer;
      gl.setAnimationLoop(null);
      mosh.setXrTarget(null);
      gl.xr.enabled = this.prevXrEnabled;
    }

    for (const controller of this.controllers) this.scene.remove(controller);
    for (const item of this.controllerDisposables) {
      item.events.removeEventListener("selectstart", item.onSelect);
      item.events.removeEventListener("selectend", item.onSelectEnd);
      item.events.removeEventListener("squeezestart", item.onSqueeze);
      item.controller.remove(item.ray);
      item.geometry.dispose();
      item.material.dispose();
    }
    this.controllers = [];
    this.controllerDisposables = [];

    this.scene.remove(this.menu);
    for (const item of this.menuItems) {
      item.mesh.geometry.dispose();
      (item.mesh.material as THREE.Material).dispose();
      item.texture.dispose();
      this.menu.remove(item.mesh);
    }
    this.menuItems = [];
    this.hideMenu();

    disposeMesh(this.scene, this.dome);
    disposeMesh(this.scene, this.toggle);
    this.dome = null;
    this.toggle = null;
    this.toggleTexture?.dispose();
    this.toggleTexture = null;
    this.output?.dispose();
    this.output = null;
    this.session = null;
    this.mosh = null;
    this.renderFrame = null;
    this.toggleHovered = false;
    this.active = false;
    this.emit();
    this.cleaning = false;
  }
}

function disposeMesh(scene: THREE.Scene, mesh: THREE.Mesh | null): void {
  if (!mesh) return;
  mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) material.dispose();
  scene.remove(mesh);
}

export const vrMode = new VrMode();
