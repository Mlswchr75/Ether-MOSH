/**
 * A listener's own music, kept across sessions.
 *
 * Picking a file and playing it needs none of this — that path makes an object
 * URL and the bytes never leave the machine (see AddYourOwn). What it cannot do
 * is survive the tab: an object URL dies with the document that made it. So
 * this is the other half, and it is a supporter perk, which is why it is a
 * separate module rather than more branches inside the picker.
 *
 * The server is the authority on both rules — `radio_user_tracks_guard` refuses
 * a non-supporter and refuses the hundred-and-first song, and storage RLS
 * refuses a path outside the uploader's own folder. Everything here is the
 * client agreeing with those rules early enough to say something useful.
 */

import { supabase } from "@/integrations/supabase/client";
import type { ShowcaseTrack } from "@/engine/trackPlayer";
import { validateAudioUpload } from "@/lib/mediaFileSafety";

export const UPLOADS_BUCKET = "radio-uploads";
/** Mirrors the cap in radio_user_tracks_guard. */
export const MAX_SAVED_UPLOADS = 100;
/** Mirrors the bucket's file_size_limit (50 MB), which is stricter than the
 *  app's general 250 MB audio ceiling — a rejected upload after a long wait is
 *  a worse answer than a refusal before it starts. */
export const MAX_SAVED_UPLOAD_BYTES = 50 * 1024 * 1024;
/** How long a playback URL stays good. Long enough for a set, short enough
 *  that a copied link is not a permanent public one. */
const SIGNED_URL_TTL_S = 60 * 60 * 8;

export type SavedUpload = {
  id: string;
  title: string;
  storagePath: string;
  bytes: number | null;
};

/** A saved upload as the station plays it — id prefixed so it can never
 *  collide with a catalogue id in a queue, a favourite or a share link. */
export function savedUploadTrack(row: SavedUpload, url: string): ShowcaseTrack {
  return { id: `saved-${row.id}`, url, title: row.title, artist: "Your upload" };
}

function extension(name: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return match ? match[1].toLowerCase() : "mp3";
}

/**
 * Why the file cannot be saved, or null.
 *
 * Deliberately the app's own `validateAudioUpload` rather than a MIME check:
 * a browser hands over an empty `File.type` often enough (an unusual container,
 * a file that arrived over a share sheet, some Android pickers) that filtering
 * on `type.startsWith("audio/")` silently drops files that play perfectly, and
 * it accepts a zero-byte file that does not.
 */
export function uploadIssue(file: File): string | null {
  const issue = validateAudioUpload(file);
  if (issue) return issue;
  if (file.size > MAX_SAVED_UPLOAD_BYTES) return "Songs saved to your account have to be under 50 MB.";
  return null;
}

export async function listSavedUploads(userId: string): Promise<SavedUpload[]> {
  const { data, error } = await supabase
    .from("radio_user_tracks")
    .select("id, title, storage_path, bytes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id, title: row.title, storagePath: row.storage_path, bytes: row.bytes,
  }));
}

/** A playable URL for a saved upload. Signed, because the bucket is private. */
export async function savedUploadUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(UPLOADS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_S);
  if (error || !data?.signedUrl) throw error ?? new Error("no signed url");
  return data.signedUrl;
}

/** Turn the guard's named errors into something a listener can act on. */
function readableError(err: unknown): string {
  const message = (err as { message?: string })?.message ?? "";
  if (message.includes("radio_uploads_supporter_only")) return "Keeping songs on your account is a supporter feature.";
  if (message.includes("radio_uploads_limit_reached")) return `You can keep up to ${MAX_SAVED_UPLOADS} songs.`;
  return "Couldn’t save that song. Please try again.";
}

export async function saveUpload(userId: string, file: File): Promise<SavedUpload> {
  const issue = uploadIssue(file);
  if (issue) throw new Error(issue);
  // The first path segment is the uploader's id — that is the whole of what
  // makes one listener's music invisible to every other one (see the storage
  // policies in 20260909120000_radio_audio_hosting.sql).
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension(file.name)}`;
  const title = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled";

  const upload = await supabase.storage.from(UPLOADS_BUCKET).upload(storagePath, file, {
    contentType: file.type || "audio/mpeg",
    upsert: false,
  });
  if (upload.error) throw new Error(readableError(upload.error));

  const { data, error } = await supabase
    .from("radio_user_tracks")
    .insert({ user_id: userId, storage_path: storagePath, title, bytes: file.size })
    .select("id, title, storage_path, bytes")
    .single();
  if (error || !data) {
    // The row is what makes the object findable; an object with no row is
    // invisible storage the listener is nonetheless charged against. Clean up.
    await supabase.storage.from(UPLOADS_BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(readableError(error));
  }
  return { id: data.id, title: data.title, storagePath: data.storage_path, bytes: data.bytes };
}

export async function deleteSavedUpload(userId: string, upload: SavedUpload): Promise<void> {
  const { error } = await supabase
    .from("radio_user_tracks").delete().eq("user_id", userId).eq("id", upload.id);
  if (error) throw error;
  // Best effort: the row is gone either way, and an orphaned object is
  // invisible rather than dangerous.
  await supabase.storage.from(UPLOADS_BUCKET).remove([upload.storagePath]).catch(() => {});
}
