// Cards Against Humanity, played with the starter cards here, the table's own,
// or both. Each round one player is the czar and reads out a black card; the
// others answer from their hands of white cards, face down; the czar picks the
// funniest without knowing whose it is, and that player takes the point.
//
// What is secret: each hand, and each answer until everybody has answered. A
// hand is a pile only its player can read. An answer goes into a pile nobody
// can read, sealed to the round's other answers, so the database will only
// turn them over together. The black cards are public: knowing the next
// question helps nobody.

import { PACKS, type PackId } from "./cah-packs";

export const MIN_SEATS = 3;
export const MAX_SEATS = 10;
export const HAND = 10;
export const GOALS = [5, 7, 10];
/** Longest card the editor keeps, in characters. */
export const MAX_CARD = 160;
/** How many cards of each colour the table can write for itself. */
export const MAX_CUSTOM = 400;

export const WHITE_PILE = "whites";
export const handSlot = (chair: string) => `hand:${chair}`;
/** Named for the round, so what was turned over in one round never passes for the next. */
export const playSlot = (round: number, chair: string) => `play:${round}:${chair}`;
/** Put in for someone who never answered, so the rest are not kept waiting. */
export const SAT_OUT = "(sat this one out)";

export const BLANK = "____";

export interface CahState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  packs: PackId[];
  /** Shared decks picked for this table (0007_decks.sql), by id. */
  decks?: string[];
  /** Cards written straight onto this table, from before there were decks. */
  custom: { black: string[]; white: string[] };
  /** Points to win. */
  goal: number;
  order: string[];
  round: number;
  czar: string;
  /** Waiting for answers (and for them to be turned over), or the czar has picked. */
  step: "answer" | "picked";
  /** The black cards in the order they will come up, and where we are in them. */
  blacks: string[];
  blackAt: number;
  /** Mixes the order the answers are shown in, so it gives away nobody. */
  seed: number;
  /** Who won the round, once the czar has picked. */
  picked: string | null;
  points: Record<string, number>;
  /** Answers from rounds up to here have gone back into the deck. */
  recycled: number;
  champion?: string;
  wins: Record<string, number>;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function emptyCah(seatCount = 5): CahState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    phase: "idle",
    packs: ["en"],
    custom: { black: [], white: [] },
    goal: 7,
    order: [],
    round: 0,
    czar: "s0",
    step: "answer",
    blacks: [],
    blackAt: 0,
    seed: 0,
    picked: null,
    points: {},
    recycled: 0,
    wins: {},
    log: [],
  };
}

type Random = (max: number) => number;
type Name = (chair: string) => string;

const note = (log: string[], line: string) => [...log.slice(-30), line];

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** Any run of underscores is one blank, written the same way everywhere. */
export function normalizePrompt(text: string): string {
  return text.replace(/\s+/g, " ").replace(/_+/g, BLANK).trim();
}

export const blanks = (prompt: string) => prompt.split(BLANK).length - 1;

/** How many white cards a black card asks for: one per blank, and one when it has none. */
export const pickOf = (prompt: string | undefined) => Math.max(1, Math.min(3, blanks(prompt ?? "")));

/** Cards typed one to a line, tidied, without repeats or empty lines. */
export function parseCards(text: string, prompts = false): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const card = (prompts ? normalizePrompt(line) : line.replace(/\s+/g, " ").trim()).slice(0, MAX_CARD);
    if (!card || seen.has(card.toLowerCase())) continue;
    seen.add(card.toLowerCase());
    out.push(card);
  }
  return out.slice(0, MAX_CUSTOM);
}

/** Cards from somewhere else -- the shared decks -- fetched by whoever deals. */
export interface ExtraCards {
  black: string[];
  white: string[];
}

/** Every card the table will play with: the packs picked, the shared decks, and its own. */
export function decksFor(state: Pick<CahState, "packs" | "custom">, extra?: ExtraCards): { black: string[]; white: string[] } {
  const black = new Set<string>();
  const white = new Set<string>();
  extra?.black.forEach((c) => black.add(normalizePrompt(c)));
  extra?.white.forEach((c) => white.add(c));
  for (const id of state.packs) {
    const pack = PACKS[id];
    if (!pack) continue;
    pack.black.forEach((c) => black.add(normalizePrompt(c)));
    pack.white.forEach((c) => white.add(c));
  }
  state.custom.black.forEach((c) => black.add(normalizePrompt(c)));
  state.custom.white.forEach((c) => white.add(c));
  white.delete(SAT_OUT);
  return { black: [...black], white: [...white] };
}

/** Why a game cannot start with these cards, if it cannot. */
export function deckProblem(state: Pick<CahState, "packs" | "custom">, players: number, extra?: ExtraCards): string | null {
  const { black, white } = decksFor(state, extra);
  if (black.length < 1) return "there are no black cards: pick a pack or write a few";
  const need = players * HAND + players;
  if (white.length < need) return `${players} players need at least ${need} white cards; there are ${white.length}`;
  return null;
}

/**
 * The answer read into the question: each blank takes an answer, its full stop
 * dropped so the sentence reads on; a question with no blank has it after.
 */
export function fill(prompt: string, answers: string[]): Array<{ text: string; answer: boolean }> {
  const trim = (a: string) => a.replace(/[.!]+$/, "");
  const parts = prompt.split(BLANK);
  if (parts.length === 1) {
    return [
      { text: `${prompt} `, answer: false },
      ...answers.map((a) => ({ text: a, answer: true })),
    ];
  }
  const out: Array<{ text: string; answer: boolean }> = [];
  parts.forEach((part, i) => {
    if (part) out.push({ text: part, answer: false });
    if (i < parts.length - 1) out.push({ text: answers[i] ? trim(answers[i]) : BLANK, answer: Boolean(answers[i]) });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

export const promptOf = (state: CahState): string => state.blacks[state.blackAt] ?? "";

/** Everyone who answers this round: all but the czar. */
export const answering = (state: CahState) => state.order.filter((c) => c !== state.czar);

/**
 * A new game: the black cards shuffled into the open, a czar picked, and the
 * white cards handed to the database to shuffle and deal.
 */
export function startGame(
  state: CahState,
  chairs: string[],
  random: Random,
  name: Name = (c) => c,
  extra?: ExtraCards,
): { state: CahState; whites: string[] } | { problem: string } {
  const problem = deckProblem(state, chairs.length, extra);
  if (problem) return { problem };
  const { black, white } = decksFor(state, extra);
  const czar = chairs[random(chairs.length)];
  // Rounds count on from the last game, so no answer pile is ever named twice.
  const round = (state.round || 0) + 1;
  return {
    state: {
      ...state,
      phase: "play",
      order: [...chairs],
      round,
      czar,
      step: "answer",
      blacks: shuffle(black, random),
      blackAt: 0,
      seed: random(1_000_000),
      picked: null,
      points: Object.fromEntries(chairs.map((c) => [c, 0])),
      recycled: round - 1,
      champion: undefined,
      log: [`${name(czar)} is the first czar`],
    },
    whites: white,
  };
}

/** A small, steady hash: the same round and seed always put the answers in the same order. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The order the answers are laid out in: mixed, the same on every screen, and no clue to whose is whose. */
export function answerOrder(state: CahState): string[] {
  return [...answering(state)].sort((a, b) => hash(`${state.seed}:${state.round}:${a}`) - hash(`${state.seed}:${state.round}:${b}`));
}

/** What a chair answered this round, once the database has turned it over. */
export function answerOf(state: CahState, chair: string): string[] | null {
  const cards = state.revealed?.[playSlot(state.round, chair)] as string[] | undefined;
  return cards && cards.length ? cards : null;
}

/** Everyone who answered has had their answer turned over. */
export const allRevealed = (state: CahState) => answering(state).every((c) => answerOf(state, c));

/** Answers worth judging: not the ones put in for somebody who sat the round out. */
export const judgeable = (state: CahState) =>
  answerOrder(state).filter((c) => {
    const cards = answerOf(state, c);
    return cards && !cards.includes(SAT_OUT);
  });

/** The czar's pick: a point, and the game if that was the last one needed. */
export function pickWinner(state: CahState, chair: string, name: Name = (c) => c): CahState {
  if (state.phase !== "play" || state.step !== "answer" || !allRevealed(state)) return state;
  if (!judgeable(state).includes(chair)) return state;
  const points = { ...state.points, [chair]: (state.points[chair] ?? 0) + 1 };
  const next: CahState = { ...state, step: "picked", picked: chair, points, log: note(state.log, `${name(chair)} takes round ${state.round}`) };
  if (points[chair] < state.goal) return next;
  return {
    ...next,
    phase: "over",
    champion: chair,
    wins: { ...state.wins, [chair]: (state.wins[chair] ?? 0) + 1 },
    log: note(next.log, `${name(chair)} wins the game`),
  };
}

/** The next round: the next czar, the next black card -- shuffled round again when they run out. */
export function nextRound(state: CahState, random: Random, name: Name = (c) => c): CahState {
  if (state.phase !== "play" || state.step !== "picked") return state;
  const at = state.order.indexOf(state.czar);
  const czar = state.order[(at + 1) % state.order.length];
  let blacks = state.blacks;
  let blackAt = state.blackAt + 1;
  if (blackAt >= blacks.length) {
    blacks = shuffle(blacks, random);
    blackAt = 0;
  }
  return {
    ...state,
    round: state.round + 1,
    czar,
    step: "answer",
    picked: null,
    blacks,
    blackAt,
    log: note(state.log, `round ${state.round + 1}: ${name(czar)} is the czar`),
  };
}

/**
 * Answers from earlier rounds, public now, to shuffle back into the deck when
 * it runs dry -- only the ones not sent back already.
 */
export function usedAnswers(state: CahState): string[] {
  const out: string[] = [];
  for (let round = state.recycled + 1; round < state.round; round += 1) {
    for (const chair of state.order) {
      const cards = state.revealed?.[playSlot(round, chair)] as string[] | undefined;
      for (const card of cards ?? []) if (card !== SAT_OUT) out.push(card);
    }
  }
  return out;
}

/** Cards added to a game already going: blacks slipped into what is still to come, anywhere. */
export function addBlacks(state: CahState, cards: string[], random: Random): CahState {
  const fresh = cards.map(normalizePrompt).filter((c) => c && !state.blacks.includes(c));
  if (!fresh.length) return state;
  const done = state.blacks.slice(0, state.blackAt + 1);
  const ahead = shuffle([...state.blacks.slice(state.blackAt + 1), ...fresh], random);
  return { ...state, blacks: [...done, ...ahead] };
}
