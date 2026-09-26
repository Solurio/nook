// Twenty-one, head to head: two players, one deck, chips on the table.
//
// Each round both get one card face down -- theirs alone to see -- and one
// face up. On your go you take another card face up, stand, or double: the
// stake doubles, you take exactly one more, and stand. Over 21 on the cards
// showing and everyone sees you are bust; over with the hidden one and only
// you know, until the cards come over at the end. Closest to 21 takes the
// pot; 21 in two cards beats any other 21. Run out of chips and the match is
// over.
//
// The face-down cards are secret piles, one each; the face-up ones are
// turned over by the database from the deck, under revealed["up:<seat>:<n>"],
// so nobody can claim a card that did not come.

export type Seat = "a" | "b";
export const SEATS: Seat[] = ["a", "b"];
export const DECK = "deck";
export const START_CHIPS = 20;

export const holeSlot = (seat: Seat) => `hole:${seat}`;
export const upKey = (seat: Seat, n: number) => `up:${seat}:${n}`;
export const other = (seat: Seat): Seat => (seat === "a" ? "b" : "a");

export interface RoundResult {
  winner: Seat | null;
  totals: Record<Seat, number>;
  why: string;
}

export interface TwentyOneState {
  seats: Record<Seat, string | null>;
  holders?: Record<Seat, string | null>;
  phase: "idle" | "play" | "showdown" | "done";
  round: number;
  turn: Seat;
  /** Who went first this round; the other goes first next time. */
  starter: Seat;
  /** How many face-up cards each has. */
  shown: Record<Seat, number>;
  stood: Record<Seat, boolean>;
  /** Chips each has riding on this round. */
  stake: number;
  /** Who doubled this round, if anyone. */
  doubled: Seat | null;
  chips: Record<Seat, number>;
  result: RoundResult | null;
  matchWinner: Seat | null;
  matches: Record<Seat, number>;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function emptyTwentyOne(): TwentyOneState {
  return {
    seats: { a: null, b: null },
    holders: { a: null, b: null },
    phase: "idle",
    round: 0,
    turn: "a",
    starter: "b",
    shown: { a: 0, b: 0 },
    stood: { a: false, b: false },
    stake: 1,
    doubled: null,
    chips: { a: START_CHIPS, b: START_CHIPS },
    result: null,
    matchWinner: null,
    matches: { a: 0, b: 0 },
    log: [],
  };
}

export function deck(): string[] {
  const out: string[] = [];
  for (const suit of ["S", "H", "D", "C"]) for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]) out.push(`${rank}${suit}`);
  return out;
}

const rankOf = (card: string) => card.slice(0, -1);

/** A hand's best total: aces count 11 when that does not bust it. */
export function total(cards: string[]): number {
  let sum = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = rankOf(card);
    if (rank === "A") {
      aces += 1;
      sum += 1;
    } else if (rank === "J" || rank === "Q" || rank === "K") sum += 10;
    else sum += Number(rank) || 0;
  }
  return aces > 0 && sum + 10 <= 21 ? sum + 10 : sum;
}

/** The face-up cards, in the order they came. */
export function upCards(state: Pick<TwentyOneState, "revealed" | "shown">, seat: Seat): string[] {
  const out: string[] = [];
  for (let n = 0; n < state.shown[seat]; n += 1) {
    const card = state.revealed?.[upKey(seat, n)]?.[0];
    if (typeof card === "string") out.push(card);
  }
  return out;
}

/** The face-down card, once it has been turned over at the end. */
export function holeCard(state: Pick<TwentyOneState, "revealed">, seat: Seat): string | null {
  const card = state.revealed?.[holeSlot(seat)]?.[0];
  return typeof card === "string" ? card : null;
}

const note = (log: string[], line: string) => [...log.slice(-11), line];

/** A new round: the stake goes in, the other player starts. */
export function newRound(state: TwentyOneState, name: (s: Seat) => string): TwentyOneState {
  const fresh = state.matchWinner ? { ...state, chips: { a: START_CHIPS, b: START_CHIPS }, matchWinner: null } : state;
  const starter = other(fresh.starter);
  return {
    ...fresh,
    phase: "play",
    round: fresh.round + 1,
    turn: starter,
    starter,
    shown: { a: 0, b: 0 },
    stood: { a: false, b: false },
    stake: 1,
    doubled: null,
    result: null,
    log: note(state.matchWinner ? [] : fresh.log, `round ${fresh.round + 1}: ${name(starter)} goes first`),
  };
}

/** Both face-up cards are down: play starts. */
export function dealt(state: TwentyOneState): TwentyOneState {
  return { ...state, shown: { a: 1, b: 1 } };
}

/** After a card comes up for `seat`: bust on the cards showing ends the round. */
export function afterHit(state: TwentyOneState, seat: Seat, name: (s: Seat) => string): TwentyOneState {
  const shown = { ...state.shown, [seat]: state.shown[seat] + 1 };
  const next = { ...state, shown };
  const showing = total(upCards(next, seat));
  if (showing > 21) return { ...next, phase: "showdown", log: note(state.log, `${name(seat)} is bust on the cards showing`) };
  return { ...next, log: note(state.log, `${name(seat)} takes a card`) };
}

/** Standing: the turn goes over, or, with both standing, the cards come over. */
export function afterStand(state: TwentyOneState, seat: Seat, name: (s: Seat) => string): TwentyOneState {
  if (state.phase !== "play") return state;
  const stood = { ...state.stood, [seat]: true };
  const log = note(state.log, `${name(seat)} stands`);
  if (stood[other(seat)]) return { ...state, stood, phase: "showdown", log };
  return { ...state, stood, turn: other(seat), log };
}

/** Doubling: twice the stake, one card, and that is your go. */
export function canDouble(state: TwentyOneState, seat: Seat): boolean {
  return state.phase === "play" && state.turn === seat && !state.doubled && state.chips.a >= state.stake * 2 && state.chips.b >= state.stake * 2;
}

export function afterDouble(state: TwentyOneState, seat: Seat, name: (s: Seat) => string): TwentyOneState {
  return { ...state, stake: state.stake * 2, doubled: seat, log: note(state.log, `${name(seat)} doubles -- ${state.stake * 2} chips each`) };
}

/** Both hidden cards are over: who takes the pot. */
export function settle(state: TwentyOneState, name: (s: Seat) => string): TwentyOneState {
  const hand = (seat: Seat) => [holeCard(state, seat) ?? "", ...upCards(state, seat)].filter(Boolean);
  const totals = { a: total(hand("a")), b: total(hand("b")) };
  const bust = { a: totals.a > 21, b: totals.b > 21 };
  const natural = (seat: Seat) => totals[seat] === 21 && hand(seat).length === 2;
  let winner: Seat | null = null;
  let why = "";
  if (bust.a && bust.b) why = "both bust";
  else if (bust.a || bust.b) {
    winner = bust.a ? "b" : "a";
    why = `${name(other(winner))} went over`;
  } else if (natural("a") !== natural("b")) {
    winner = natural("a") ? "a" : "b";
    why = `${name(winner)} has 21 in two cards`;
  } else if (totals.a !== totals.b) {
    winner = totals.a > totals.b ? "a" : "b";
    why = `${totals[winner]} beats ${totals[other(winner)]}`;
  } else why = `${totals.a} each`;

  const chips = { ...state.chips };
  if (winner) {
    const paid = Math.min(state.stake, chips[other(winner)]);
    chips[winner] += paid;
    chips[other(winner)] -= paid;
  }
  const broke = SEATS.find((s) => chips[s] <= 0) ?? null;
  const matchWinner = broke ? other(broke) : null;
  const line = winner ? `${name(winner)} takes ${state.stake * 2} -- ${why}` : `nobody wins -- ${why}`;
  return {
    ...state,
    phase: "done",
    chips,
    result: { winner, totals, why },
    matchWinner,
    matches: matchWinner ? { ...state.matches, [matchWinner]: state.matches[matchWinner] + 1 } : state.matches,
    log: note(state.log, matchWinner ? `${line}. ${name(matchWinner)} wins the match` : line),
  };
}
