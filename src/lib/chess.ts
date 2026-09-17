// Chess with the rules that actually decide games: check, checkmate, stalemate,
// castling, en passant and promotion. Moves that would leave your own king
// attacked are not offered, so the board can never reach an illegal position.

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
  color: Color;
  type: PieceType;
}

export type Cell = Piece | null;
export type Board = Cell[]; // 64 cells, index = row * 8 + col, row 0 = black back rank

/** Which castles are still available to each side. */
export interface Castling {
  wk: boolean;
  wq: boolean;
  bk: boolean;
  bq: boolean;
}

/** Everything a position needs beyond the pieces themselves. */
export interface Context {
  castling: Castling;
  /** Square a pawn just skipped over, capturable en passant this turn. */
  ep: number | null;
}

const idx = (r: number, c: number) => r * 8 + c;
const rowOf = (i: number) => Math.floor(i / 8);
const colOf = (i: number) => i % 8;
const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const HOME = {
  w: { king: idx(7, 4), kRook: idx(7, 7), qRook: idx(7, 0), back: 7 },
  b: { king: idx(0, 4), kRook: idx(0, 7), qRook: idx(0, 0), back: 0 },
} as const;

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

export function initialCastling(): Castling {
  return { wk: true, wq: true, bk: true, bq: true };
}

/**
 * Castling rights for a board we were handed without any. Assumes a right
 * survives only while the king and that rook are still sitting at home, which
 * is right for a fresh board and safely conservative for a game in progress.
 */
export function castlingFromBoard(board: Board): Castling {
  const home = (i: number, color: Color, type: PieceType) =>
    board[i]?.color === color && board[i]?.type === type;

  const wKing = home(HOME.w.king, "w", "k");
  const bKing = home(HOME.b.king, "b", "k");
  return {
    wk: wKing && home(HOME.w.kRook, "w", "r"),
    wq: wKing && home(HOME.w.qRook, "w", "r"),
    bk: bKing && home(HOME.b.kRook, "b", "r"),
    bq: bKing && home(HOME.b.qRook, "b", "r"),
  };
}

function ctx(board: Board, given?: Partial<Context>): Context {
  return {
    castling: given?.castling ?? castlingFromBoard(board),
    ep: given?.ep ?? null,
  };
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

export function findKing(board: Board, color: Color): number {
  return board.findIndex((p) => p?.color === color && p.type === "k");
}

/** Is `square` attacked by any piece of `by`? Ignores pins and turn order. */
export function isAttacked(board: Board, square: number, by: Color): boolean {
  if (square < 0) return false;
  const r = rowOf(square);
  const c = colOf(square);

  for (const [dr, dc] of KNIGHT) {
    const p = inB(r + dr, c + dc) ? board[idx(r + dr, c + dc)] : null;
    if (p && p.color === by && p.type === "n") return true;
  }

  // A pawn of `by` attacks forward, so it sits one rank behind this square.
  const pawnRow = by === "w" ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const p = inB(pawnRow, c + dc) ? board[idx(pawnRow, c + dc)] : null;
    if (p && p.color === by && p.type === "p") return true;
  }

  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const p = inB(r + dr, c + dc) ? board[idx(r + dr, c + dc)] : null;
      if (p && p.color === by && p.type === "k") return true;
    }
  }

  for (const [dr, dc] of SLIDES.q) {
    const diagonal = dr !== 0 && dc !== 0;
    let rr = r + dr;
    let cc = c + dc;
    while (inB(rr, cc)) {
      const p = board[idx(rr, cc)];
      if (p) {
        if (p.color === by && (p.type === "q" || p.type === (diagonal ? "b" : "r"))) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  return false;
}

export function inCheck(board: Board, color: Color): boolean {
  return isAttacked(board, findKing(board, color), color === "w" ? "b" : "w");
}

/** Moves by piece shape only, before checking what it does to your own king. */
function pseudoMoves(board: Board, from: number, ep: number | null): number[] {
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
    if (inB(r + dir, c) && !board[idx(r + dir, c)]) {
      out.push(idx(r + dir, c));
      if (r === startRow && !board[idx(r + 2 * dir, c)]) out.push(idx(r + 2 * dir, c));
    }
    for (const dc of [-1, 1]) {
      const rr = r + dir;
      const cc = c + dc;
      if (!inB(rr, cc)) continue;
      const target = board[idx(rr, cc)];
      if (target && target.color !== piece.color) out.push(idx(rr, cc));
      else if (!target && ep !== null && idx(rr, cc) === ep) out.push(ep);
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

/**
 * Castle destinations for the king on `from`. You may not castle out of check,
 * through an attacked square, or into one, and the path must be clear.
 */
function castleMoves(board: Board, from: number, castling: Castling): number[] {
  const king = board[from];
  if (!king || king.type !== "k") return [];
  const color = king.color;
  const home = HOME[color];
  if (from !== home.king) return [];

  const enemy = color === "w" ? "b" : "w";
  if (isAttacked(board, from, enemy)) return [];

  const out: number[] = [];
  const back = home.back;
  const rookAt = (i: number) => board[i]?.color === color && board[i]?.type === "r";
  const empty = (...cols: number[]) => cols.every((c) => !board[idx(back, c)]);
  const safe = (...cols: number[]) => cols.every((c) => !isAttacked(board, idx(back, c), enemy));

  if ((color === "w" ? castling.wk : castling.bk) && rookAt(home.kRook)) {
    if (empty(5, 6) && safe(5, 6)) out.push(idx(back, 6));
  }
  if ((color === "w" ? castling.wq : castling.bq) && rookAt(home.qRook)) {
    if (empty(1, 2, 3) && safe(2, 3)) out.push(idx(back, 2));
  }
  return out;
}

/** Every square this piece may legally reach, self-check already ruled out. */
export function legalMoves(board: Board, from: number, given?: Partial<Context>): number[] {
  const piece = board[from];
  if (!piece) return [];
  const c = ctx(board, given);

  const candidates = [
    ...pseudoMoves(board, from, c.ep),
    ...(piece.type === "k" ? castleMoves(board, from, c.castling) : []),
  ];

  return candidates.filter((to) => {
    const after = applyMove(board, from, to, c).board;
    return !inCheck(after, piece.color);
  });
}

export interface ChessMoveResult {
  board: Board;
  captured: Piece | null;
  castling: Castling;
  /** Square skipped by a double pawn step, for the opponent's next turn. */
  ep: number | null;
  castled: boolean;
  enPassant: boolean;
  promoted: boolean;
}

export function applyMove(
  board: Board,
  from: number,
  to: number,
  given?: Partial<Context>,
): ChessMoveResult {
  const before = ctx(board, given);
  const piece = board[from];
  if (!piece) {
    return {
      board,
      captured: null,
      castling: before.castling,
      ep: null,
      castled: false,
      enPassant: false,
      promoted: false,
    };
  }

  const next = board.slice();
  let captured = next[to];
  let enPassant = false;
  let castled = false;
  let promoted = false;

  next[to] = piece;
  next[from] = null;

  if (piece.type === "p") {
    // Taking en passant removes a pawn that is not on the landing square.
    if (before.ep !== null && to === before.ep && colOf(from) !== colOf(to)) {
      const grave = idx(rowOf(from), colOf(to));
      captured = next[grave];
      next[grave] = null;
      enPassant = true;
    }
    const rank = rowOf(to);
    if ((piece.color === "w" && rank === 0) || (piece.color === "b" && rank === 7)) {
      next[to] = { color: piece.color, type: "q" };
      promoted = true;
    }
  }

  if (piece.type === "k" && Math.abs(colOf(to) - colOf(from)) === 2) {
    const back = rowOf(from);
    const kingside = colOf(to) === 6;
    const rookFrom = idx(back, kingside ? 7 : 0);
    const rookTo = idx(back, kingside ? 5 : 3);
    next[rookTo] = next[rookFrom];
    next[rookFrom] = null;
    castled = true;
  }

  const castling = { ...before.castling };
  if (piece.type === "k") {
    if (piece.color === "w") {
      castling.wk = false;
      castling.wq = false;
    } else {
      castling.bk = false;
      castling.bq = false;
    }
  }
  // A rook that leaves home, or is taken at home, kills that side's castle.
  for (const [square, key] of [
    [HOME.w.kRook, "wk"],
    [HOME.w.qRook, "wq"],
    [HOME.b.kRook, "bk"],
    [HOME.b.qRook, "bq"],
  ] as const) {
    if (from === square || to === square) castling[key] = false;
  }

  let ep: number | null = null;
  if (piece.type === "p" && Math.abs(rowOf(to) - rowOf(from)) === 2) {
    ep = idx((rowOf(from) + rowOf(to)) / 2, colOf(from));
  }

  return { board: next, captured, castling, ep, castled, enPassant, promoted };
}

/** Every legal move available to a side, as from/to pairs. */
export function allMoves(
  board: Board,
  color: Color,
  given?: Partial<Context>,
): Array<{ from: number; to: number }> {
  const c = ctx(board, given);
  const out: Array<{ from: number; to: number }> = [];
  for (let i = 0; i < 64; i += 1) {
    if (board[i]?.color !== color) continue;
    for (const to of legalMoves(board, i, c)) out.push({ from: i, to });
  }
  return out;
}

export type Outcome =
  | { kind: "playing"; check: boolean }
  | { kind: "checkmate"; winner: Color }
  | { kind: "stalemate" }
  | { kind: "dead" };

/** Where the game stands for the side about to move. */
export function outcome(board: Board, turn: Color, given?: Partial<Context>): Outcome {
  if (findKing(board, turn) < 0) return { kind: "dead" };

  const check = inCheck(board, turn);
  if (allMoves(board, turn, given).length > 0) return { kind: "playing", check };
  if (check) return { kind: "checkmate", winner: turn === "w" ? "b" : "w" };
  return { kind: "stalemate" };
}

/** A side with no king left has lost. Kept for boards saved before check existed. */
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
