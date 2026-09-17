import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldReencode,
  fitWithin,
  MAX_EDGE,
  REENCODE_OVER_BYTES,
} from "../src/lib/image-upload.ts";

test("things that animate are never re-drawn", () => {
  // A canvas would flatten these to their first frame.
  assert.equal(shouldReencode("image/gif", 50_000_000), false);
  assert.equal(shouldReencode("image/webp", 50_000_000), false);
  assert.equal(shouldReencode("image/svg+xml", 9_000_000), false, "vector, not pixels");
});

test("formats a browser may not draw are always converted", () => {
  // The phone camera default, and the reason uploads were failing.
  assert.equal(shouldReencode("image/heic", 1000), true);
  assert.equal(shouldReencode("image/heif", 1000), true);
  assert.equal(shouldReencode("image/tiff", 1000), true);
  assert.equal(shouldReencode("image/bmp", 1000), true);
});

test("a big photo is trimmed, a small one is left as it is", () => {
  assert.equal(shouldReencode("image/jpeg", REENCODE_OVER_BYTES + 1), true);
  assert.equal(shouldReencode("image/jpeg", 200_000), false);
  assert.equal(shouldReencode("image/png", 400_000), false);
});

test("non-images are not this function's business", () => {
  assert.equal(shouldReencode("video/mp4", 40_000_000), false);
  assert.equal(shouldReencode("audio/mpeg", 8_000_000), false);
});

test("resizing keeps the shape and never scales up", () => {
  // A 4032x3024 phone photo, landscape.
  const landscape = fitWithin(4032, 3024);
  assert.equal(landscape.width, MAX_EDGE);
  assert.equal(landscape.height, Math.round(3024 * (MAX_EDGE / 4032)));
  assert.ok(Math.abs(landscape.width / landscape.height - 4032 / 3024) < 0.01, "same shape");

  // Portrait: the tall edge is the one that gets capped.
  const portrait = fitWithin(3024, 4032);
  assert.equal(portrait.height, MAX_EDGE);
  assert.ok(portrait.width < portrait.height);

  // Already small: untouched.
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test("a tiny image never collapses to zero", () => {
  const thin = fitWithin(10000, 1, 100);
  assert.equal(thin.width, 100);
  assert.ok(thin.height >= 1, "still has a row of pixels");
});
