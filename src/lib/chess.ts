// Casual chess: legal per-piece movement (blocking, captures, pawn double-step,
// promotion to queen), turns. It deliberately skips check/checkmate, castling
// and en passant -- players self-enforce, like moving pieces on a real board.
// That keeps it small and reliable while still feeling like chess.

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
  color: Color;
  type: PieceType;
}

export type Cell = Piece | null;
export type Board = Cell[]; // 64 cells, index = row * 8 + col, row 0 = black back rank

const idx = (r: number, c: number) => r * 8 + c;
const rowOf = (i: number) => Math.floor(i / 8);
const colOf = (i: number) => i % 8;
const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function initialBoard(): Board {
  const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board: Board = Array(64).fill(null);
  for (let c = 0; c < 8; c += 1) {
    board[idx(0, c)] = { color: "b", type: back[c] };
    board[idx(1, c)] = { color: "b", type: "p" };
    board[idx(6, c)] = { color: "w", type: "p" };
    board[idx(7, c)] = { color: "w", type: back[c] };
  }
  return board;
}

const SLIDES: Record<"b" | "r" | "q", Array<[number, number]>> = {
  b: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ],
  r: [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
  q: [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ],
};

const KNIGHT: Array<[number, number]> = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];

export function legalMoves(board: Board, from: number): number[] {
  const piece = board[from];
  if (!piece) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const out: number[] = [];

  const canLand = (rr: number, cc: number) => {
    const target = board[idx(rr, cc)];
    return !target || target.color !== piece.color;
  };

  if (piece.type === "p") {
    const dir = piece.color === "w" ? -1 : 1;
    const startRow = piece.color === "w" ? 6 : 1;
    // Forward one (must be empty).
    if (inB(r + dir, c) && !board[idx(r + dir, c)]) {
      out.push(idx(r + dir, c));
      // Forward two from the start row.
      if (r === startRow && !board[idx(r + 2 * dir, c)]) out.push(idx(r + 2 * dir, c));
    }
    // Diagonal captures.
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (inB(rr, cc)) {
        const target = board[idx(rr, cc)];
        if (target && target.color !== piece.color) out.push(idx(rr, cc));
      }
    }
    return out;
  }

  if (piece.type === "n") {
    for (const [dr, dc] of KNIGHT) {
      if (inB(r + dr, c + dc) && canLand(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
    }
    return out;
  }

  if (piece.type === "k") {
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        if (inB(r + dr, c + dc) && canLand(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
      }
    }
    return out;
  }

  // Sliding pieces: bishop, rook, queen.
  for (const [dr, dc] of SLIDES[piece.type]) {
    let rr = r + dr;
    let cc = c + dc;
    while (inB(rr, cc)) {
      const target = board[idx(rr, cc)];
      if (!target) {
        out.push(idx(rr, cc));
      } else {
        if (target.color !== piece.color) out.push(idx(rr, cc));
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
  return out;
}

export interface ChessMoveResult {
  board: Board;
  captured: Piece | null;
}

export function applyMove(board: Board, from: number, to: number): ChessMoveResult {
  const next = board.slice();
  const piece = next[from];
  if (!piece) return { board, captured: null };

  const captured = next[to];
  next[to] = piece;
  next[from] = null;

  // Auto-promote a pawn that reaches the far rank.
  if (piece.type === "p") {
    const rank = rowOf(to);
    if ((piece.color === "w" && rank === 0) || (piece.color === "b" && rank === 7)) {
      next[to] = { color: piece.color, type: "q" };
    }
  }

  return { board: next, captured };
}

/** A side with no king on the board has lost. */
export function kingCaptured(board: Board): Color | null {
  const whiteKing = board.some((p) => p?.color === "w" && p.type === "k");
  const blackKing = board.some((p) => p?.color === "b" && p.type === "k");
  if (!whiteKing) return "b";
  if (!blackKing) return "w";
  return null;
}

export const GLYPHS: Record<Color, Record<PieceType, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
