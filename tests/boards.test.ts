import test from "node:test";
import assert from "node:assert/strict";

import {
  initialBoard as initChess,
  legalMoves as chessMoves,
  applyMove as chessApply,
  kingCaptured,
  inCheck,
  outcome,
  initialCastling,
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

import { fillPixels } from "../src/lib/paint.ts";

const idx = (r: number, c: number) => r * 8 + c;

// ---------------------------------------------------------------------------
// Paint bucket
// ---------------------------------------------------------------------------

/** A w*h RGBA buffer, transparent to start with. */
function buffer(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

function pixel(px: Uint8ClampedArray, w: number, x: number, y: number) {
  const i = (y * w + x) * 4;
  return [px[i], px[i + 1], px[i + 2], px[i + 3]];
}

test("the bucket spreads across an empty area", () => {
  const w = 5;
  const h = 5;
  const px = buffer(w, h);

  const painted = fillPixels(px, w, h, 0, 0, "#ff0000");

  assert.equal(painted, 25, "the whole surface is one region");
  assert.deepEqual(pixel(px, w, 4, 4), [255, 0, 0, 255], "reaches the far corner");
});

test("the bucket stops at a drawn edge", () => {
  const w = 5;
  const h = 5;
  const px = buffer(w, h);

  // An opaque wall down the middle column.
  for (let y = 0; y < h; y += 1) {
    const i = (y * w + 2) * 4;
    px[i] = 10;
    px[i + 1] = 10;
    px[i + 2] = 10;
    px[i + 3] = 255;
  }

  const painted = fillPixels(px, w, h, 0, 0, "#00ff00");

  assert.equal(painted, 10, "only the two columns left of the wall");
  assert.deepEqual(pixel(px, w, 1, 3), [0, 255, 0, 255], "filled up to the wall");
  assert.deepEqual(pixel(px, w, 2, 3), [10, 10, 10, 255], "the wall is untouched");
  assert.deepEqual(pixel(px, w, 3, 3), [0, 0, 0, 0], "and nothing leaked past it");
});

test("pouring the colour that is already there does nothing", () => {
  const w = 3;
  const h = 3;
  const px = buffer(w, h);
  fillPixels(px, w, h, 1, 1, "#123456");

  const again = fillPixels(px, w, h, 1, 1, "#123456");
  assert.equal(again, 0, "no second pass, and no infinite spin");
});

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

test("a rook bearing down the file puts the king in check", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(7, 4)] = { color: "w", type: "k" };
  b[idx(0, 4)] = { color: "b", type: "r" };
  assert.equal(inCheck(b, "w"), true);
  assert.equal(inCheck(b, "b"), false);
});

test("a pinned piece cannot step out of the pin", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(7, 4)] = { color: "w", type: "k" };
  b[idx(6, 4)] = { color: "w", type: "b" }; // pinned on the e-file
  b[idx(0, 4)] = { color: "b", type: "r" };
  assert.deepEqual(chessMoves(b, idx(6, 4)), [], "every move would expose the king");
});

test("back rank mate is reported as checkmate", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(7, 7)] = { color: "w", type: "k" }; // h1, boxed in by its own pawns
  b[idx(6, 6)] = { color: "w", type: "p" };
  b[idx(6, 7)] = { color: "w", type: "p" };
  b[idx(7, 0)] = { color: "b", type: "r" }; // a1, sweeping the rank
  b[idx(0, 0)] = { color: "b", type: "k" };

  assert.deepEqual(outcome(b, "w"), { kind: "checkmate", winner: "b" });
});

test("a king with no moves but no check is stalemate, not a loss", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(0, 0)] = { color: "b", type: "k" }; // a8
  b[idx(1, 2)] = { color: "w", type: "q" }; // c7 covers every escape, checks none
  b[idx(2, 2)] = { color: "w", type: "k" };

  assert.equal(inCheck(b, "b"), false, "the king itself is not attacked");
  assert.deepEqual(outcome(b, "b"), { kind: "stalemate" });
});

test("castling is offered and drags the rook across with the king", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(7, 4)] = { color: "w", type: "k" };
  b[idx(7, 7)] = { color: "w", type: "r" };
  b[idx(7, 0)] = { color: "w", type: "r" };
  b[idx(0, 0)] = { color: "b", type: "k" };

  const moves = chessMoves(b, idx(7, 4), { castling: initialCastling(), ep: null });
  assert.equal(moves.includes(idx(7, 6)), true, "kingside");
  assert.equal(moves.includes(idx(7, 2)), true, "queenside");

  const short = chessApply(b, idx(7, 4), idx(7, 6), { castling: initialCastling(), ep: null });
  assert.equal(short.castled, true);
  assert.deepEqual(short.board[idx(7, 6)], { color: "w", type: "k" });
  assert.deepEqual(short.board[idx(7, 5)], { color: "w", type: "r" }, "rook hops to f1");
  assert.equal(short.board[idx(7, 7)], null, "and leaves the corner");
  assert.equal(short.castling.wk, false, "the right is spent");
});

test("you cannot castle out of, or through, an attacked square", () => {
  const through: ChessBoard = Array(64).fill(null);
  through[idx(7, 4)] = { color: "w", type: "k" };
  through[idx(7, 7)] = { color: "w", type: "r" };
  through[idx(0, 5)] = { color: "b", type: "r" }; // f8 rakes f1
  through[idx(0, 0)] = { color: "b", type: "k" };
  assert.equal(
    chessMoves(through, idx(7, 4), { castling: initialCastling(), ep: null }).includes(idx(7, 6)),
    false,
  );

  const outOf: ChessBoard = Array(64).fill(null);
  outOf[idx(7, 4)] = { color: "w", type: "k" };
  outOf[idx(7, 7)] = { color: "w", type: "r" };
  outOf[idx(0, 4)] = { color: "b", type: "r" }; // e8 checks the king
  outOf[idx(0, 0)] = { color: "b", type: "k" };
  assert.equal(
    chessMoves(outOf, idx(7, 4), { castling: initialCastling(), ep: null }).includes(idx(7, 6)),
    false,
  );
});

test("a double pawn step can be answered en passant", () => {
  const b: ChessBoard = Array(64).fill(null);
  b[idx(7, 0)] = { color: "w", type: "k" };
  b[idx(0, 0)] = { color: "b", type: "k" };
  b[idx(3, 4)] = { color: "w", type: "p" }; // e5
  b[idx(1, 5)] = { color: "b", type: "p" }; // f7

  const step = chessApply(b, idx(1, 5), idx(3, 5)); // f7-f5, skipping f6
  assert.equal(step.ep, idx(2, 5), "f6 is the square left open");

  const reply = chessMoves(step.board, idx(3, 4), { ep: step.ep });
  assert.equal(reply.includes(idx(2, 5)), true, "the pawn may take the empty square");

  const taken = chessApply(step.board, idx(3, 4), idx(2, 5), { ep: step.ep });
  assert.equal(taken.enPassant, true);
  assert.deepEqual(taken.board[idx(2, 5)], { color: "w", type: "p" });
  assert.equal(taken.board[idx(3, 5)], null, "the black pawn is gone from f5");
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
