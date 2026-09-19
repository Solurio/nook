// Quoridor -- sold in Brazil as Bloqueio. A 9x9 board, a pawn each, and
// twenty walls shared out: ten each for two players, five each for four. On
// your turn you either step your pawn one square or put down a wall to slow
// somebody else. First pawn to reach the far side wins.
//
// Walls are two squares long and sit in the grooves between squares. They may
// not overlap or cross, and none may shut a pawn off from its goal entirely.
// Pawns face to face can jump each other; with a wall or the edge (or, with
// four, another pawn) behind the one being jumped, the jump turns aside
// instead, diagonally.
//
// Nothing here is secret: it is all on the board.

export const SIZE = 9;
/** Walls sit on the 8x8 points where grooves cross; x and y name the square to the upper left. */
export const POINTS = SIZE - 1;
export const TOTAL_WALLS = 20;

export type Orientation = "h" | "v";

export interface Cell {
  x: number;
  y: number;
}

/**
 * A wall, by the square to the upper left of its middle. Lying flat ("h") it
 * runs under squares (x, y) and (x+1, y); standing ("v") it runs to the right
 * of squares (x, y) and (x, y+1).
 */
export interface Wall extends Cell {
  o: Orientation;
}

/** Where a pawn starts, and so which way it is going. */
export type Side = "bottom" | "left" | "top" | "right";

export const SIDE_START: Record<Side, Cell> = {
  bottom: { x: 4, y: 8 },
  left: { x: 0, y: 4 },
  top: { x: 4, y: 0 },
  right: { x: 8, y: 4 },
};

/** How many quarter turns the board is given so this side sits at the bottom. */
export const SIDE_TURN: Record<Side, number> = { bottom: 0, left: -90, top: 180, right: 90 };

export const reached = (side: Side, cell: Cell) =>
  side === "bottom" ? cell.y === 0 : side === "top" ? cell.y === SIZE - 1 : side === "left" ? cell.x === SIZE - 1 : cell.x === 0;

/** Chairs in the order they play -- round the board clockwise from the bottom. */
export function chairsFor(players: number): string[] {
  return players === 4 ? ["s0", "s1", "s2", "s3"] : ["s0", "s1"];
}

export function sideOf(players: number, chair: string): Side {
  if (players === 4) return (["bottom", "left", "top", "right"] as Side[])[Number(chair.slice(1))] ?? "bottom";
  return chair === "s1" ? "top" : "bottom";
}

export interface QuoridorState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  players: 2 | 4;
  phase: "play" | "over";
  pawns: Record<string, Cell>;
  walls: Array<Wall & { by?: string }>;
  left: Record<string, number>;
  turn: string;
  /** Moves made this game; the number of players can only change before the first. */
  moves: number;
  last: { chair: string; from?: Cell; to?: Cell; wall?: Wall } | null;
  winner?: string;
  /** Who opens; passed round the table from one game to the next. */
  opener: string;
  wins: Record<string, number>;
}

/** A board set up and ready: pawns at home, walls shared out. */
export function newGame(players: 2 | 4, keep?: Partial<QuoridorState>, opener = "s0"): QuoridorState {
  const chairs = chairsFor(players);
  const each = TOTAL_WALLS / chairs.length;
  return {
    version: 1,
    seats: keep?.seats ?? {},
    holders: keep?.holders ?? {},
    players,
    phase: "play",
    pawns: Object.fromEntries(chairs.map((c) => [c, { ...SIDE_START[sideOf(players, c)] }])),
    walls: [],
    left: Object.fromEntries(chairs.map((c) => [c, each])),
    turn: chairs.includes(opener) ? opener : "s0",
    moves: 0,
    last: null,
    opener: chairs.includes(opener) ? opener : "s0",
    wins: keep?.wins ?? {},
  };
}

export const emptyQuoridor = (players: 2 | 4 = 2) => newGame(players);

const inside = (c: Cell) => c.x >= 0 && c.y >= 0 && c.x < SIZE && c.y < SIZE;
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

const DIRS: Cell[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Whether a wall stands between two neighbouring squares. */
export function blocked(walls: readonly Wall[], a: Cell, b: Cell): boolean {
  const has = (w: Wall) => walls.some((x) => x.x === w.x && x.y === w.y && x.o === w.o);
  if (a.x === b.x) {
    const y = Math.min(a.y, b.y);
    return has({ x: a.x, y, o: "h" }) || has({ x: a.x - 1, y, o: "h" });
  }
  const x = Math.min(a.x, b.x);
  return has({ x, y: a.y, o: "v" }) || has({ x, y: a.y - 1, o: "v" });
}

/** The squares a pawn could step to with no other pawns about: open, on the board. */
function steps(walls: readonly Wall[], from: Cell): Cell[] {
  return DIRS.map((d) => ({ x: from.x + d.x, y: from.y + d.y })).filter((n) => inside(n) && !blocked(walls, from, n));
}

/** Whether a pawn could still get home, pawns aside, past these walls. */
export function hasPath(walls: readonly Wall[], from: Cell, side: Side): boolean {
  const seen = new Set<string>([`${from.x},${from.y}`]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const cell = queue.shift() as Cell;
    if (reached(side, cell)) return true;
    for (const n of steps(walls, cell)) {
      const k = `${n.x},${n.y}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return false;
}

/** Fewest steps home, pawns aside -- for showing who is ahead. Infinity when shut off. */
export function distanceHome(walls: readonly Wall[], from: Cell, side: Side): number {
  const seen = new Map<string, number>([[`${from.x},${from.y}`, 0]]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const cell = queue.shift() as Cell;
    const d = seen.get(`${cell.x},${cell.y}`) as number;
    if (reached(side, cell)) return d;
    for (const n of steps(walls, cell)) {
      const k = `${n.x},${n.y}`;
      if (!seen.has(k)) {
        seen.set(k, d + 1);
        queue.push(n);
      }
    }
  }
  return Infinity;
}

const playing = (state: QuoridorState) => chairsFor(state.players);

/** Where a pawn may go this turn, jumps included. */
export function pawnMoves(state: QuoridorState, chair: string): Cell[] {
  const at = state.pawns[chair];
  if (!at) return [];
  const others = playing(state)
    .filter((c) => c !== chair)
    .map((c) => state.pawns[c])
    .filter(Boolean);
  const taken = (c: Cell) => others.some((o) => same(o, c));
  const out: Cell[] = [];
  const add = (c: Cell) => {
    if (!out.some((o) => same(o, c))) out.push(c);
  };
  for (const d of DIRS) {
    const next = { x: at.x + d.x, y: at.y + d.y };
    if (!inside(next) || blocked(state.walls, at, next)) continue;
    if (!taken(next)) {
      add(next);
      continue;
    }
    // Face to face: straight over, or -- when that is shut -- aside.
    const over = { x: next.x + d.x, y: next.y + d.y };
    if (inside(over) && !blocked(state.walls, next, over) && !taken(over)) {
      add(over);
      continue;
    }
    for (const side of [
      { x: d.y, y: d.x },
      { x: -d.y, y: -d.x },
    ]) {
      const aside = { x: next.x + side.x, y: next.y + side.y };
      if (inside(aside) && !blocked(state.walls, next, aside) && !taken(aside)) add(aside);
    }
  }
  return out;
}

/** Why a wall cannot go here, if it cannot. */
export function wallProblem(state: QuoridorState, chair: string, wall: Wall): string | null {
  if (state.phase !== "play") return "the game is over";
  if (!(wall.x >= 0 && wall.y >= 0 && wall.x < POINTS && wall.y < POINTS)) return "off the board";
  if ((state.left[chair] ?? 0) <= 0) return "no walls left";
  for (const w of state.walls) {
    if (w.x === wall.x && w.y === wall.y) return w.o === wall.o ? "there is a wall there" : "walls cannot cross";
    if (w.o === wall.o && wall.o === "h" && w.y === wall.y && Math.abs(w.x - wall.x) === 1) return "walls cannot overlap";
    if (w.o === wall.o && wall.o === "v" && w.x === wall.x && Math.abs(w.y - wall.y) === 1) return "walls cannot overlap";
  }
  const walls = [...state.walls, wall];
  for (const c of playing(state)) {
    if (!hasPath(walls, state.pawns[c], sideOf(state.players, c))) return "that would shut someone in";
  }
  return null;
}

const nextChair = (state: QuoridorState, chair: string) => {
  const chairs = playing(state);
  return chairs[(chairs.indexOf(chair) + 1) % chairs.length];
};

export function movePawn(state: QuoridorState, to: Cell): QuoridorState {
  if (state.phase !== "play") return state;
  const chair = state.turn;
  if (!pawnMoves(state, chair).some((c) => same(c, to))) return state;
  const from = state.pawns[chair];
  const next: QuoridorState = {
    ...state,
    pawns: { ...state.pawns, [chair]: { ...to } },
    moves: state.moves + 1,
    last: { chair, from, to },
  };
  if (reached(sideOf(state.players, chair), to)) {
    return { ...next, phase: "over", winner: chair, wins: { ...state.wins, [chair]: (state.wins[chair] ?? 0) + 1 } };
  }
  return { ...next, turn: nextChair(state, chair) };
}

export function placeWall(state: QuoridorState, wall: Wall): QuoridorState {
  const chair = state.turn;
  if (wallProblem(state, chair, wall)) return state;
  return {
    ...state,
    walls: [...state.walls, { x: wall.x, y: wall.y, o: wall.o, by: chair }],
    left: { ...state.left, [chair]: (state.left[chair] ?? 0) - 1 },
    moves: state.moves + 1,
    last: { chair, wall: { x: wall.x, y: wall.y, o: wall.o } },
    turn: nextChair(state, chair),
  };
}

/** Another game with the same people, the opening move passed on. */
export function again(state: QuoridorState): QuoridorState {
  const chairs = chairsFor(state.players);
  const opener = chairs[(chairs.indexOf(state.opener ?? "s0") + 1) % chairs.length];
  return newGame(state.players, state, opener);
}
