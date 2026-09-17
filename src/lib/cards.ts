// A deck of cards with nothing decided for you: pick which ranks and suits are
// in it, shuffle, deal it round the table. That covers the games with a board
// of their own and the ones that only ever needed cards and an agreement.
//
// A card is its rank followed by its suit, so "AS" is the ace of spades and
// "10H" the ten of hearts. Jokers are "JK1" and "JK2".

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export const SUIT_GLYPH: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

export const SUIT_NAME: Record<Suit, string> = {
  S: "spades",
  H: "hearts",
  D: "diamonds",
  C: "clubs",
};

export interface DeckConfig {
  ranks: Rank[];
  suits: Suit[];
  /** 0, 1 or 2. */
  jokers: number;
  /** How many identical copies of the whole deck (some games use two). */
  copies: number;
}

export function fullDeckConfig(): DeckConfig {
  return { ranks: [...RANKS], suits: [...SUITS], jokers: 0, copies: 1 };
}

/** Truco and several others drop the 8, 9 and 10, leaving forty cards. */
export function fortyCardConfig(): DeckConfig {
  return {
    ranks: RANKS.filter((r) => r !== "8" && r !== "9" && r !== "10"),
    suits: [...SUITS],
    jokers: 0,
    copies: 1,
  };
}

export function isJoker(card: string): boolean {
  return card.startsWith("JK");
}

/** Splits a card into its rank and suit. Jokers have neither. */
export function readCard(card: string): { rank: Rank; suit: Suit } | null {
  if (isJoker(card)) return null;
  const suit = card.slice(-1) as Suit;
  const rank = card.slice(0, -1) as Rank;
  if (!SUITS.includes(suit) || !RANKS.includes(rank)) return null;
  return { rank, suit };
}

export function cardLabel(card: string): string {
  if (isJoker(card)) return "joker";
  const read = readCard(card);
  if (!read) return card;
  return `${read.rank} of ${SUIT_NAME[read.suit]}`;
}

/** Every card the configuration asks for, in a tidy order. */
export function buildDeck(config: DeckConfig): string[] {
  const out: string[] = [];
  const copies = Math.max(1, Math.min(4, config.copies));

  for (let copy = 0; copy < copies; copy += 1) {
    for (const suit of config.suits) {
      for (const rank of config.ranks) out.push(`${rank}${suit}`);
    }
    for (let j = 0; j < Math.max(0, Math.min(2, config.jokers)); j += 1) {
      out.push(`JK${j + 1}`);
    }
  }
  return out;
}

/**
 * Fisher-Yates, on a copy. Takes its randomness as an argument so a test can
 * pin it down; everywhere else this is Math.random.
 */
export function shuffle<T>(cards: readonly T[], random: () => number = Math.random): T[] {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface DealResult {
  hands: Record<string, string[]>;
  /** What is left in the deck after dealing. */
  rest: string[];
}

/**
 * Deals one card at a time round the table, the way you would by hand. If the
 * deck runs out part way round, everyone keeps what they were given.
 */
export function deal(deck: readonly string[], seats: readonly string[], each: number): DealResult {
  const hands: Record<string, string[]> = {};
  for (const seat of seats) hands[seat] = [];
  if (seats.length === 0) return { hands, rest: deck.slice() };

  const rest = deck.slice();
  for (let round = 0; round < Math.max(0, each); round += 1) {
    for (const seat of seats) {
      const card = rest.shift();
      if (card === undefined) return { hands, rest };
      hands[seat].push(card);
    }
  }
  return { hands, rest };
}

/**
 * Which team each chair plays for. Partners sit across from each other, so
 * chairs alternate: with two teams and four chairs it is 0,1,0,1. Zero teams
 * means everyone is on their own.
 */
export function teamOf(seatIndex: number, teams: number): number | null {
  if (teams < 2) return null;
  return seatIndex % teams;
}

/** Chair ids for a table of this size: "s0", "s1", and so on. */
export function seatIds(count: number): string[] {
  return Array.from({ length: Math.max(1, Math.min(8, count)) }, (_, i) => `s${i}`);
}
