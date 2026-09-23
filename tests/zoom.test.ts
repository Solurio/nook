import { test } from "node:test";
import assert from "node:assert/strict";
import { IDENTITY, MAX_ZOOM, clampView, pinchView, zoomAbout } from "../src/lib/zoom.ts";

const box = { width: 300, height: 600 };

test("a pinch keeps what was under the fingers under them", () => {
  const mid = { x: 100, y: 200 };
  const view = pinchView(IDENTITY, 50, 150, mid, mid, box);
  assert.equal(view.scale, 3);
  // The content point that was at (100, 200) is still drawn there.
  const cx = (mid.x - view.x) / view.scale;
  const cy = (mid.y - view.y) / view.scale;
  assert.equal(cx, 100);
  assert.equal(cy, 200);
});

test("moving both fingers pans, and the edges hold", () => {
  const start = { scale: 2, x: -100, y: -200 };
  const moved = pinchView(start, 80, 80, { x: 150, y: 300 }, { x: 170, y: 290 }, box);
  assert.equal(moved.scale, 2);
  assert.equal(moved.x, -80);
  assert.equal(moved.y, -210);
  // Dragged far past the left edge, it stops at the edge.
  const far = pinchView(start, 80, 80, { x: 150, y: 300 }, { x: 900, y: 300 }, box);
  assert.equal(far.x, 0);
});

test("never smaller than the whole thing, never past the limit", () => {
  assert.deepEqual(clampView({ scale: 0.4, x: 50, y: 50 }, box), IDENTITY);
  assert.equal(zoomAbout(IDENTITY, 100, { x: 0, y: 0 }, box).scale, MAX_ZOOM);
  const back = zoomAbout({ scale: 2, x: -150, y: -300 }, 0.25, { x: 150, y: 300 }, box);
  assert.deepEqual(back, IDENTITY);
});
