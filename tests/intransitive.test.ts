import test from "node:test";
import assert from "node:assert/strict";

import {
  initialBoard,
  legalMoves,
  applyMove,
  allMoves,
  outcome,
  beats,
  BASE,
  SIZE,
  type Board,
} from "../src/lib/intransitive.ts";

const at = (row: number, col: number) => row * SIZE + col;

test("the shapes beat each other in a circle, never themselves", () => {
  assert.equal(beats("R", "S"), true);
  assert.equal(beats("S", "P"), true);
  assert.equal(beats("P", "R"), true);

  assert.equal(beats("S", "R"), false);
  assert.equal(beats("P", "S"), false);
  assert.equal(beats("R", "P"), false);

  for (const shape of ["R", "P", "S"] as const) {
    assert.equal(beats(shape, shape), false, `${shape} should not take its equal`);
  }
});

test("both camps open with ten pieces, mirrored across the middle", () => {
  const board = initialBoard();
  const blue = board.filter((c) => c?.side === "blue");
  const red = board.filter((c) => c?.side === "red");

  assert.equal(blue.length, 10);
  assert.equal(red.length, 10);

  const count = (side: string, shape: string) =>
    board.filter((c) => c?.side === side && c.shape === shape).length;
  for (const side of ["blue", "red"]) {
    assert.equal(count(side, "R"), 3, `${side} rocks`);
    assert.equal(count(side, "P"), 4, `${side} papers`);
    assert.equal(count(side, "S"), 3, `${side} scissors`);
  }

  // The layout the original opens with: blue rock on b4, paper on b5.
  assert.deepEqual(board[at(5, 1)], { side: "blue", shape: "R" });
  assert.deepEqual(board[at(4, 1)], { side: "blue", shape: "P" });
  // Red is the same camp turned half a circle.
  assert.deepEqual(board[at(3, 7)], { side: "red", shape: "R" });

  // Nobody starts on a base.
  assert.equal(board[BASE.blue], null);
  assert.equal(board[BASE.red], null);
});

test("a piece steps one square in any direction", () => {
  const board: Board = Array(81).fill(null);
  board[at(4, 4)] = { side: "blue", shape: "R" };

  const moves = legalMoves(board, at(4, 4)).sort((a, b) => a - b);
  const expected = [
    at(3, 3), at(3, 4), at(3, 5),
    at(4, 3), at(4, 5),
    at(5, 3), at(5, 4), at(5, 5),
  ].sort((a, b) => a - b);

  assert.deepEqual(moves, expected);
});

test("it takes only what its shape beats", () => {
  const board: Board = Array(81).fill(null);
  board[at(4, 4)] = { side: "blue", shape: "R" };
  board[at(4, 5)] = { side: "red", shape: "S" }; // rock takes scissors
  board[at(4, 3)] = { side: "red", shape: "P" }; // paper takes rock, so it may not
  board[at(3, 4)] = { side: "red", shape: "R" }; // equals stand each other off
  board[at(5, 4)] = { side: "blue", shape: "S" }; // never its own side

  const moves = legalMoves(board, at(4, 4));
  assert.equal(moves.includes(at(4, 5)), true, "takes the scissors");
  assert.equal(moves.includes(at(4, 3)), false, "cannot walk into paper");
  assert.equal(moves.includes(at(3, 4)), false, "cannot take an equal shape");
  assert.equal(moves.includes(at(5, 4)), false, "cannot take its own");
});

test("a capture clears the square it lands on", () => {
  const board: Board = Array(81).fill(null);
  board[at(2, 2)] = { side: "blue", shape: "S" };
  board[at(2, 3)] = { side: "red", shape: "P" };

  const { board: after, captured } = applyMove(board, at(2, 2), at(2, 3));
  assert.deepEqual(captured, { side: "red", shape: "P" });
  assert.deepEqual(after[at(2, 3)], { side: "blue", shape: "S" });
  assert.equal(after[at(2, 2)], null);
  assert.deepEqual(board[at(2, 2)], { side: "blue", shape: "S" }, "the original is untouched");
});

test("reaching the far corner wins it", () => {
  const board: Board = Array(81).fill(null);
  board[BASE.red] = { side: "blue", shape: "P" };
  board[at(4, 4)] = { side: "red", shape: "R" };

  assert.deepEqual(outcome(board, "red"), { kind: "won", winner: "blue", reason: "reached" });
});

test("a side with nothing left, or nothing to do, has lost", () => {
  const swept: Board = Array(81).fill(null);
  swept[at(4, 4)] = { side: "blue", shape: "R" };
  assert.deepEqual(outcome(swept, "red"), { kind: "won", winner: "blue", reason: "swept" });

  // Boxed into a corner by shapes it cannot take.
  const stuck: Board = Array(81).fill(null);
  stuck[at(0, 0)] = { side: "red", shape: "R" };
  stuck[at(0, 1)] = { side: "blue", shape: "P" };
  stuck[at(1, 0)] = { side: "blue", shape: "P" };
  stuck[at(1, 1)] = { side: "blue", shape: "P" };

  assert.equal(allMoves(stuck, "red").length, 0);
  assert.deepEqual(outcome(stuck, "red"), { kind: "won", winner: "blue", reason: "stuck" });
});

test("the opening position is a live game with moves for both", () => {
  const board = initialBoard();
  assert.deepEqual(outcome(board, "blue"), { kind: "playing" });
  assert.ok(allMoves(board, "blue").length > 0);
  assert.ok(allMoves(board, "red").length > 0);
});
