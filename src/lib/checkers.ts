// English draughts (checkers) on an 8x8 board. Pieces live on dark squares.
// Men step/jump diagonally forward; kings any diagonal. Captures are forced,
// and a jump that can continue must (multi-jumps keep the turn).

export type Side = "r" | "b";

export interface Piece {
  side: Side;
  king: boolean;
}

export type Cell = Piece | null;
export type Board = Cell[]; // 64 cells, row-major (index = row * 8 + col)

export interface Move {
  from: number;
  to: number;
  /** Index of a jumped piece, when this move is a capture. */
  captured: number | null;
}

const idx = (row: number, col: number) => row * 8 + col;
const rowOf = (i: number) => Math.floor(i / 8);
const colOf = (i: number) => i % 8;
const inBounds = (row: number, col: number) => row >= 0 && row < 8 && col >= 0 && col < 8;

export function initialBoard(): Board {
  const board: Board = Array(64).fill(null);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 === 0) continue; // only dark squares
      if (row < 3) board[idx(row, col)] = { side: "b", king: false };
      else if (row > 4) board[idx(row, col)] = { side: "r", king: false };
    }
  }
  return board;
}

function directions(piece: Piece): Array<[number, number]> {
  if (piece.king) {
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }
  // "b" starts at the top and moves down; "r" moves up.
  const forward = piece.side === "b" ? 1 : -1;
  return [
    [forward, -1],
    [forward, 1],
  ];
}

function jumpsFrom(board: Board, from: number): Move[] {
  const piece = board[from];
  if (!piece) return [];
  const moves: Move[] = [];
  const r = rowOf(from);
  const c = colOf(from);

  for (const [dr, dc] of directions(piece)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + dr * 2;
    const lc = c + dc * 2;
    if (!inBounds(lr, lc)) continue;
    const mid = board[idx(mr, mc)];
    const landing = board[idx(lr, lc)];
    if (mid && mid.side !== piece.side && !landing) {
      moves.push({ from, to: idx(lr, lc), captured: idx(mr, mc) });
    }
  }
  return moves;
}

function stepsFrom(board: Board, from: number): Move[] {
  const piece = board[from];
  if (!piece) return [];
  const moves: Move[] = [];
  const r = rowOf(from);
  const c = colOf(from);
  for (const [dr, dc] of directions(piece)) {
    const nr = r + dr;
    const nc = c + dc;
    if (inBounds(nr, nc) && !board[idx(nr, nc)]) {
      moves.push({ from, to: idx(nr, nc), captured: null });
    }
  }
  return moves;
}

/** Every legal move for a side. If any capture exists, only captures are legal. */
export function legalMoves(board: Board, side: Side): Move[] {
  const jumps: Move[] = [];
  const steps: Move[] = [];
  for (let i = 0; i < 64; i += 1) {
    const piece = board[i];
    if (!piece || piece.side !== side) continue;
    jumps.push(...jumpsFrom(board, i));
    steps.push(...stepsFrom(board, i));
  }
  return jumps.length > 0 ? jumps : steps;
}

export function movesForPiece(board: Board, from: number): Move[] {
  const piece = board[from];
  if (!piece) return [];
  // Respect the forced-capture rule from the whole-board perspective.
  const all = legalMoves(board, piece.side);
  return all.filter((m) => m.from === from);
}

export interface ApplyResult {
  board: Board;
  /** When a jump can chain, the same piece keeps the turn. */
  continues: boolean;
  side: Side;
}

export function applyMove(board: Board, move: Move): ApplyResult {
  const next = board.slice();
  const piece = next[move.from];
  if (!piece) return { board, continues: false, side: "r" };

  next[move.to] = piece;
  next[move.from] = null;
  if (move.captured !== null) next[move.captured] = null;

  // Crown on reaching the far row.
  const row = rowOf(move.to);
  let crowned = piece;
  if (!piece.king && ((piece.side === "b" && row === 7) || (piece.side === "r" && row === 0))) {
    crowned = { ...piece, king: true };
    next[move.to] = crowned;
  }

  const canChain =
    move.captured !== null && !(!piece.king && crowned.king) && jumpsFrom(next, move.to).length > 0;

  return { board: next, continues: canChain, side: piece.side };
}

export function countPieces(board: Board, side: Side): number {
  return board.reduce((n, cell) => (cell?.side === side ? n + 1 : n), 0);
}

/** A side with no pieces or no legal move has lost. */
export function winner(board: Board, toMove: Side): Side | null {
  const other: Side = toMove === "r" ? "b" : "r";
  if (countPieces(board, toMove) === 0) return other;
  if (legalMoves(board, toMove).length === 0) return other;
  return null;
}
