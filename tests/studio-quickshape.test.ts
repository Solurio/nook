import { test } from "node:test";
import assert from "node:assert/strict";
import { snapShape } from "../src/lib/studio/quickshape.ts";
import { harmonies, hexToHsv, svToTriangle, triangleCorners, triangleToSv } from "../src/lib/studio/color.ts";

/** A hand-drawn path: exact points, nudged by a small steady wobble. */
function wobbly(points: Array<[number, number]>, amount = 2): number[] {
  const out: number[] = [];
  points.forEach(([x, y], i) => out.push(x + Math.sin(i * 1.7) * amount, y + Math.cos(i * 2.3) * amount));
  return out;
}

function along(from: [number, number], to: [number, number], steps: number): Array<[number, number]> {
  return Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]);
}

test("a wobbly line held still becomes straight", () => {
  const snapped = snapShape(wobbly(along([10, 10], [300, 120], 40)));
  assert.equal(snapped?.kind, "line");
  assert.equal(snapped?.points.length, 4);
});

test("a rough circle becomes a round one", () => {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    pts.push([200 + Math.cos(a) * 100, 200 + Math.sin(a) * 96]);
  }
  const snapped = snapShape(wobbly(pts, 3));
  assert.equal(snapped?.kind, "ellipse");
  // Round: every point the same distance out.
  const p = snapped!.points;
  const r0 = Math.hypot(p[0] - 200, p[1] - 200);
  const r1 = Math.hypot(p[40] - 200, p[41] - 200);
  assert.ok(Math.abs(r0 - r1) < 2);
});

test("a rough box becomes a clean rectangle", () => {
  const pts = [...along([0, 0], [200, 0], 20), ...along([200, 0], [200, 120], 12), ...along([200, 120], [0, 120], 20), ...along([0, 120], [0, 4], 12)];
  const snapped = snapShape(wobbly(pts, 2.5));
  assert.equal(snapped?.kind, "polygon");
  assert.equal(snapped?.points.length, 10, "four corners and back to the first");
});

test("a triangle stays a triangle", () => {
  const pts = [...along([0, 200], [100, 0], 20), ...along([100, 0], [200, 200], 20), ...along([200, 200], [6, 198], 20)];
  const snapped = snapShape(wobbly(pts, 2));
  assert.equal(snapped?.kind, "polygon");
  assert.equal(snapped?.points.length, 8);
});

test("an angle becomes its two straight pieces", () => {
  const pts = [...along([0, 0], [150, 150], 20), ...along([150, 150], [300, 0], 20)];
  const snapped = snapShape(wobbly(pts, 2));
  assert.equal(snapped?.kind, "polyline");
  assert.equal(snapped?.points.length, 6);
});

test("a scribble is left alone, and so is a dot", () => {
  const scribble: Array<[number, number]> = [];
  for (let i = 0; i < 80; i += 1) scribble.push([i * 4 + Math.sin(i) * 30, 100 + Math.cos(i * 0.7) * 60]);
  assert.equal(snapShape(scribble.flat()), null);
  assert.equal(snapShape([1, 1, 2, 2, 3, 3, 4, 4]), null);
});

// ---------------------------------------------------------------------------
// The triangle picker
// ---------------------------------------------------------------------------

test("the triangle's corners are pure hue, white and black", () => {
  const corners = triangleCorners(0, 50, 50, 40);
  assert.deepEqual(triangleToSv(...corners[0], corners), { s: 1, v: 1 });
  const white = triangleToSv(...corners[1], corners);
  assert.ok(white.s < 0.01 && white.v > 0.99);
  assert.ok(triangleToSv(...corners[2], corners).v < 0.01);
});

test("a colour goes into the triangle and comes back out the same", () => {
  const corners = triangleCorners(137, 50, 50, 40);
  for (const [s, v] of [[0.3, 0.8], [0.9, 0.4], [0.5, 0.5]]) {
    const [x, y] = svToTriangle(s, v, corners);
    const back = triangleToSv(x, y, corners);
    assert.ok(Math.abs(back.s - s) < 1e-6 && Math.abs(back.v - v) < 1e-6);
  }
});

test("a point outside the triangle lands on its nearest edge", () => {
  const corners = triangleCorners(0, 50, 50, 40);
  const { s, v } = triangleToSv(50, -100, corners);
  assert.ok(s >= 0 && s <= 1 && v >= 0 && v <= 1);
});

test("harmonies go round the wheel from the colour", () => {
  const [opposite] = harmonies(hexToHsv("#ff0000"));
  assert.equal(opposite.colors[0], "#00ffff");
});

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

import { activePoints, assistDirection, defaultGuides, guideLines, moveVanishing, onLine } from "../src/lib/studio/guides.ts";

test("with no perspective, a stroke locks across, up, or at 45 degrees", () => {
  const g = { ...defaultGuides(1000, 800), assist: true };
  const dir = assistDirection(g, [100, 100], [200, 110], 1000);
  assert.deepEqual(dir, [1, 0]);
  const diag = assistDirection(g, [100, 100], [200, 190], 1000)!;
  assert.ok(Math.abs(diag[0] - Math.SQRT1_2) < 1e-9 && Math.abs(diag[1] - Math.SQRT1_2) < 1e-9);
});

test("with a vanishing point, a stroke heading for it runs straight at it", () => {
  const g = { ...defaultGuides(1000, 800), perspective: 1 as const, assist: true };
  const [vp] = activePoints(g, 1000);
  const origin: [number, number] = [100, 700];
  const toward: [number, number] = [origin[0] + (vp[0] - origin[0]) * 0.1 + 3, origin[1] + (vp[1] - origin[1]) * 0.1];
  const dir = assistDirection(g, origin, toward, 1000)!;
  const onIt = onLine(origin, dir, [vp[0], vp[1]]);
  assert.ok(Math.hypot(onIt[0] - vp[0], onIt[1] - vp[1]) < 1e-6, "the vanishing point is on the locked line");
});

test("two points share a horizon, and moving one moves it", () => {
  const g = { ...defaultGuides(1000, 800), perspective: 2 as const };
  const [a, b] = activePoints(g, 1000);
  assert.equal(a[1], b[1]);
  assert.ok(a[0] < 0 && b[0] > 1000, "out towards the edges");
  const moved = moveVanishing(g, 1, [900, 300], 1000);
  const [a2, b2] = activePoints(moved, 1000);
  assert.deepEqual(b2, [900, 300]);
  assert.equal(a2[1], 300);
});

test("the grid and thirds are lines across the picture", () => {
  const lines = guideLines({ ...defaultGuides(300, 200), grid: 100, thirds: true }, 300, 200);
  assert.equal(lines.filter((l) => !l.strong).length, 3, "two across, one down");
  assert.equal(lines.filter((l) => l.strong).length, 4);
});
