// Chinese checkers: a six-pointed star of 121 holes, a triangle of ten
// marbles in each point that plays, and the race to fill the point across
// the board. A marble steps to a hole next to it, or hops over a marble --
// anyone's -- into the hole beyond, and may keep hopping as long as there
// are hops to make.
//
// The board is a hex grid in cube coordinates: (q, r, s) with q + r + s = 0.
// The star is every hole that lies in either of two big triangles -- all
// coordinates at least -4, or all at most 4 -- and a point of the star is
// where one coordinate runs past 4 either way.

export type Corner = "c0" | "c1" | "c2" | "c3" | "c4" | "c5";
export const CORNERS: Corner[] = ["c0", "c1", "c2", "c3", "c4", "c5"];

/** Clockwise from the top. */
export const CORNER_NAME: Record<Corner, string> = {
  c0: "red",
  c1: "orange",
  c2: "yellow",
  c3: "green",
  c4: "blue",
  c5: "purple",
};

export const CORNER_TINT: Record<Corner, string> = {
  c0: "#e0564f",
  c1: "#f0913a",
  c2: "#f2cf45",
  c3: "#3fae6a",
  c4: "#4a86e0",
  c5: "#9b6ad6",
};

export type PlayerCount = 2 | 3 | 4 | 6;

/** Which points play, for each size of table. Three players take every other point, so their targets are empty. */
export const PLAYING: Record<PlayerCount, Corner[]> = {
  2: ["c0", "c3"],
  3: ["c0", "c2", "c4"],
  4: ["c1", "c2", "c4", "c5"],
  6: ["c0", "c1", "c2", "c3", "c4", "c5"],
};

export const opposite = (c: Corner): Corner => CORNERS[(CORNERS.indexOf(c) + 3) % 6];

export type Hole = string; // "q,r"
export const hole = (q: number, r: number): Hole => `${q},${r}`;
export const coords = (h: Hole): [number, number] => h.split(",").map(Number) as [number, number];

/** Which point of the star a hole is in, or null for the middle. */
export function cornerOf(h: Hole): Corner | null {
  const [q, r] = coords(h);
  const s = -q - r;
  if (r < -4) return "c0";
  if (q > 4) return "c1";
  if (s < -4) return "c2";
  if (r > 4) return "c3";
  if (q < -4) return "c4";
  if (s > 4) return "c5";
  return null;
}

/** Every hole on the board. */
export const HOLES: Hole[] = (() => {
  const out: Hole[] = [];
  for (let q = -8; q <= 8; q += 1) {
    for (let r = -8; r <= 8; r += 1) {
      const s = -q - r;
      const low = Math.min(q, r, s) >= -4;
      const high = Math.max(q, r, s) <= 4;
      if (low || high) out.push(hole(q, r));
    }
  }
  return out;
})();

const ON_BOARD = new Set(HOLES);
export const isHole = (h: Hole) => ON_BOARD.has(h);

/** The ten holes of a point. */
export const pointOf = (c: Corner): Hole[] => HOLES.filter((h) => cornerOf(h) === c);

const DIRS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

export interface ChineseState {
  players: PlayerCount;
  /** Who sits at each point that plays: a name, or nobody yet. */
  seats: Partial<Record<Corner, string | null>>;
  /** Marbles, by hole. */
  board: Record<Hole, Corner>;
  turn: Corner;
  /** The last move, for showing where it went. */
  last: { from: Hole; path: Hole[]; n: number } | null;
  winner: Corner | null;
  wins: Partial<Record<Corner, number>>;
}

export function setUp(players: PlayerCount, keep?: Pick<ChineseState, "seats" | "wins">): ChineseState {
  const board: Record<Hole, Corner> = {};
  for (const c of PLAYING[players]) for (const h of pointOf(c)) board[h] = c;
  const seats: Partial<Record<Corner, string | null>> = {};
  for (const c of PLAYING[players]) seats[c] = keep?.seats[c] ?? null;
  return { players, seats, board, turn: PLAYING[players][0], last: null, winner: null, wins: keep?.wins ?? {} };
}

export const emptyChinese = (): ChineseState => setUp(3);

/** Where a marble can go from `from`: single steps, and everywhere a chain of hops reaches, with the way there. */
export function reach(board: Record<Hole, Corner>, from: Hole): Map<Hole, Hole[]> {
  const out = new Map<Hole, Hole[]>();
  const [q, r] = coords(from);
  for (const [dq, dr] of DIRS) {
    const to = hole(q + dq, r + dr);
    if (isHole(to) && !board[to]) out.set(to, [to]);
  }
  // Hops, breadth first so each hole is reached by the fewest hops.
  const queue: Array<{ at: Hole; path: Hole[] }> = [{ at: from, path: [] }];
  const seen = new Set<Hole>([from]);
  while (queue.length) {
    const { at, path } = queue.shift()!;
    const [aq, ar] = coords(at);
    for (const [dq, dr] of DIRS) {
      const over = hole(aq + dq, ar + dr);
      const land = hole(aq + 2 * dq, ar + 2 * dr);
      if (!board[over] || !isHole(land) || board[land] || seen.has(land)) continue;
      seen.add(land);
      const next = [...path, land];
      if (!out.has(land)) out.set(land, next);
      queue.push({ at: land, path: next });
    }
  }
  return out;
}

/** Whether every marble of a point has reached the point across the board. */
export function home(board: Record<Hole, Corner>, c: Corner): boolean {
  return pointOf(opposite(c)).every((h) => board[h] === c);
}

/** The next point to play, going round clockwise. */
export function nextTurn(state: ChineseState, from: Corner): Corner {
  const order = PLAYING[state.players];
  return order[(order.indexOf(from) + 1) % order.length];
}

/** Moves a marble, if it may go there. Returns the state unchanged if not. */
export function move(state: ChineseState, from: Hole, to: Hole): ChineseState {
  if (state.winner || state.board[from] !== state.turn) return state;
  const path = reach(state.board, from).get(to);
  if (!path) return state;
  const board = { ...state.board };
  delete board[from];
  board[to] = state.turn;
  const won = home(board, state.turn);
  return {
    ...state,
    board,
    turn: won ? state.turn : nextTurn(state, state.turn),
    last: { from, path, n: (state.last?.n ?? 0) + 1 },
    winner: won ? state.turn : null,
    wins: won ? { ...state.wins, [state.turn]: (state.wins[state.turn] ?? 0) + 1 } : state.wins,
  };
}

/** A turn nobody can use: nothing of theirs can move. */
export function stuck(state: ChineseState): boolean {
  return Object.entries(state.board).every(([h, c]) => c !== state.turn || reach(state.board, h).size === 0);
}

export function pass(state: ChineseState): ChineseState {
  return { ...state, turn: nextTurn(state, state.turn) };
}

/** Where a hole sits on screen, in units of one hole's spacing: pointy side up. */
export function place(h: Hole): [number, number] {
  const [q, r] = coords(h);
  return [q + r / 2, (r * Math.sqrt(3)) / 2];
}
