// Reversi (Othello). Eight by eight, black and white. A disc has to be put
// down so it closes off a line of the other colour -- straight or diagonal --
// and everything it closes off turns over. No move, and your turn passes;
// neither of you can move, and the most discs wins.

export type Disc = "b" | "w";
export type Cell = Disc | null;

export const SIZE = 8;

export interface ReversiState {
  board: Cell[];
  turn: Disc;
  seats: { b: string | null; w: string | null };
  wins: { b: number; w: number; draw: number };
  /** The last move, and what it turned over, so every screen can flip them once. */
  last: { at: number; flipped: number[]; n: number; passed?: boolean } | null;
  over: boolean;
}

const DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function initialBoard(): Cell[] {
  const board: Cell[] = Array(SIZE * SIZE).fill(null);
  board[3 * SIZE + 3] = "w";
  board[3 * SIZE + 4] = "b";
  board[4 * SIZE + 3] = "b";
  board[4 * SIZE + 4] = "w";
  return board;
}

export function emptyReversi(): ReversiState {
  return { board: initialBoard(), turn: "b", seats: { b: null, w: null }, wins: { b: 0, w: 0, draw: 0 }, last: null, over: false };
}

export const other = (d: Disc): Disc => (d === "b" ? "w" : "b");

/** What putting a disc here would turn over; empty when it is not a move. */
export function flipsFor(board: Cell[], at: number, disc: Disc): number[] {
  if (board[at]) return [];
  const x0 = at % SIZE;
  const y0 = Math.floor(at / SIZE);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const line: number[] = [];
    let x = x0 + dx;
    let y = y0 + dy;
    while (x >= 0 && y >= 0 && x < SIZE && y < SIZE && board[y * SIZE + x] === other(disc)) {
      line.push(y * SIZE + x);
      x += dx;
      y += dy;
    }
    if (line.length && x >= 0 && y >= 0 && x < SIZE && y < SIZE && board[y * SIZE + x] === disc) out.push(...line);
  }
  return out;
}

export const movesFor = (board: Cell[], disc: Disc) => board.map((_, i) => i).filter((i) => flipsFor(board, i, disc).length > 0);

export function count(board: Cell[]): { b: number; w: number } {
  return { b: board.filter((c) => c === "b").length, w: board.filter((c) => c === "w").length };
}

/** A disc put down. The turn passes to whoever can move next; nobody able to, and it is over. */
export function play(state: ReversiState, at: number): ReversiState {
  if (state.over) return state;
  const flipped = flipsFor(state.board, at, state.turn);
  if (!flipped.length) return state;
  const board = [...state.board];
  board[at] = state.turn;
  for (const i of flipped) board[i] = state.turn;
  const n = (state.last?.n ?? 0) + 1;
  const next = other(state.turn);
  if (movesFor(board, next).length) return { ...state, board, turn: next, last: { at, flipped, n } };
  if (movesFor(board, state.turn).length) return { ...state, board, turn: state.turn, last: { at, flipped, n, passed: true } };
  const { b, w } = count(board);
  const winner = b > w ? "b" : w > b ? "w" : "draw";
  return { ...state, board, last: { at, flipped, n }, over: true, wins: { ...state.wins, [winner]: state.wins[winner] + 1 } };
}

export function restart(state: ReversiState): ReversiState {
  return { ...emptyReversi(), seats: state.seats, wins: state.wins };
}
