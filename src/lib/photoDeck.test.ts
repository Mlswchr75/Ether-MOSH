import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_IMAGES,
  sanitizeImageDeck,
} from "./photoDeck";

function image(name: string, size = 10) {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

describe("photo deck upload limits", () => {
  it("accepts a multi-selection and caps it at the safe image count", () => {
    const files = Array.from({ length: MAX_UPLOAD_IMAGES + 5 }, (_, i) => image(`${i}.jpg`));
    const result = sanitizeImageDeck(files);
    expect(result.accepted).toHaveLength(MAX_UPLOAD_IMAGES);
    expect(result.omitted).toBe(5);
  });

  it("skips non-images, oversized images, and files beyond the total budget", () => {
    const budgetFiles = Array.from({ length: 7 }, (_, i) => ({
      name: `budget-${i}.jpg`, type: "image/jpeg", size: MAX_UPLOAD_FILE_BYTES,
    } as File));
    const files = [
      new File(["text"], "notes.txt", { type: "text/plain" }),
      { name: "huge.jpg", type: "image/jpeg", size: MAX_UPLOAD_FILE_BYTES + 1 } as File,
      ...budgetFiles,
    ];
    const result = sanitizeImageDeck(files);
    expect(result.accepted.map(file => file.name)).toEqual(budgetFiles.slice(0, 6).map(file => file.name));
    expect(result.omitted).toBe(3);
  });
});
