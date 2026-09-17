// Coup. Everyone holds two cards face down and may claim to be anything; the
// only thing keeping them honest is that a challenge costs somebody a card.
//
// The rules live here so the interface only has to show them. A turn moves
// through phases: someone acts, the table gets a chance to doubt or block, and
// whatever survives that resolves.

export type Card = "duke" | "assassin" | "captain" | "ambassador" | "contessa";

export const CARDS: Card[] = ["duke", "assassin", "captain", "ambassador", "contessa"];
/** Copies of each character in the base box, which covers up to six players. */
export const COPIES = 3;
export const MIN_SEATS = 2;
export const MAX_SEATS = 12;
export const COUP_COST = 7;
export const ASSASSIN_COST = 3;
/** At ten coins your only move is to knock someone out. */
export const FORCED_COUP = 10;

export type ActionKind =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange";

/** The card an action claims. Income, foreign aid and a coup claim nothing. */
export const CLAIMS: Partial<Record<ActionKind, Card>> = {
  tax: "duke",
  assassinate: "assassin",
  steal: "captain",
  exchange: "ambassador",
};

/** Who can block what, and with which card. */
export const BLOCKS: Partial<Record<ActionKind, Card[]>> = {
  foreign_aid: ["duke"],
  assassinate: ["contessa"],
  steal: ["captain", "ambassador"],
};

/**
 * How many of each character to deal in. Three copies each -- fifteen cards --
 * carries the box up to six players; beyond that a table of ten would be
 * holding almost the whole deck between them and nothing would be left to draw
 * from, so a copy of everyone is added for every two extra chairs.
 */
export function copiesFor(players: number): number {
  if (players <= 6) return 3;
  if (players <= 8) return 4;
  if (players <= 10) return 5;
  return 6;
}

/** Total cards in play for a table of this size. */
export function deckSize(players: number): number {
  return copiesFor(players) * CARDS.length;
}

export function needsTarget(kind: ActionKind): boolean {
  return kind === "coup" || kind === "assassinate" || kind === "steal";
}

export interface Player {
  /** Chair id. */
  seat: string;
  coins: number;
  /** Face down, still in play. */
  cards: Card[];
  /** Turned face up when lost; two of these and you are out. */
  lost: Card[];
}

export interface Action {
  kind: ActionKind;
  by: number;
  target?: number;
}

export type Phase =
  /** Whoever's turn it is picks something. */
  | { kind: "act" }
  /** An action is on the table; others may doubt it or block it. */
  | { kind: "respond"; action: Action; passed: number[] }
  /** A block is on the table; others may doubt the blocker. */
  | { kind: "blocked"; action: Action; blocker: number; card: Card; passed: number[] }
  /** Somebody has to give a card up and chooses which. */
  | { kind: "discard"; who: number; next: "turn" | "action"; action?: Action }
  /** The ambassador drew and now picks what to keep. */
  | { kind: "exchange"; who: number; drawn: Card[] }
  | { kind: "over"; winner: number };

export interface CoupState {
  players: Player[];
  deck: Card[];
  turn: number;
  phase: Phase;
  log: string[];
}

export function fullDeck(copies: number = COPIES): Card[] {
  const out: Card[] = [];
  for (const card of CARDS) {
    for (let i = 0; i < copies; i += 1) out.push(card);
  }
  return out;
}

export function isOut(player: Player): boolean {
  return player.cards.length === 0;
}

export function alive(state: CoupState): number[] {
  return state.players.map((_, i) => i).filter((i) => !isOut(state.players[i]));
}

/** Everything this player is allowed to declare right now. */
export function legalActions(state: CoupState, who: number): ActionKind[] {
  const player = state.players[who];
  if (!player || isOut(player)) return [];

  // Ten coins and the only thing on the table is a coup.
  if (player.coins >= FORCED_COUP) return ["coup"];

  const out: ActionKind[] = ["income", "foreign_aid", "tax", "exchange"];
  if (player.coins >= COUP_COST) out.push("coup");
  if (player.coins >= ASSASSIN_COST) out.push("assassinate");

  // Stealing needs somebody with something worth taking.
  if (alive(state).some((i) => i !== who && state.players[i].coins > 0)) out.push("steal");
  return out;
}

/** Whether an action can be doubted at all. */
export function challengeable(kind: ActionKind): boolean {
  return CLAIMS[kind] !== undefined;
}

/** Who may block this, and with what. An empty list means it cannot be stopped. */
export function blockers(action: Action, state: CoupState): { seats: number[]; cards: Card[] } {
  const cards = BLOCKS[action.kind];
  if (!cards) return { seats: [], cards: [] };

  // Foreign aid is everyone's business; the rest only concern the target.
  const seats =
    action.kind === "foreign_aid"
      ? alive(state).filter((i) => i !== action.by)
      : action.target !== undefined && !isOut(state.players[action.target])
        ? [action.target]
        : [];
  return { seats, cards };
}

function draw(deck: Card[], count: number): { taken: Card[]; rest: Card[] } {
  return { taken: deck.slice(0, count), rest: deck.slice(count) };
}

/** Moves to the next player still holding a card. */
export function advance(state: CoupState): CoupState {
  const living = alive(state);
  if (living.length <= 1) {
    return { ...state, phase: { kind: "over", winner: living[0] ?? state.turn } };
  }
  let next = (state.turn + 1) % state.players.length;
  while (isOut(state.players[next])) next = (next + 1) % state.players.length;
  return { ...state, turn: next, phase: { kind: "act" } };
}

/** Makes a player give up a card, or ends it if that was their last. */
export function loseInfluence(state: CoupState, who: number, cardIndex: number): CoupState {
  const player = state.players[who];
  if (!player || player.cards.length === 0) return state;

  const index = Math.max(0, Math.min(player.cards.length - 1, cardIndex));
  const card = player.cards[index];
  const players = state.players.map((p, i) =>
    i === who
      ? { ...p, cards: p.cards.filter((_, c) => c !== index), lost: [...p.lost, card] }
      : p,
  );

  return {
    ...state,
    players,
    log: [...state.log, `${who} lost a ${card}`],
  };
}

/**
 * The outcome of an action nobody stopped. Blocks and challenges are handled
 * before this; by here it simply happens.
 */
export function resolve(state: CoupState, action: Action): CoupState {
  const players = state.players.map((p) => ({ ...p }));
  let deck = state.deck;
  const log = [...state.log];

  switch (action.kind) {
    case "income":
      players[action.by].coins += 1;
      log.push(`${action.by} took income`);
      break;

    case "foreign_aid":
      players[action.by].coins += 2;
      log.push(`${action.by} took foreign aid`);
      break;

    case "tax":
      players[action.by].coins += 3;
      log.push(`${action.by} taxed`);
      break;

    case "steal": {
      if (action.target === undefined) break;
      const taken = Math.min(2, players[action.target].coins);
      players[action.target].coins -= taken;
      players[action.by].coins += taken;
      log.push(`${action.by} stole ${taken} from ${action.target}`);
      break;
    }

    case "coup":
    case "assassinate": {
      if (action.target === undefined) break;
      // The cost is paid when the action is declared, not here.
      return {
        ...state,
        players,
        deck,
        log,
        phase: { kind: "discard", who: action.target, next: "turn" },
      };
    }

    case "exchange": {
      const { taken, rest } = draw(deck, 2);
      deck = rest;
      log.push(`${action.by} exchanged`);
      return {
        ...state,
        players,
        deck,
        log,
        phase: { kind: "exchange", who: action.by, drawn: taken },
      };
    }
  }

  return advance({ ...state, players, deck, log });
}

/**
 * A challenge. If the claim was real the doubter pays, and the honest card goes
 * back into the deck for a fresh one. If it was a bluff, the bluffer pays.
 */
export function judge(
  state: CoupState,
  claimant: number,
  claimed: Card,
  challenger: number,
): { state: CoupState; honest: boolean } {
  const holder = state.players[claimant];
  const index = holder.cards.indexOf(claimed);

  if (index === -1) {
    return {
      state: {
        ...state,
        log: [...state.log, `${challenger} caught ${claimant} bluffing about the ${claimed}`],
        phase: { kind: "discard", who: claimant, next: "turn" },
      },
      honest: false,
    };
  }

  // Shown to be true: back into the deck, shuffled, and a new one drawn.
  const deck = [...state.deck, claimed];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const replacement = deck.shift();

  const players = state.players.map((p, i) =>
    i === claimant
      ? {
          ...p,
          cards: [...p.cards.filter((_, c) => c !== index), ...(replacement ? [replacement] : [])],
        }
      : p,
  );

  return {
    state: {
      ...state,
      players,
      deck,
      log: [...state.log, `${claimant} really had the ${claimed}, so ${challenger} pays`],
    },
    honest: true,
  };
}

/** Deals a fresh game: two cards and two coins each. */
export function newGame(seats: string[], random: () => number = Math.random): CoupState {
  const deck = fullDeck(copiesFor(seats.length));
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const players: Player[] = seats.map((seat) => ({ seat, coins: 2, cards: [], lost: [] }));
  let rest = deck;
  for (let round = 0; round < 2; round += 1) {
    for (const player of players) {
      const { taken, rest: left } = draw(rest, 1);
      player.cards.push(...taken);
      rest = left;
    }
  }

  return { players, deck: rest, turn: 0, phase: { kind: "act" }, log: [] };
}

/**
 * Pulls chairs up to the table or takes them away, and deals again. The size of
 * the deck follows the number of players, so this cannot happen mid-hand
 * without changing the game underneath everyone.
 */
export function withSeats(
  state: CoupState,
  count: number,
  random: () => number = Math.random,
): CoupState {
  const wanted = Math.max(MIN_SEATS, Math.min(MAX_SEATS, count));
  const seats: string[] = [];
  for (let i = 0; i < wanted; i += 1) seats.push(state.players[i]?.seat ?? `s${i}`);
  return newGame(seats, random);
}
