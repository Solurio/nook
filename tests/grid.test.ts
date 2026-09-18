import test from "node:test";
import assert from "node:assert/strict";

import { columnName, hexAt, hexCenter, hexCorners, linkGroups, snap, snapHex, snapSquare, unlink } from "../src/lib/grid.ts";

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
