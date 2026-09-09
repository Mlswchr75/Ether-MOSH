/**
 * Put songs on the air without shipping a build.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/publish-radio-catalogue.ts
 *   ... npx tsx scripts/publish-radio-catalogue.ts --apply
 *   ... npx tsx scripts/publish-radio-catalogue.ts --apply --dir ~/Music/mosh --tag flow
 *
 * The station used to play a compile-time array pointing at public/audio: 33
 * files, ~106 MB, in the repo forever and re-uploaded on every deploy, and a
 * new song cost a commit and a release. This uploads to the `radio-catalogue`
 * bucket and upserts `radio_tracks` instead, so a new song costs neither.
 *
 * Dry by default — it prints what it would do and changes nothing until
 * `--apply`. Re-running is safe: objects upsert and rows upsert on id, so a
 * half-finished run is fixed by running it again.
 *
 * The service-role key bypasses RLS, which is exactly why the app never sees
 * it. It goes in your shell for the length of this command and nowhere else:
 * never in .env, never behind VITE_ (Vite bakes those into the browser
 * bundle), never in the repo. Get it from Supabase → Project Settings → API.
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUCKET = "radio-catalogue";
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".webm"]);
const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg", ".m4a": "audio/x-m4a", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".flac": "audio/flac", ".webm": "audio/webm",
};
/** The bucket's own file_size_limit. Refuse here rather than after the upload. */
const MAX_BYTES = 50 * 1024 * 1024;

/** "The Puppeteer's Soliloquy (Take 1).mp3" -> "puppeteers-soliloquy".
 *  Same rules as scripts/sync-audio-library.ts, so ids stay stable across the
 *  move — a share link or a favourite made before it still resolves. */
function slugFor(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/\((take|cover|reimagined)[^)]*\)/gi, "")
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFor(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/\s*\((take|cover)\s*\d*\)\s*/gi, "").trim();
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell first.");
    console.error("Project Settings → API → service_role. Do not put it in .env or anywhere with a VITE_ prefix.");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  const dir = resolve(arg("dir") ?? join(ROOT, "public", "audio"));
  const tag = arg("tag");

  const files = readdirSync(dir)
    .filter(f => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
    .sort();
  if (!files.length) { console.log(`No audio files in ${dir}.`); return; }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const existing = await supabase.from("radio_tracks").select("id, storage_path");
  if (existing.error) { console.error("Could not read radio_tracks:", existing.error.message); process.exit(1); }
  const known = new Map((existing.data ?? []).map(r => [r.id, r.storage_path]));

  console.log(`${files.length} file(s) in ${dir} · ${known.size} already in radio_tracks`);
  if (!apply) console.log("Dry run — nothing will be uploaded. Add --apply to publish.\n");

  let published = 0;
  let skipped = 0;
  for (const [index, file] of files.entries()) {
    const id = slugFor(file);
    if (!id) { console.log(`  ✗ ${file} — no usable id`); skipped++; continue; }
    const bytes = statSync(join(dir, file)).size;
    if (bytes > MAX_BYTES) {
      console.log(`  ✗ ${file} — ${(bytes / 1048576).toFixed(1)} MB, over the bucket's 50 MB limit`);
      skipped++;
      continue;
    }
    const storagePath = `${id}${extname(file).toLowerCase()}`;
    const verb = known.has(id) ? "update" : "add";
    console.log(`  ${apply ? "→" : "·"} ${verb} ${id}  (${file}, ${(bytes / 1048576).toFixed(1)} MB)`);
    if (!apply) { published++; continue; }

    const upload = await supabase.storage.from(BUCKET).upload(storagePath, readFileSync(join(dir, file)), {
      contentType: MIME[extname(file).toLowerCase()] ?? "audio/mpeg",
      upsert: true,
    });
    if (upload.error) { console.error(`    upload failed: ${upload.error.message}`); skipped++; continue; }

    const row = await supabase.from("radio_tracks").upsert({
      id, storage_path: storagePath, title: titleFor(file), artist: "MOSH",
      ...(tag ? { tags: [tag] } : {}),
      sort: index,
    });
    if (row.error) { console.error(`    row failed: ${row.error.message}`); skipped++; continue; }
    published++;
  }

  console.log(`\n${apply ? "Published" : "Would publish"} ${published} · skipped ${skipped}`);
  if (apply && published) console.log("The station picks these up on the next load of /radio — no deploy needed.");
}

void main();
