import { FaceLandmarker, FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { OverlayTrackedTarget } from "./tracking";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Landmark = { x: number; y: number; z?: number };

function targetFromLandmarks(points: Landmark[], at: number, rotation = 0): OverlayTrackedTarget | null {
  if (!points.length) return null;
  let minX = 1, minY = 1, maxX = 0, maxY = 0, sx = 0, sy = 0;
  for (const point of points) {
    const x = Math.max(0, Math.min(1, point.x));
    const y = Math.max(0, Math.min(1, point.y));
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    sx += x; sy += y;
  }
  const pad = 0.04;
  return {
    x: sx / points.length,
    y: sy / points.length,
    width: Math.min(1, Math.max(0.04, maxX - minX + pad)),
    height: Math.min(1, Math.max(0.04, maxY - minY + pad)),
    rotation,
    confidence: 1,
    at,
  };
}

function angleBetween(a: Landmark | undefined, b: Landmark | undefined): number {
  if (!a || !b) return 0;
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

/**
 * Lazily loaded MediaPipe semantic landmark detectors. Nothing is downloaded
 * until an overlay explicitly asks for Hand or Face tracking.
 */
class SemanticTrackingEngine {
  private visionPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
  private hand: HandLandmarker | null = null;
  private face: FaceLandmarker | null = null;
  private handLoading: Promise<void> | null = null;
  private faceLoading: Promise<void> | null = null;

  private vision() {
    this.visionPromise ??= FilesetResolver.forVisionTasks(WASM);
    return this.visionPromise;
  }

  async loadHands(): Promise<void> {
    if (this.hand || this.handLoading) return this.handLoading ?? Promise.resolve();
    this.handLoading = (async () => {
      try {
        this.hand = await HandLandmarker.createFromOptions(await this.vision(), {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (error) {
        console.warn("[overlay-track] hand landmarker unavailable", error);
      } finally {
        this.handLoading = null;
      }
    })();
    return this.handLoading;
  }

  async loadFaces(): Promise<void> {
    if (this.face || this.faceLoading) return this.faceLoading ?? Promise.resolve();
    this.faceLoading = (async () => {
      try {
        this.face = await FaceLandmarker.createFromOptions(await this.vision(), {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
      } catch (error) {
        console.warn("[overlay-track] face landmarker unavailable", error);
      } finally {
        this.faceLoading = null;
      }
    })();
    return this.faceLoading;
  }

  detectHand(video: HTMLVideoElement, timestampMs: number): OverlayTrackedTarget | null {
    if (!this.hand) return null;
    try {
      const result = this.hand.detectForVideo(video, timestampMs);
      const landmarks = result.landmarks?.[0] as Landmark[] | undefined;
      if (!landmarks?.length) return null;
      // Wrist -> middle MCP approximates the hand's natural orientation.
      const rotation = angleBetween(landmarks[0], landmarks[9]) - 90;
      return targetFromLandmarks(landmarks, timestampMs, rotation);
    } catch {
      return null;
    }
  }

  detectFace(video: HTMLVideoElement, timestampMs: number): OverlayTrackedTarget | null {
    if (!this.face) return null;
    try {
      const result = this.face.detectForVideo(video, timestampMs);
      const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined;
      if (!landmarks?.length) return null;
      // Outer eye corners provide a stable roll angle on the 478-landmark mesh.
      const rotation = angleBetween(landmarks[33], landmarks[263]);
      return targetFromLandmarks(landmarks, timestampMs, rotation);
    } catch {
      return null;
    }
  }

  handsReady() { return !!this.hand; }
  facesReady() { return !!this.face; }
}

export const semanticTrackingEngine = new SemanticTrackingEngine();
