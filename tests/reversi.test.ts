import { test } from "node:test";
import assert from "node:assert/strict";
import { count, emptyReversi, flipsFor, initialBoard, movesFor, play, SIZE, type Cell, type ReversiState } from "../src/lib/reversi.ts";

const at = (x: number, y: number) => y * SIZE + x;

test("black opens with four moves, each turning one disc", () => {
  const moves = movesFor(initialBoard(), "b").sort((a, b) => a - b);
  assert.deepEqual(moves, [at(3, 2), at(2, 3), at(5, 4), at(4, 5)].sort((a, b) => a - b));
  assert.deepEqual(flipsFor(initialBoard(), at(3, 2), "b"), [at(3, 3)]);
  assert.deepEqual(flipsFor(initialBoard(), at(0, 0), "b"), []);
});

test("a move turns over what it closes off and passes the turn", () => {
  const next = play(emptyReversi(), at(3, 2));
  assert.equal(next.board[at(3, 3)], "b");
  assert.equal(next.turn, "w");
  assert.deepEqual(count(next.board), { b: 4, w: 1 });
  assert.equal(play(next, at(0, 0)), next, "not a move");
});

test("no move for the other side: the same player goes again; nobody, and it is over", () => {
  // White is surrounded by black with one gap black can fill; after it, white has nothing.
  const board: Cell[] = Array(SIZE * SIZE).fill(null);
  board[at(0, 0)] = "b";
  board[at(1, 0)] = "w";
  const state: ReversiState = { ...emptyReversi(), board, turn: "b" };
  const done = play(state, at(2, 0));
  assert.equal(done.over, true);
  assert.equal(done.wins.b, 1);
});
