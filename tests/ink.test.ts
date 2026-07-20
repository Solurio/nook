import test from "node:test";
import assert from "node:assert/strict";

import { inkPath, orderStrokes, strokeHit } from "../src/lib/ink.ts";
import { normalizeSlugInput } from "../src/lib/slug.ts";
import type { Stroke } from "../src/lib/types.ts";

function stroke(id: string, points: number[], size = 4, createdAt = "2020-01-01T00:00:00Z"): Stroke {
  return { id, room_id: "r", color: "#fff", size, points, created_by: null, created_at: createdAt };
}

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

test("builds a move-then-line path from flat points", () => {
  assert.equal(inkPath([0, 0, 10, 10, 20, 0]), "M 0 0 L 10 10 L 20 0");
});

test("a single point still paints a dot", () => {
  const d = inkPath([5, 5]);
  assert.match(d, /^M 5 5 L/, "a lone point needs a tiny segment for the round cap");
});

test("an empty point list is an empty path", () => {
  assert.equal(inkPath([]), "");
});

// ---------------------------------------------------------------------------
// Eraser hit testing
// ---------------------------------------------------------------------------

test("the eraser hits a stroke it passes over", () => {
  const s = stroke("a", [0, 0, 100, 0]); // a horizontal line
  assert.equal(strokeHit(s, 50, 0, 6), true, "dead on the line");
  assert.equal(strokeHit(s, 50, 5, 6), true, "just above, within reach");
  assert.equal(strokeHit(s, 50, 40, 6), false, "far away, no touch");
});

test("reach accounts for the stroke's own thickness", () => {
  const thin = stroke("thin", [0, 0, 100, 0], 2);
  const thick = stroke("thick", [0, 0, 100, 0], 40);
  // 12 units off the line: outside the thin stroke, inside the fat one.
  assert.equal(strokeHit(thin, 50, 12, 6), false);
  assert.equal(strokeHit(thick, 50, 12, 6), true);
});

test("the eraser can catch the end cap of a stroke", () => {
  const s = stroke("a", [0, 0, 10, 0, 10, 50]); // an L shape
  assert.equal(strokeHit(s, 10, 50, 6), true, "the far endpoint");
  assert.equal(strokeHit(s, 10, 25, 6), true, "midway down the vertical leg");
});

test("a lone-dot stroke is only hit up close", () => {
  const dot = stroke("dot", [30, 30], 4);
  assert.equal(strokeHit(dot, 31, 31, 6), true);
  assert.equal(strokeHit(dot, 60, 60, 6), false);
});

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

test("strokes paint oldest first", () => {
  const map = {
    late: stroke("late", [0, 0], 4, "2020-01-03T00:00:00Z"),
    early: stroke("early", [0, 0], 4, "2020-01-01T00:00:00Z"),
    mid: stroke("mid", [0, 0], 4, "2020-01-02T00:00:00Z"),
  };
  assert.deepEqual(
    orderStrokes(map).map((s) => s.id),
    ["early", "mid", "late"],
  );
});

// ---------------------------------------------------------------------------
// Room links now carry the slug in a query parameter
// ---------------------------------------------------------------------------

test("pulls the slug out of an /r/?r= link", () => {
  assert.equal(
    normalizeSlugInput("https://nook.pages.dev/r/?r=cocoa-willow-7fk2"),
    "cocoa-willow-7fk2",
  );
  assert.equal(normalizeSlugInput("/r/?r=cedar-opal-9xz3"), "cedar-opal-9xz3");
  assert.equal(
    normalizeSlugInput("https://nook.pages.dev/r/?r=marble-birch-2ab4#top"),
    "marble-birch-2ab4",
  );
});

test("still accepts a bare slug and an old-style path", () => {
  assert.equal(normalizeSlugInput("cocoa-willow-7fk2"), "cocoa-willow-7fk2");
  assert.equal(normalizeSlugInput("https://nook.pages.dev/r/cocoa-willow-7fk2"), "cocoa-willow-7fk2");
});

test("rejects a link whose room parameter is junk", () => {
  assert.equal(normalizeSlugInput("https://nook.pages.dev/r/?r=no"), null);
  assert.equal(normalizeSlugInput("https://nook.pages.dev/r/?r=has spaces"), null);
});
