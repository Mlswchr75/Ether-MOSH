/**
 * Deliverable specs — the shapes real platforms actually accept.
 *
 * The job these serve is not "export a video", it is "hand something to
 * Spotify/TikTok that will not be rejected". Those are different jobs: the
 * second one is a rigid spec with hard edges, and getting it wrong costs a
 * round trip through an upload form that only says "invalid".
 *
 * Encoding the specs here rather than in the export UI keeps them testable and
 * keeps the failure honest — `validate` tells the caller exactly which rule a
 * capture broke, so the app can warn before the user finds out from a rejection.
 */

export type Deliverable = {
  id: string;
  name: string;
  blurb: string;
  width: number;
  height: number;
  fps: number;
  /** Seconds. Captures are clamped into this window. */
  minSec: number;
  maxSec: number;
  /** What we aim for when the user does not choose. */
  defaultSec: number;
  /** The first frame must match the last, or the loop visibly jumps. */
  seamless: boolean;
  /**
   * Whether the platform wants an audio track. All of ours are false, and that
   * is a feature: a video with no audio track cannot raise a sync-licensing
   * question, so exporting silent keeps MOSH out of the music-rights chain
   * entirely.
   */
  audio: boolean;
  /** MIME types the platform accepts, best first. */
  accepts: string[];
  /** Human-readable rules, for the UI to show before the user commits. */
  notes: string[];
};

export const DELIVERABLES: Deliverable[] = [
  {
    id: "spotifyCanvas",
    name: "Spotify Canvas",
    blurb: "Looping vertical visual behind a track.",
    width: 720, height: 1280, fps: 30,
    minSec: 3, maxSec: 8, defaultSec: 6,
    seamless: true,
    audio: false,
    // Spotify is the strictest of these and wants MP4; a WebM will be refused
    // at upload, so the exporter has to say so rather than hand over a file
    // that looks fine locally.
    accepts: ["video/mp4"],
    notes: [
      "9:16 vertical, 720x1280 or larger",
      "3-8 seconds, seamless loop",
      "No audio track",
      "MP4 (H.264)",
    ],
  },
  {
    id: "tiktok",
    name: "TikTok / Reels / Shorts",
    blurb: "Full-screen vertical video.",
    width: 1080, height: 1920, fps: 30,
    minSec: 3, maxSec: 60, defaultSec: 15,
    seamless: false,
    audio: false,
    accepts: ["video/mp4", "video/webm"],
    notes: ["9:16 vertical, 1080x1920", "Add your own audio in-app"],
  },
  {
    id: "square",
    name: "Square post",
    blurb: "Feed post for Instagram or X.",
    width: 1080, height: 1080, fps: 30,
    minSec: 3, maxSec: 60, defaultSec: 10,
    seamless: false,
    audio: false,
    accepts: ["video/mp4", "video/webm"],
    notes: ["1:1 square, 1080x1080"],
  },
  {
    id: "loop16x9",
    name: "Widescreen loop",
    blurb: "Projection, stream backdrop, VJ clip.",
    width: 1920, height: 1080, fps: 30,
    minSec: 4, maxSec: 30, defaultSec: 12,
    seamless: true,
    audio: false,
    accepts: ["video/mp4", "video/webm"],
    notes: ["16:9, 1920x1080", "Seamless loop for continuous playback"],
  },
];

export const DELIVERABLES_BY_ID: Record<string, Deliverable> =
  Object.fromEntries(DELIVERABLES.map(d => [d.id, d]));

/** Clamp a requested duration into what the platform will accept. */
export function clampDuration(spec: Deliverable, seconds: number): number {
  if (!Number.isFinite(seconds)) return spec.defaultSec;
  return Math.min(spec.maxSec, Math.max(spec.minSec, seconds));
}

export type ValidationIssue = {
  rule: "duration" | "format" | "dimensions" | "empty";
  message: string;
  /** Fatal issues will be rejected by the platform; warnings may pass. */
  fatal: boolean;
};

/**
 * Check a finished capture against the spec.
 *
 * Deliberately runs after capture rather than only before: what MediaRecorder
 * actually produced is not always what was asked for. Browsers substitute
 * codecs silently, and the resulting file is only discovered to be wrong at
 * the upload form.
 */
export function validate(
  spec: Deliverable,
  capture: { mimeType: string; seconds: number; width: number; height: number; bytes: number },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!capture.bytes) {
    issues.push({ rule: "empty", message: "Capture produced no data", fatal: true });
    return issues;
  }

  // Compare the base type: MediaRecorder returns things like
  // "video/mp4;codecs=avc1.42E01E" and the codec suffix is not the question here.
  const base = capture.mimeType.split(";")[0].trim().toLowerCase();
  if (!spec.accepts.includes(base)) {
    issues.push({
      rule: "format",
      message: `${spec.name} needs ${spec.accepts.join(" or ")} — this browser recorded ${base}. Convert before uploading.`,
      fatal: true,
    });
  }

  // Half a second of slack: MediaRecorder stops on a frame boundary, not on
  // the exact millisecond it was asked to.
  if (capture.seconds < spec.minSec - 0.5) {
    issues.push({
      rule: "duration",
      message: `Too short — ${spec.name} needs at least ${spec.minSec}s`,
      fatal: true,
    });
  }
  if (capture.seconds > spec.maxSec + 0.5) {
    issues.push({
      rule: "duration",
      message: `Too long — ${spec.name} allows at most ${spec.maxSec}s`,
      fatal: true,
    });
  }

  if (capture.width && capture.height) {
    const want = spec.width / spec.height;
    const got = capture.width / capture.height;
    if (Math.abs(want - got) > 0.02) {
      issues.push({
        rule: "dimensions",
        message: `Aspect is ${got.toFixed(2)}:1, ${spec.name} expects ${want.toFixed(2)}:1`,
        fatal: false,
      });
    }
  }

  return issues;
}

/** True when nothing fatal would stop the platform accepting this. */
export const isDeliverable = (issues: ValidationIssue[]) => !issues.some(i => i.fatal);

export function deliverableFilename(spec: Deliverable, mimeType: string): string {
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `mosh-${spec.id}-${stamp}.${ext}`;
}
