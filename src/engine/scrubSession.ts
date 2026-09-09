/**
 * The handshake between the render loop and the scrub UI.
 *
 * The capture has to live inside GlCanvas — it needs the resolved layers, the
 * virtual clock and the source element, none of which exist anywhere else. The
 * timeline UI lives in the editor chrome, which is a sibling, not a child. The
 * rest of this codebase solves that with `window.__aegis*` globals; this does
 * the same job with a typed module singleton instead, so the compiler still
 * checks both ends and a rename can't silently disconnect them.
 */

import type { ScrubCapture, ScrubTakeFrame } from "./scrubCapture";

export type ScrubHost = {
  capture: ScrubCapture;
  /**
   * Paint one frame of a take onto the live canvas, or hand the canvas back to
   * live rendering when passed null.
   */
  preview(frame: ScrubTakeFrame | null): void;
  /**
   * What the live finisher was doing, so a print export can match it rather
   * than producing a differently-graded image from the one that was chosen.
   */
  context(): { mirror: boolean; tileable: boolean; hdr: number };
};

let host: ScrubHost | null = null;

export const scrubSession = {
  register(next: ScrubHost) { host = next; },
  /** Only clears if `prev` is still the active host — a remount registers the
   *  new one before the old one's cleanup runs, and an unguarded unregister
   *  would then tear down the live session. */
  unregister(prev: ScrubHost) { if (host === prev) host = null; },
  get(): ScrubHost | null { return host; },
};
