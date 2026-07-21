import test from "node:test";
import assert from "node:assert/strict";

import {
  initialBoard as initChess,
  legalMoves as chessMoves,
  applyMove as chessApply,
  kingCaptured,
  type Board as ChessBoard,
} from "../src/lib/chess.ts";
import {
  initialBoard as initCheckers,
  legalMoves as checkersMoves,
  applyMove as checkersApply,
  movesForPiece,
  countPieces,
  winner,
  type Board as CheckersBoard,
} from "../src/lib/checkers.ts";

const idx = (r: number, c: number) => r * 8 + c;

// ---------------------------------------------------------------------------
// Chess
// ---------------------------------------------------------------------------

test("chess starts with 32 pieces in the right places", () => {
  const b = initChess();
  assert.equal(b.filter(Boolean).length, 32);
  assert.deepEqual(b[idx(7, 4)], { color: "w", type: "k" });
  assert.deepEqual(b[idx(0, 4)], { color: "b", type: "k" });
});

test("a pawn steps one or two from its start and captures diagonally", () => {
  const b = initChess();
  const from = idx(6, 4); // white e2
  assert.deepEqual(chessMoves(b, from).sort(), [idx(4, 4), idx(5, 4)].sort());

  // Drop a black piece diagonally in front to make a capture available.
  const b2 = b.slice() as ChessBoard;
  b2[idx(5, 5)] = { color: "b", type: "p" };
  assert.equal(chessMoves(b2, from).includes(idx(5, 5)), true);
});

test("a knight jumps out of the back rank over its own pawns", () => {
  const b = initChess();
  assert.deepEqual(chessMoves(b, idx(7, 1)).sort(), [idx(5, 0), idx(5, 2)].sort());
});

test("a rook slides until it hits something and stops", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(4, 4)] = { color: "w", type: "r" };
  b[idx(4, 6)] = { color: "b", type: "p" }; // enemy: capturable, then blocked
  b[idx(2, 4)] = { color: "w", type: "p" }; // own: blocks before it
  const moves = chessMoves(b, idx(4, 4));
  assert.equal(moves.includes(idx(4, 6)), true, "can capture the enemy");
  assert.equal(moves.includes(idx(4, 7)), false, "cannot pass through it");
  assert.equal(moves.includes(idx(2, 4)), false, "cannot land on its own pawn");
  assert.equal(moves.includes(idx(3, 4)), true, "stops just before its own pawn");
});

test("a pawn reaching the last rank promotes to a queen", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(1, 0)] = { color: "w", type: "p" };
  const { board } = chessApply(b, idx(1, 0), idx(0, 0));
  assert.deepEqual(board[idx(0, 0)], { color: "w", type: "q" });
});

test("losing the king ends the game", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(0, 0)] = { color: "w", type: "k" };
  assert.equal(kingCaptured(b), "w", "black has no king");
});

// ---------------------------------------------------------------------------
// Checkers
// ---------------------------------------------------------------------------

test("checkers starts with 12 discs a side", () => {
  const b = initCheckers();
  assert.equal(countPieces(b, "r"), 12);
  assert.equal(countPieces(b, "b"), 12);
});

test("captures are forced when one is available", () => {
  const b: CheckersBoard = Array(64).fill(null);
  b[idx(5, 2)] = { side: "r", king: false }; // can jump
  b[idx(4, 3)] = { side: "b", king: false };
  b[idx(7, 0)] = { side: "r", king: false }; // has a plain step, should be excluded

  const moves = checkersMoves(b, "r");
  assert.equal(moves.length, 1, "only the jump is legal");
  assert.deepEqual(moves[0], { from: idx(5, 2), to: idx(3, 4), captured: idx(4, 3) });
});

test("a jump removes the disc and can chain", () => {
  const b: CheckersBoard = Array(64).fill(null);
  b[idx(5, 2)] = { side: "r", king: false };
  b[idx(4, 3)] = { side: "b", king: false };
  b[idx(2, 3)] = { side: "b", king: false }; // a second disc to jump next

  const move = movesForPiece(b, idx(5, 2))[0];
  const result = checkersApply(b, move);
  assert.equal(result.board[idx(4, 3)], null, "jumped disc is gone");
  assert.equal(result.continues, true, "another jump is available, so keep going");
});

test("a man reaching the far row is crowned", () => {
  const b: CheckersBoard = Array(64).fill(null);
  b[idx(1, 2)] = { side: "r", king: false };
  const result = checkersApply(b, { from: idx(1, 2), to: idx(0, 1), captured: null });
  assert.deepEqual(result.board[idx(0, 1)], { side: "r", king: true });
  assert.equal(result.continues, false, "a fresh king does not chain on the same turn");
});

test("a side with no discs left has lost", () => {
  const b: CheckersBoard = Array(64).fill(null);
  b[idx(5, 2)] = { side: "r", king: false };
  assert.equal(winner(b, "b"), "r", "black to move but has nothing");
});
