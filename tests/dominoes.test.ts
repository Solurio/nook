import test from "node:test";
import assert from "node:assert/strict";

import {
  fullSet,
  openEnds,
  playableSides,
  place,
  hasMove,
  handPips,
  roundOutcome,
  opener,
  isDouble,
  type Line,
  type Tile,
} from "../src/lib/dominoes.ts";

test("a double six set is twenty eight tiles with no repeats", () => {
  const set = fullSet();
  assert.equal(set.length, 28);
  assert.equal(set.filter(isDouble).length, 7, "one double per number");

  const keys = new Set(set.map(([a, b]) => `${a}-${b}`));
  assert.equal(keys.size, 28);
  assert.equal(handPips(set), 168, "the whole set adds up");
});

test("an empty line takes any tile", () => {
  assert.equal(openEnds([]), null);
  assert.deepEqual(playableSides([], [3, 5]), ["left"]);
  assert.deepEqual(place([], [3, 5], "left"), [[3, 5]]);
});

test("the ends of the line are what is showing", () => {
  const line: Line = [
    [2, 4],
    [4, 6],
  ];
  assert.deepEqual(openEnds(line), { left: 2, right: 6 });
});

test("a tile turns round so the touching halves match", () => {
  const line: Line = [[2, 4], [4, 6]];

  // Joining the left end (2) with a tile that has the 2 on its first half.
  const left = place(line, [2, 5], "left");
  assert.deepEqual(left?.[0], [5, 2], "flipped so the 2 faces the line");
  assert.deepEqual(openEnds(left as Line), { left: 5, right: 6 });

  // Joining the right end (6) with the 6 on its second half.
  const right = place(line, [1, 6], "right");
  assert.deepEqual(right?.[right.length - 1], [6, 1], "flipped the other way");
  assert.deepEqual(openEnds(right as Line), { left: 2, right: 1 });
});

test("a tile that fits neither end is refused", () => {
  const line: Line = [[2, 4], [4, 6]];
  assert.deepEqual(playableSides(line, [3, 5]), []);
  assert.equal(place(line, [3, 5], "left"), null);
  assert.equal(place(line, [3, 5], "right"), null);
  assert.equal(hasMove(line, [[3, 5], [1, 1]]), false);
  assert.equal(hasMove(line, [[3, 5], [6, 6]]), true, "the six fits the right end");
});

test("a tile matching both ends offers both", () => {
  const line: Line = [[2, 4], [4, 2]];
  assert.deepEqual(playableSides(line, [2, 5]).sort(), ["left", "right"]);
});

test("emptying your hand ends the round", () => {
  const standing = {
    seats: ["s0", "s1"],
    teams: 0,
    hands: { s0: [] as Tile[], s1: [[3, 4]] as Tile[] },
  };
  assert.deepEqual(roundOutcome([[1, 2]], standing), { kind: "out", seat: "s0" });
});

test("when nobody can move the lightest hand takes it", () => {
  const line: Line = [[0, 0]];
  const standing = {
    seats: ["s0", "s1"],
    teams: 0,
    // Neither has a zero, so the line is blocked.
    hands: { s0: [[3, 4]] as Tile[], s1: [[5, 6], [2, 2]] as Tile[] },
  };
  assert.equal(hasMove(line, standing.hands.s0), false);
  assert.deepEqual(roundOutcome(line, standing), { kind: "blocked", seat: "s0" });
});

test("a blocked round with equal weight has no winner", () => {
  const line: Line = [[0, 0]];
  const standing = {
    seats: ["s0", "s1"],
    teams: 0,
    hands: { s0: [[3, 4]] as Tile[], s1: [[2, 5]] as Tile[] },
  };
  assert.deepEqual(roundOutcome(line, standing), { kind: "blocked", seat: null });
});

test("the highest double leads, or the heaviest tile if there is none", () => {
  assert.equal(
    opener({ s0: [[1, 1]], s1: [[6, 5]] }, ["s0", "s1"]),
    "s0",
    "any double outranks a heavy tile",
  );
  assert.equal(
    opener({ s0: [[6, 6]], s1: [[5, 5]] }, ["s0", "s1"]),
    "s0",
    "the bigger double",
  );
  assert.equal(
    opener({ s0: [[1, 2]], s1: [[6, 5]] }, ["s0", "s1"]),
    "s1",
    "no doubles, so the heaviest",
  );
});
