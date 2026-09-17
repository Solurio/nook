"use client";

// Getting a photo from a phone onto the wall. Two things get in the way: the
// format phones actually save in, and the size of it.
//
// HEIC is the default on a lot of cameras, and outside Safari no browser will
// draw one -- so storing it as-is only trades a refused upload for a picture
// that never appears. And a modern phone photo is several megabytes at a
// resolution far past anything a room needs.
//
// So images are re-drawn through a canvas on the way up, which normalises the
// format and trims the size at once. Anything that animates is left strictly
// alone, because a canvas would flatten it to its first frame.

/** Formats that either animate or are already fine to store and display. */
const LEAVE_ALONE = /^image\/(gif|webp|svg\+xml|avif)$/i;

/** Past this, a photo is re-drawn smaller even if its format was fine. */
export const REENCODE_OVER_BYTES = 2_000_000;

/** Longest edge kept. A room never needs more, and it is far cheaper to store. */
export const MAX_EDGE = 2000;

export const JPEG_QUALITY = 0.85;

/**
 * Whether this file should be re-drawn before upload. Split out from the canvas
 * work so the rule can be tested without a browser.
 */
export function shouldReencode(type: string, size: number): boolean {
  if (!type.startsWith("image/")) return false;
  // Animated or vector: touching it would ruin it.
  if (LEAVE_ALONE.test(type)) return false;
  // Anything the browser may not even draw (heic, heif, tiff, bmp) has to be
  // converted, whatever its size.
  if (!/^image\/(png|jpeg)$/i.test(type)) return true;
  return size > REENCODE_OVER_BYTES;
}

/** The size to draw at, keeping the shape and never scaling up. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type PrepareResult = { file: File } | { error: string };

/**
 * Hands back the file to actually upload. Usually that is a smaller JPEG; for
 * anything that animates it is the original, untouched.
 */
export async function prepareImage(file: File): Promise<PrepareResult> {
  if (!shouldReencode(file.type, file.size)) return { file };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Chrome and Firefox cannot decode HEIC at all, which is the common case.
    const kind = file.type.replace("image/", "") || "that format";
    return {
      error: `this browser cannot read ${kind} photos. save it as a jpeg or png first, or send it from a phone set to "most compatible".`,
    };
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return { file };

  // Photos have no transparency to lose, and a flat backdrop keeps a
  // transparent png from turning black once it becomes a jpeg.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return { file };

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }) };
}
