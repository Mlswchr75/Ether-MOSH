/**
 * Audio library check — what is in public/audio versus what MOSH can play.
 *
 *   npx tsx scripts/sync-audio-library.ts          report
 *   npx tsx scripts/sync-audio-library.ts --emit   report + paste-ready rows
 *   npx tsx scripts/sync-audio-library.ts --emit --tag flow
 *
 * Dropping a file into public/audio does NOT put it in the app: SHOWCASE_TRACKS
 * in src/engine/trackPlayer.ts is a compile-time literal on purpose (see
 * assertSafeTrackUrl's doc comment — it is the guarantee that nothing
 * arbitrary ever reaches an element's .src). That is a good property and this
 * script does not weaken it; it just removes the tedium of maintaining the
 * list by hand, which is what makes people stop maintaining it. Ten of the
 * user's own songs sat unreachable in public/audio for months before this.
 *
 * Emitted rows are printed, never written. Paste them into SHOWCASE_TRACKS,
 * then run scripts/analyze-track-cues.py for their drop-in points.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOWCASE_TRACKS } from "../src/engine/trackPlayer";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const AUDIO_DIR = join(ROOT, "public", "audio");

/** "The Puppeteer's Soliloquy (Take 1).mp3" -> "puppeteers-soliloquy" */
function slugFor(filename: string): string {
  return filename
    .replace(/\.mp3$/i, "")
    .replace(/\((take|cover|reimagined)[^)]*\)/gi, "")
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Iron Liturgy (Reimagined).mp3" -> "Iron Liturgy (Reimagined)" */
function titleFor(filename: string): string {
  return filename.replace(/\.mp3$/i, "").replace(/\s*\((take|cover)\s*\d*\)\s*/gi, "").trim();
}

function main() {
  const emit = process.argv.includes("--emit");
  const tagIndex = process.argv.indexOf("--tag");
  const tag = tagIndex > -1 ? process.argv[tagIndex + 1] : undefined;

  const onDisk = readdirSync(AUDIO_DIR).filter(f => f.toLowerCase().endsWith(".mp3")).sort();
  const registered = new Set(SHOWCASE_TRACKS.map(t => decodeURIComponent(t.url.replace("/audio/", ""))));

  const missingFiles = [...registered].filter(f => !onDisk.includes(f));
  const unregistered = onDisk.filter(f => !registered.has(f));

  console.log(`${onDisk.length} files in public/audio · ${SHOWCASE_TRACKS.length} registered tracks`);

  if (missingFiles.length) {
    console.log("\nRegistered but MISSING from disk — these will 404 mid-broadcast:");
    for (const f of missingFiles) console.log(`  ✗ ${f}`);
  }

  if (!unregistered.length) {
    console.log("\nEverything on disk is playable. Nothing to add.");
    return;
  }

  console.log(`\n${unregistered.length} file(s) on disk that MOSH cannot play yet:`);
  for (const f of unregistered) console.log(`  · ${f}`);

  if (!emit) {
    console.log("\nRe-run with --emit (optionally --tag flow) for paste-ready rows.");
    return;
  }

  const tags = tag ? `, tags: ["${tag}"]` : "";
  console.log("\nPaste into SHOWCASE_TRACKS (src/engine/trackPlayer.ts):\n");
  for (const f of unregistered) {
    console.log(`  { id: "${slugFor(f)}", url: "/audio/${f}", title: "${titleFor(f)}", artist: "MOSH"${tags} },`);
  }
  console.log("\nThen: python3 scripts/analyze-track-cues.py " + unregistered.map(slugFor).join(" "));
}

main();
