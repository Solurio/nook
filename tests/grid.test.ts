import test from "node:test";
import assert from "node:assert/strict";

import {
  areaAnchor,
  areaCells,
  areaShape,
  areaText,
  cellsBetween,
  columnName,
  distanceText,
  hexAt,
  hexCenter,
  hexCorners,
  linkGroups,
  nextUnit,
  snap,
  snapHex,
  snapSquare,
  unlink,
} from "../src/lib/grid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("a piece settles in the middle of the square it landed in", () => {
  assert.deepEqual(snapSquare(10, 10, 50), { x: 25, y: 25 });
  assert.deepEqual(snapSquare(99, 51, 50), { x: 75, y: 75 });
  assert.deepEqual(snapSquare(-1, 0, 50), { x: -25, y: 25 }, "just off the edge is the next square out");
});

test("every hex centre snaps to itself", () => {
  for (let q = -3; q <= 6; q += 1) {
    for (let r = 0; r <= 6; r += 1) {
      const c = hexCenter(q, r, 40);
      assert.deepEqual(hexAt(c.x, c.y, 40), { q, r });
    }
  }
});

test("a point inside a hex snaps to that hex, wherever inside it is", () => {
  const cell = 60;
  const c = hexCenter(2, 3, cell);
  // A little way towards each corner stays in the same hex.
  for (const [x, y] of hexCorners(c.x, c.y, cell)) {
    const inside = snapHex(c.x + (x - c.x) * 0.9, c.y + (y - c.y) * 0.9, cell);
    assert.ok(near(inside.x, c.x) && near(inside.y, c.y), "a corner snapped away");
  }
});

test("rows of hexes shift by half a cell", () => {
  const a = hexCenter(0, 0, 40);
  const b = hexCenter(0, 1, 40);
  assert.ok(near(b.x - a.x, 20));
  assert.ok(near(b.y - a.y, 1.5 * (40 / Math.sqrt(3))));
  assert.deepEqual(snap("square", 5, 5, 40), { x: 20, y: 20 });
});

test("columns are lettered like a spreadsheet", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(27), "AB");
});

test("linking two things puts them in one group", () => {
  assert.deepEqual(linkGroups({ a: undefined, b: undefined }, "a", "b", "g1"), { a: "g1", b: "g1" });
});

test("linking into an existing group joins it, and two groups become one", () => {
  const groups = { a: "g1", b: undefined, c: "g2", d: "g2", e: "g1" };
  assert.deepEqual(linkGroups(groups, "b", "a", "new"), { a: "g1", b: "g1", e: "g1" });
  assert.deepEqual(linkGroups(groups, "a", "c", "new"), { a: "g1", c: "g1", d: "g1", e: "g1" });
});

test("unlinking the second to last lets the last one go too", () => {
  assert.deepEqual(unlink({ a: "g", b: "g" }, "a"), ["a", "b"]);
  assert.deepEqual(unlink({ a: "g", b: "g", c: "g" }, "a"), ["a"]);
  assert.deepEqual(unlink({ a: undefined }, "a"), []);
});

test("distance counts squares the tabletop way, diagonals as one", () => {
  assert.equal(cellsBetween("square", 50, 25, 25, 175, 25), 3);
  assert.equal(cellsBetween("square", 50, 25, 25, 175, 175), 3, "diagonal steps count one");
  assert.equal(distanceText(3, { size: 5, name: "ft" }), "15 ft · 3 squares");
  assert.equal(distanceText(3, { size: 1.5, name: "m" }), "4.5 m · 3 squares");
  assert.equal(distanceText(1, undefined), "5 ft · 1 square");
});

test("distance on hexes counts hex steps", () => {
  const a = hexCenter(0, 0, 40);
  const b = hexCenter(3, 0, 40);
  const c = hexCenter(0, 2, 40);
  assert.equal(cellsBetween("hex", 40, a.x, a.y, b.x, b.y), 3);
  assert.equal(cellsBetween("hex", 40, a.x, a.y, c.x, c.y), 2);
});

test("the units cycle through the usual scales", () => {
  assert.deepEqual(nextUnit(undefined), { size: 5, name: "ft" });
  assert.deepEqual(nextUnit({ size: 5, name: "ft" }), { size: 10, name: "ft" });
  assert.deepEqual(nextUnit({ size: 2, name: "m" }), { size: 5, name: "ft" });
});

test("areas start on a corner, and come in whole cells", () => {
  assert.deepEqual(areaAnchor("square", 50, 62, 138), { x: 50, y: 150 });
  const fireball = { id: "a", kind: "circle" as const, x: 100, y: 100, tx: 100, ty: 290, color: "#f00" };
  assert.equal(areaCells(fireball, 50), 4);
  assert.deepEqual(areaShape(fireball, 50), { circle: { cx: 100, cy: 100, r: 200 } });
  assert.equal(areaText(fireball, 50, { size: 5, name: "ft" }), "20 ft radius");
  assert.equal(areaCells({ ...fireball, tx: 101, ty: 100 }, 50), 1, "never smaller than one cell");
});

test("a cone is as wide at its end as it is long", () => {
  const cone = areaShape({ id: "c", kind: "cone", x: 0, y: 0, tx: 150, ty: 0, color: "#f00" }, 50);
  assert.ok("points" in cone);
  if (!("points" in cone)) return;
  const [, b, c] = cone.points;
  assert.equal(b[0], 150);
  assert.equal(Math.abs(b[1] - c[1]), 150);
});

test("a cube goes out the way it was dragged; a line is one cell wide", () => {
  const cube = areaShape({ id: "s", kind: "square", x: 100, y: 100, tx: 0, ty: 0, color: "#f00" }, 50);
  assert.ok("points" in cube && cube.points.some(([x, y]) => x === 0 && y === 0));
  const line = areaShape({ id: "l", kind: "line", x: 0, y: 0, tx: 0, ty: 300, color: "#f00" }, 50);
  assert.ok("points" in line && Math.abs(line.points[0][0] - line.points[3][0]) === 50);
});

test("an area can start at a corner, the middle of a square, or anywhere", async () => {
  const { areaAnchor } = await import("../src/lib/grid.ts");
  assert.deepEqual(areaAnchor("square", 50, 62, 74), { x: 50, y: 50 });
  assert.deepEqual(areaAnchor("square", 50, 62, 74, "center"), { x: 75, y: 75 });
  assert.deepEqual(areaAnchor("square", 50, 62, 74, "free"), { x: 62, y: 74 });
});
