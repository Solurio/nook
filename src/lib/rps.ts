// Rock paper scissors, for two or more. Everyone throws in secret -- each
// throw a sealed pile that only turns over once the last one is in -- so
// nobody waits to see what the others did, and nobody's phone knows early.
//
// With more than two, a round only has a winner when exactly two shapes are
// thrown: all three, or everyone the same, and it goes again.

export type Shape = "R" | "P" | "S";

export const SHAPES: Shape[] = ["R", "P", "S"];
export const BEATS: Record<Shape, Shape> = { R: "S", P: "R", S: "P" };
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
export const HISTORY = 12;

export const throwSlot = (round: number, chair: string) => `throw:${round}:${chair}`;

export interface RpsRound {
  round: number;
  throws: Record<string, Shape>;
  winners: string[];
}

export interface RpsState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** Zero plays for ever; otherwise the first to this many rounds takes the match. */
  firstTo: number;
  /** 0 before the first match starts. */
  round: number;
  /** Who is throwing this match: whoever was sitting when it started. */
  playing: string[];
  scores: Record<string, number>;
  history: RpsRound[];
  winner?: string;
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyRps(seatCount = 2): RpsState {
  return { version: 1, seats: {}, holders: {}, seatCount, firstTo: 3, round: 0, playing: [], scores: {}, history: [] };
}

export function winnersOf(throws: Record<string, Shape>): string[] {
  const shapes = new Set(Object.values(throws));
  if (shapes.size !== 2) return [];
  const [a, b] = [...shapes];
  const top = BEATS[a] === b ? a : b;
  return Object.keys(throws).filter((chair) => throws[chair] === top);
}

/** Everyone's throw for a round, once they have all been turned over. */
export function readThrows(
  revealed: Record<string, unknown[]> | undefined,
  round: number,
  chairs: string[],
): Record<string, Shape> | null {
  if (!revealed || chairs.length === 0) return null;
  const out: Record<string, Shape> = {};
  for (const chair of chairs) {
    const shape = revealed[throwSlot(round, chair)]?.[0];
    if (shape !== "R" && shape !== "P" && shape !== "S") return null;
    out[chair] = shape;
  }
  return out;
}

export function startMatch(state: RpsState, chairs: string[]): RpsState {
  return {
    ...state,
    round: state.round + 1,
    playing: chairs,
    scores: Object.fromEntries(chairs.map((c) => [c, 0])),
    history: [],
    winner: undefined,
  };
}

/** Scores a round that has been turned over, and moves on to the next. */
export function scoreRound(state: RpsState, throws: Record<string, Shape>): RpsState {
  const winners = winnersOf(throws);
  const scores = { ...state.scores };
  for (const chair of winners) scores[chair] = (scores[chair] ?? 0) + 1;
  const done = state.firstTo > 0 ? state.playing.find((c) => scores[c] >= state.firstTo) : undefined;
  return {
    ...state,
    scores,
    history: [{ round: state.round, throws, winners }, ...state.history].slice(0, HISTORY),
    round: state.round + 1,
    ...(done ? { winner: done } : {}),
  };
}
