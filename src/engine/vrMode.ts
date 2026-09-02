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
import { hasHorizontalThumbstickFlick, isQuestAvatarCamera, isThumbstickCentered, resolveXrTextureSize, runFlatRenderPass, sessionModeForExperience, type XrExperienceMode } from "./xrCapabilities";
import { activateXrHotTrigger, getXrHotTriggers, type XrHotTrigger } from "./xrHotTriggers";

export const XR_DOME_RADIUS = 24;
export const XR_CAMERA_FAR = XR_DOME_RADIUS * 2;
const TOGGLE_W = 0.42;
const TOGGLE_H = 0.105;
const MENU_ITEM_SIZE = 0.13;

type XrControllerEvents = {
  addEventListener: (type: "selectstart" | "selectend" | "squeezestart" | "connected" | "disconnected", listener: () => void) => void;
  removeEventListener: (type: "selectstart" | "selectend" | "squeezestart" | "connected" | "disconnected", listener: () => void) => void;
};

type XrMenuItem = { trigger: XrHotTrigger; mesh: THREE.Mesh; texture: THREE.CanvasTexture; canvas: HTMLCanvasElement };

export class VrMode {
  active = false;
  private session: XRSession | null = null;
  private mosh: MoshRenderer | null = null;
  private renderFrame: (() => void) | null = null;
  private experienceMode: XrExperienceMode = "visualizer";
  private scene = new THREE.Scene();
  /** Dedicated perspective camera supplies a valid XR near/far range. The
   * renderer's orthographic post-processing camera is intentionally 0..1 and
   * clipped the old 24m dome completely out of both headset eyes. */
  private xrBaseCamera = new THREE.PerspectiveCamera(70, 1, 0.03, XR_CAMERA_FAR);
  private output: THREE.WebGLRenderTarget | null = null;
  private dome: THREE.Mesh | null = null;
  private toggle: THREE.Mesh | null = null;
  private toggleTexture: THREE.CanvasTexture | null = null;
  private menu = new THREE.Group();
  private menuItems: XrMenuItem[] = [];
  private menuMeshes: THREE.Mesh[] = [];
  private menuVisible = false;
  private menuSource: THREE.Object3D | null = null;
  private selectStartedWithMenu = false;
  private highlightedMenuItem: XrMenuItem | null = null;
  private controllers: THREE.Group[] = [];
  private controllerDisposables: Array<{
    controller: THREE.Group;
    events: XrControllerEvents;
    cursor: THREE.Sprite;
    cursorMaterial: THREE.SpriteMaterial;
    cursorTexture: THREE.CanvasTexture;
    ripple: THREE.Sprite;
    rippleMaterial: THREE.SpriteMaterial;
    rippleTexture: THREE.CanvasTexture;
    rippleStartedAt: number;
    onSelect: () => void;
    onSelectEnd: () => void;
    onSqueeze: () => void;
    onConnected: () => void;
    onDisconnected: () => void;
  }> = [];
  private raycaster = new THREE.Raycaster();
  private rayRotation = new THREE.Matrix4();
  private rayOrigin = new THREE.Vector3();
  private rayDirection = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private cameraQuaternion = new THREE.Quaternion();
  private toggleHovered = false;
  private prevXrEnabled = false;
  private cleaning = false;
  private flickLatched = new WeakSet<object>();
  private listeners = new Set<(active: boolean) => void>();

  get mode(): XrExperienceMode { return this.experienceMode; }

  onChange(fn: (active: boolean) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.active);
  }

  async isSupported(mode: XrExperienceMode = "visualizer"): Promise<boolean> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr?.isSessionSupported) return false;
    try {
      return await xr.isSessionSupported(sessionModeForExperience(mode));
    } catch {
      return false;
    }
  }

  async enter(mosh: MoshRenderer, renderFrame: () => void, mode: XrExperienceMode = "visualizer"): Promise<void> {
    if (this.active) return;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) throw new Error("WebXR is unavailable in this browser");

    if (mode === "room") {
      const state = useStore.getState();
      const tracks = state.videoStream?.getVideoTracks() ?? [];
      if (state.cameraFacing === "user" || tracks.some(track => isQuestAvatarCamera(track.label))) {
        state.clearVideoSource();
      }
    }

    const session = await xr.requestSession(sessionModeForExperience(mode), {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    });

    this.mosh = mosh;
    this.renderFrame = renderFrame;
    this.experienceMode = mode;
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

    const domeMaterial = new THREE.MeshBasicMaterial({
      map: this.output.texture,
      side: THREE.BackSide,
      toneMapped: false,
      depthWrite: false,
      transparent: this.experienceMode === "room",
      opacity: this.experienceMode === "room" ? 0.42 : 1,
      blending: this.experienceMode === "room" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(XR_DOME_RADIUS, 48, 32),
      domeMaterial,
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
      const cursorTexture = this.makeCursorTexture(false);
      const cursorMaterial = new THREE.SpriteMaterial({ map: cursorTexture, transparent: true, depthTest: false, toneMapped: false });
      const cursor = new THREE.Sprite(cursorMaterial);
      cursor.scale.setScalar(0.028);
      cursor.renderOrder = 1100;
      cursor.visible = false;
      const rippleTexture = this.makeCursorTexture(true);
      const rippleMaterial = new THREE.SpriteMaterial({ map: rippleTexture, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
      const ripple = new THREE.Sprite(rippleMaterial);
      ripple.scale.setScalar(0.03);
      ripple.renderOrder = 1090;
      ripple.visible = false;
      this.scene.add(cursor, ripple);
      const onSelect = () => this.onSelectStart(controller);
      const onSelectEnd = () => this.onSelectEnd(controller);
      const onSqueeze = () => useStore.getState().rerollSeed();
      const onConnected = () => { cursor.visible = true; ripple.visible = true; };
      const onDisconnected = () => { cursor.visible = false; ripple.visible = false; };
      const events = controller as unknown as XrControllerEvents;
      events.addEventListener("selectstart", onSelect);
      events.addEventListener("selectend", onSelectEnd);
      events.addEventListener("squeezestart", onSqueeze);
      events.addEventListener("connected", onConnected);
      events.addEventListener("disconnected", onDisconnected);
      this.scene.add(controller);
      this.controllers.push(controller);
      this.controllerDisposables.push({ controller, events, cursor, cursorMaterial, cursorTexture, ripple, rippleMaterial, rippleTexture, rippleStartedAt: -1, onSelect, onSelectEnd, onSqueeze, onConnected, onDisconnected });
    }

    // Gaze-select devices do not necessarily populate getController(). Reuse
    // the same open/select/dismiss state machine instead of treating gaze as
    // an unconditional emergency exit.
    this.session?.addEventListener("select", (event: XRInputSourceEvent) => {
      if (event.inputSource.targetRayMode !== "gaze") return;
      if (this.menuVisible) this.onSelectEnd(null);
      else this.onSelectStart(null);
    });
  }

  private makeCursorTexture(ripple: boolean): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(64, 64, ripple ? 48 : 24, 0, Math.PI * 2);
    ctx.lineWidth = ripple ? 5 : 8;
    ctx.strokeStyle = ripple ? "rgba(255,255,255,0.92)" : "rgba(255,60,166,0.96)";
    ctx.stroke();
    if (!ripple) {
      ctx.beginPath();
      ctx.arc(64, 64, 5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
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
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(MENU_ITEM_SIZE, MENU_ITEM_SIZE),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthTest: false }),
      );
      mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      mesh.renderOrder = 910;
      mesh.userData.xrHotTriggerId = trigger.id;
      this.menu.add(mesh);
      this.menuMeshes.push(mesh);
      const item = { trigger, mesh, texture, canvas };
      this.paintMenuTexture(item, false);
      this.menuItems.push(item);
    }
    this.scene.add(this.menu);
  }

  private paintMenuTexture(item: XrMenuItem, highlighted: boolean): void {
    const { canvas, texture } = item;
    const label = item.trigger.label;
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
    texture.needsUpdate = true;
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
      this.rayRotation.extractRotation(source.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(source.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.rayRotation);
    } else {
      const camera = this.mosh.renderer.xr.getCamera();
      this.rayRotation.extractRotation(camera.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(camera.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.rayRotation);
    }
    return this.raycaster.intersectObject(this.toggle, false).length > 0;
  }

  private onSelectStart(source: THREE.Object3D | null): void {
    const disposable = this.controllerDisposables.find(item => item.controller === source);
    if (disposable) disposable.rippleStartedAt = performance.now();
    if (this.pointsAtToggle(source)) {
      void this.exit();
      return;
    }
    this.selectStartedWithMenu = this.menuVisible;
    this.menuSource = source;
    if (!this.menuVisible) this.showMenu();
  }

  private onSelectEnd(source: THREE.Object3D | null): void {
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
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldQuaternion(this.cameraQuaternion);
    this.rayDirection.set(0, 0, -1.45).applyQuaternion(this.cameraQuaternion);
    this.menu.position.copy(this.cameraPosition).add(this.rayDirection);
    this.menu.quaternion.copy(this.cameraQuaternion);
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
    this.paintMenuTexture(item, highlighted);
  }

  private updateMenuHighlight(source: THREE.Object3D | null): void {
    if (!this.menuVisible || !this.mosh) { this.setHighlightedMenuItem(null); return; }
    const raySource = source ?? this.mosh.renderer.xr.getCamera();
    this.rayRotation.extractRotation(raySource.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(raySource.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.rayRotation);
    const hit = this.raycaster.intersectObjects(this.menuMeshes, false)[0];
    this.setHighlightedMenuItem(hit ? this.menuItems.find(item => item.mesh === hit.object) ?? null : null);
  }

  private updateControllerCursors(now: number): void {
    const interactive = [this.toggle, ...(this.menuVisible ? this.menuMeshes : [])]
      .filter((item): item is THREE.Mesh => item !== null);
    for (const item of this.controllerDisposables) {
      this.rayRotation.extractRotation(item.controller.matrixWorld);
      this.rayOrigin.setFromMatrixPosition(item.controller.matrixWorld);
      this.rayDirection.set(0, 0, -1).applyMatrix4(this.rayRotation).normalize();
      this.raycaster.ray.origin.copy(this.rayOrigin);
      this.raycaster.ray.direction.copy(this.rayDirection);
      const hit = interactive.length ? this.raycaster.intersectObjects(interactive, false)[0] : null;
      item.cursor.position.copy(hit?.point ?? this.rayDirection.multiplyScalar(1.2).add(this.rayOrigin));
      item.ripple.position.copy(item.cursor.position);
      const elapsed = item.rippleStartedAt < 0 ? Infinity : now - item.rippleStartedAt;
      if (elapsed < 320) {
        const progress = elapsed / 320;
        item.rippleMaterial.opacity = 1 - progress;
        item.ripple.scale.setScalar(0.03 + progress * 0.12);
      } else {
        item.rippleMaterial.opacity = 0;
      }
    }
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
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldQuaternion(this.cameraQuaternion);

    this.dome?.position.copy(this.cameraPosition);
    if (this.toggle) {
      this.rayDirection.set(0, -0.26, -0.82).applyQuaternion(this.cameraQuaternion);
      this.toggle.position.copy(this.cameraPosition).add(this.rayDirection);
      this.toggle.quaternion.copy(this.cameraQuaternion);
    }

    const hovered = this.controllers.some((controller) => this.pointsAtToggle(controller));
    if (hovered !== this.toggleHovered) {
      this.toggleHovered = hovered;
      this.paintToggle();
    }
    if (this.menuVisible) this.updateMenuHighlight(this.menuSource);
    this.updateControllerCursors(performance.now());
    this.updateThumbstickSwitch();

    gl.setRenderTarget(null);
    gl.render(this.scene, this.xrBaseCamera);
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
      item.events.removeEventListener("connected", item.onConnected);
      item.events.removeEventListener("disconnected", item.onDisconnected);
      this.scene.remove(item.cursor, item.ripple);
      item.cursorMaterial.dispose();
      item.cursorTexture.dispose();
      item.rippleMaterial.dispose();
      item.rippleTexture.dispose();
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
    this.menuMeshes = [];
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
    this.experienceMode = "visualizer";
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
