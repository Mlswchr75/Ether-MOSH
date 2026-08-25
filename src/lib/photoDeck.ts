export const MAX_UPLOAD_IMAGES = 60;
export const MAX_UPLOAD_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_UPLOAD_TOTAL_BYTES = 250 * 1024 * 1024;

export function sanitizeImageDeck(files: File[]) {
  const images = files.filter(file => file.type.startsWith("image/") && file.size <= MAX_UPLOAD_FILE_BYTES);
  const accepted: File[] = [];
  let bytes = 0;
  for (const file of images) {
    if (accepted.length >= MAX_UPLOAD_IMAGES) break;
    if (bytes + file.size > MAX_UPLOAD_TOTAL_BYTES) continue;
    accepted.push(file);
    bytes += file.size;
  }
  return { accepted, omitted: files.length - accepted.length };
}
