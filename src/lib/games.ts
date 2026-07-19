import type { ConnectFourState, TicTacToeState } from "./types";

// ---------------------------------------------------------------------------
// Tic tac toe
// ---------------------------------------------------------------------------

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export interface TicTacToeOutcome {
  winner: "x" | "o" | null;
  line: number[] | null;
  draw: boolean;
}

export function evaluateTicTacToe(board: (string | null)[]): TicTacToeOutcome {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as "x" | "o", line, draw: false };
    }
  }
  const full = board.every((cell) => cell !== null);
  return { winner: null, line: null, draw: full };
}

export function resetTicTacToe(state: TicTacToeState, startWith: "x" | "o"): TicTacToeState {
  return { ...state, board: Array(9).fill(null), turn: startWith };
}

// ---------------------------------------------------------------------------
// Connect four
// ---------------------------------------------------------------------------

export const C4_COLUMNS = 7;
export const C4_ROWS = 6;

export interface ConnectFourOutcome {
  winner: "r" | "y" | null;
  cells: Array<[number, number]> | null;
  draw: boolean;
}

function discAt(columns: (string | null)[][], col: number, row: number): string | null {
  if (col < 0 || col >= C4_COLUMNS || row < 0 || row >= C4_ROWS) return null;
  return columns[col][row] ?? null;
}

export function evaluateConnectFour(columns: (string | null)[][]): ConnectFourOutcome {
  const directions: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  for (let col = 0; col < C4_COLUMNS; col += 1) {
    for (let row = 0; row < C4_ROWS; row += 1) {
      const seed = discAt(columns, col, row);
      if (!seed) continue;

      for (const [dc, dr] of directions) {
        const cells: Array<[number, number]> = [[col, row]];
        for (let step = 1; step < 4; step += 1) {
          if (discAt(columns, col + dc * step, row + dr * step) !== seed) break;
          cells.push([col + dc * step, row + dr * step]);
        }
        if (cells.length === 4) {
          return { winner: seed as "r" | "y", cells, draw: false };
        }
      }
    }
  }

  const full = columns.every((column) => column.length >= C4_ROWS);
  return { winner: null, cells: null, draw: full };
}

export function dropDisc(
  columns: (string | null)[][],
  col: number,
  disc: "r" | "y",
): (string | null)[][] | null {
  if (col < 0 || col >= C4_COLUMNS) return null;
  if (columns[col].length >= C4_ROWS) return null;

  return columns.map((column, index) => (index === col ? [...column, disc] : [...column]));
}

export function resetConnectFour(
  state: ConnectFourState,
  startWith: "r" | "y",
): ConnectFourState {
  return {
    ...state,
    columns: Array.from({ length: C4_COLUMNS }, () => [] as (string | null)[]),
    turn: startWith,
  };
}
