// Uno: match the colour or the number, and be the first with an empty hand.
//
// A card is a short string: its colour, then what it is. "R5" is a red five,
// "GS" a green skip, "BR" a blue reverse, "Y+" a yellow draw two. Wilds have no
// colour of their own: "W" is a wild, "W4" a wild draw four -- the colour a
// wild was called as lives in the table's state, not on the card.
//
// Hands and the draw pile are secret piles (see lib/piles.ts). What is public
// is the discard pile, whose go it is, which way play is running, and how many
// cards each player holds.

export const COLORS = ["R", "Y", "G", "B"] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAME: Record<Color, string> = {
  R: "red",
  Y: "yellow",
  G: "green",
  B: "blue",
};

export const COLOR_HEX: Record<Color, string> = {
  R: "#d63a3a",
  Y: "#f0c419",
  G: "#2f9e57",
  B: "#2f6fd1",
};

export type Value =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "S" // skip
  | "R" // reverse
  | "+" // draw two
  | "W" // wild
  | "W4"; // wild draw four

export const DRAW_PILE = "draw";
export const HAND_SIZE = 7;
export const MIN_SEATS = 2;
export const MAX_SEATS = 10;

export function handSlot(chair: string): string {
  return `hand:${chair}`;
}

/** All 108: per colour one zero, two of each 1-9 and of each action; eight wilds. */
export function fullDeck(): string[] {
  const out: string[] = [];
  for (const color of COLORS) {
    out.push(`${color}0`);
    for (let n = 1; n <= 9; n += 1) out.push(`${color}${n}`, `${color}${n}`);
    for (const action of ["S", "R", "+"]) out.push(`${color}${action}`, `${color}${action}`);
  }
  for (let i = 0; i < 4; i += 1) out.push("W", "W4");
  return out;
}

export function parse(card: string): { color: Color | null; value: Value } {
  if (card === "W" || card === "W4") return { color: null, value: card };
  return { color: card[0] as Color, value: card.slice(1) as Value };
}

export function isWild(card: string): boolean {
  return card === "W" || card === "W4";
}

/** Whether a card may go on the discard pile, given its top card and the colour in play. */
export function matches(card: string, top: string | undefined, color: Color | null): boolean {
  if (isWild(card)) return true;
  if (!top) return true;
  const c = parse(card);
  if (color && c.color === color) return true;
  const t = parse(top);
  return !isWild(top) && c.value === t.value;
}

/**
 * The cards in a hand that may be played. A wild draw four is only allowed
 * when nothing else in the hand matches the colour in play -- the rule that
 * stops it being thrown at people for fun.
 */
export function playable(hand: string[], top: string | undefined, color: Color | null): string[] {
  const holdsColor = color !== null && hand.some((c) => !isWild(c) && parse(c).color === color);
  return hand.filter((card) => {
    if (card === "W4") return !holdsColor;
    return matches(card, top, color);
  });
}

export interface UnoState {
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** Face up, top first. */
  discard: string[];
  /** The colour in play. Null only while a round that opened on a wild waits for it. */
  color: Color | null;
  turn: string;
  direction: 1 | -1;
  round: number;
  /** Round number to the chair that went out first. */
  results: Record<string, string>;
  /** Who has called uno with this hand. */
  called: Record<string, boolean>;
  /** Down to one card without calling it: anyone may catch them until the next play. */
  exposed: string | null;
  /** Drew this turn, and may now play what they drew or pass. */
  drew: string | null;
  /** The chair that dealt this round. */
  dealer: string;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function chairsFor(count: number): string[] {
  return Array.from(
    { length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) },
    (_, i) => `s${i}`,
  );
}

/** The chair `steps` places along, the way play is running. */
export function seatAfter(chairs: string[], from: string, direction: 1 | -1, steps = 1): string {
  const n = chairs.length;
  const at = chairs.indexOf(from);
  return chairs[(((at + direction * steps) % n) + n) % n];
}

export function emptyUno(seatCount = 4): UnoState {
  return {
    seats: {},
    holders: {},
    seatCount,
    discard: [],
    color: null,
    turn: "s0",
    direction: 1,
    round: 0,
    results: {},
    called: {},
    exposed: null,
    drew: null,
    dealer: "s0",
    log: [],
  };
}

const note = (log: string[], line: string) => [...log.slice(-19), line];

/**
 * What happens when a card goes down. Returns the next public state, plus who
 * has to draw and how many, which the player's own client carries out by
 * moving cards from the draw pile into that hand -- without seeing them.
 */
export function afterPlay(
  state: UnoState,
  chairs: string[],
  card: string,
  chosen: Color | null,
  cardsLeft: number,
  name: (chair: string) => string,
): { state: UnoState; penalty: { chair: string; count: number } | null } {
  const me = state.turn;
  const { value, color: own } = parse(card);
  let direction = state.direction;
  let skip = 0;
  let penalty: { chair: string; count: number } | null = null;

  if (value === "R") {
    // With two at the table a reverse is just a skip.
    if (chairs.length === 2) skip = 1;
    else direction = (direction * -1) as 1 | -1;
  }
  if (value === "S") skip = 1;
  if (value === "+") {
    penalty = { chair: seatAfter(chairs, me, direction, 1), count: 2 };
    skip = 1;
  }
  if (value === "W4") {
    penalty = { chair: seatAfter(chairs, me, direction, 1), count: 4 };
    skip = 1;
  }

  const out = cardsLeft === 0;
  const round = String(state.round);
  const next = out ? me : seatAfter(chairs, me, direction, 1 + skip);
  const called = { ...state.called };
  // Going down to one without having called it leaves you open to a catch.
  const exposed = cardsLeft === 1 && !called[me] ? me : null;
  if (cardsLeft !== 1) delete called[me];

  let line = `${name(me)} played ${describe(card, chosen)}`;
  if (penalty) line += `, ${name(penalty.chair)} draws ${penalty.count}`;
  if (out) line += ` and is out`;

  return {
    state: {
      ...state,
      discard: [card, ...state.discard],
      color: own ?? chosen,
      direction,
      turn: next,
      results: out ? { ...state.results, [round]: me } : state.results,
      called,
      exposed,
      drew: null,
      log: note(state.log, line),
    },
    penalty,
  };
}

/** After drawing: the turn moves on unless the drawn card is played. */
export function afterDraw(state: UnoState): UnoState {
  return { ...state, drew: state.turn };
}

/** Keeping what you drew, or having nothing to play after drawing. */
export function afterPass(state: UnoState, chairs: string[], name: (c: string) => string): UnoState {
  return {
    ...state,
    turn: seatAfter(chairs, state.turn, state.direction, 1),
    drew: null,
    exposed: null,
    log: note(state.log, `${name(state.turn)} passed`),
  };
}

/**
 * The card turned up to start a round, and what it does to whoever goes
 * first. A wild draw four cannot start a round; the caller puts it back and
 * turns another.
 */
export function openWith(
  state: UnoState,
  chairs: string[],
  card: string,
): { state: UnoState; penalty: { chair: string; count: number } | null } | "again" {
  if (card === "W4") return "again";
  const first = seatAfter(chairs, state.dealer, 1, 1);
  const { value, color } = parse(card);
  let turn = first;
  let direction: 1 | -1 = 1;
  let penalty: { chair: string; count: number } | null = null;

  if (value === "S") turn = seatAfter(chairs, first, 1, 1);
  if (value === "R") {
    if (chairs.length === 2) {
      turn = seatAfter(chairs, first, 1, 1);
    } else {
      direction = -1;
      turn = state.dealer;
    }
  }
  if (value === "+") {
    penalty = { chair: first, count: 2 };
    turn = seatAfter(chairs, first, 1, 1);
  }

  return {
    state: {
      ...state,
      discard: [card],
      color,
      turn,
      direction,
      drew: null,
      exposed: null,
      log: note(state.log, `the round opens on ${describe(card, null)}`),
    },
    penalty,
  };
}

export function describe(card: string, chosen: Color | null): string {
  const { color, value } = parse(card);
  if (value === "W") return chosen ? `a wild, calling ${COLOR_NAME[chosen]}` : "a wild";
  if (value === "W4") return chosen ? `a wild draw four, calling ${COLOR_NAME[chosen]}` : "a wild draw four";
  const colorName = color ? COLOR_NAME[color] : "";
  const what = value === "S" ? "skip" : value === "R" ? "reverse" : value === "+" ? "draw two" : value;
  return `a ${colorName} ${what}`;
}

/**
 * The discard pile, less its top card, goes back under as a new draw pile
 * when the old one runs out. Wilds go back as plain wilds.
 */
export function reshuffle(state: UnoState): { state: UnoState; back: string[] } {
  const [top, ...rest] = state.discard;
  return { state: { ...state, discard: top ? [top] : [] }, back: rest };
}

/** Round wins per chair. */
export function tally(results: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seat of Object.values(results)) out[seat] = (out[seat] ?? 0) + 1;
  return out;
}
