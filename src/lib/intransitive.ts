// Intransitive: a race across a 9x9 board where the pieces beat each other in a
// circle instead of a ladder. Rock takes scissors, scissors takes paper, paper
// takes rock, and nothing takes its equal -- so no piece is ever simply the
// strongest, and every advance is also an invitation.
//
// Pieces step one square in any direction, like a chess king. You win by
// walking onto the far corner the other side is defending.

export type Side = "blue" | "red";
export type Shape = "R" | "P" | "S";

export interface Piece {
  side: Side;
  shape: Shape;
}

export type Cell = Piece | null;
export type Board = Cell[]; // 81 cells, index = row * 9 + col, row 0 is red's back rank

export const SIZE = 9;

const idx = (row: number, col: number) => row * SIZE + col;
const rowOf = (i: number) => Math.floor(i / SIZE);
const colOf = (i: number) => i % SIZE;
const inBounds = (row: number, col: number) =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/** The corner each side is trying to reach: blue runs for red's, and back. */
export const BASE: Record<Side, number> = {
  blue: idx(SIZE - 1, 0), // a1, bottom left
  red: idx(0, SIZE - 1), // i9, top right
};

/** Blue's opening camp, as the original lays it out. */
const BLUE_SETUP: Record<Shape, Array<[number, number]>> = {
  R: [
    [5, 1],
    [6, 2],
    [7, 3],
  ],
  P: [
    [4, 1],
    [5, 2],
    [6, 3],
    [7, 4],
  ],
  S: [
    [4, 2],
    [5, 3],
    [6, 4],
  ],
};

export function initialBoard(): Board {
  const board: Board = Array(SIZE * SIZE).fill(null);
  for (const shape of ["R", "P", "S"] as Shape[]) {
    for (const [row, col] of BLUE_SETUP[shape]) {
      board[idx(row, col)] = { side: "blue", shape };
      // Red camps in the same shape, turned half a circle round the middle.
      board[idx(SIZE - 1 - row, SIZE - 1 - col)] = { side: "red", shape };
    }
  }
  return board;
}

/** The circle: each shape takes exactly one other, and loses to exactly one. */
const TAKES: Record<Shape, Shape> = { R: "S", S: "P", P: "R" };

export function beats(attacker: Shape, defender: Shape): boolean {
  return TAKES[attacker] === defender;
}

/**
 * Every square this piece may step onto: any of the eight neighbours that is
 * empty, or holds an enemy this shape takes. Equal shapes stand each other off,
 * and a shape never walks into the one that takes it.
 */
export function legalMoves(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];

  const row = rowOf(from);
  const col = colOf(from);
  const out: number[] = [];

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;

      const target = board[idx(r, c)];
      if (!target) out.push(idx(r, c));
      else if (target.side !== piece.side && beats(piece.shape, target.shape)) {
        out.push(idx(r, c));
      }
    }
  }
  return out;
}

export interface MoveResult {
  board: Board;
  captured: Piece | null;
}

export function applyMove(board: Board, from: number, to: number): MoveResult {
  const piece = board[from];
  if (!piece) return { board, captured: null };

  const next = board.slice();
  const captured = next[to];
  next[to] = piece;
  next[from] = null;
  return { board: next, captured };
}

export function allMoves(board: Board, side: Side): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < board.length; i += 1) {
    if (board[i]?.side !== side) continue;
    for (const to of legalMoves(board, i)) out.push({ from: i, to });
  }
  return out;
}

export type Outcome =
  | { kind: "playing" }
  | { kind: "won"; winner: Side; reason: "reached" | "swept" | "stuck" };

/**
 * Where the game stands for the side about to move. Reaching the far corner
 * wins outright; so does leaving the other side with nothing to move, whether
 * that is no pieces at all or no square left to step to.
 */
export function outcome(board: Board, turn: Side): Outcome {
  for (const side of ["blue", "red"] as Side[]) {
    const holder = board[BASE[side === "blue" ? "red" : "blue"]];
    if (holder?.side === side) return { kind: "won", winner: side, reason: "reached" };
  }

  const mine = board.some((cell) => cell?.side === turn);
  if (!mine) return { kind: "won", winner: turn === "blue" ? "red" : "blue", reason: "swept" };

  if (allMoves(board, turn).length === 0) {
    return { kind: "won", winner: turn === "blue" ? "red" : "blue", reason: "stuck" };
  }
  return { kind: "playing" };
}

export const SHAPE_NAME: Record<Shape, string> = {
  R: "rock",
  P: "paper",
  S: "scissors",
};
