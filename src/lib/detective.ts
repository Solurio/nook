// Detective: somebody in the house did it, with something, somewhere. The
// answer is three cards in an envelope nobody can open; the rest are dealt
// out, and you work it out from what the others can show you.
//
// The database deals, answers suggestions and checks accusations
// (supabase/migrations/0012_detective.sql). What the table may know is under
// this item's state as `cs`, and only the database writes it. Everything here
// is the house -- who, with what, where -- and the shape of that state.

export const MIN_SEATS = 2;
export const MAX_SEATS = 6;

export type Kind = "s" | "w" | "r";

export interface Suspect {
  id: string;
  name: string;
  tint: string;
  /** A line about them, for the notebook. */
  about: string;
}

export const SUSPECTS: Suspect[] = [
  { id: "countess", name: "the Countess", tint: "#c2557a", about: "owns the house, and the debts" },
  { id: "gardener", name: "the Gardener", tint: "#58a86c", about: "knows every way in and out" },
  { id: "chef", name: "the Chef", tint: "#e0b13f", about: "fired on Tuesday, still here on Friday" },
  { id: "professor", name: "the Professor", tint: "#5a86d6", about: "came for the library, stayed for the will" },
  { id: "heir", name: "the Heir", tint: "#9a74dc", about: "next in line, and impatient" },
  { id: "medium", name: "the Medium", tint: "#de7f45", about: "says the dead told her nothing" },
];

export const WEAPONS: Array<{ id: string; name: string }> = [
  { id: "tea", name: "poisoned tea" },
  { id: "poker", name: "fire poker" },
  { id: "opener", name: "letter opener" },
  { id: "shears", name: "garden shears" },
  { id: "scarf", name: "silk scarf" },
  { id: "rifle", name: "hunting rifle" },
];

/** Three by three, in this order; the corners are joined by secret passages, across. */
export const ROOMS: Array<{ id: string; name: string }> = [
  { id: "greenhouse", name: "greenhouse" },
  { id: "library", name: "library" },
  { id: "observatory", name: "observatory" },
  { id: "kitchen", name: "kitchen" },
  { id: "hall", name: "grand hall" },
  { id: "gallery", name: "gallery" },
  { id: "cellar", name: "wine cellar" },
  { id: "chapel", name: "chapel" },
  { id: "attic", name: "attic" },
];

export const DECK = {
  suspects: SUSPECTS.map((s) => s.id),
  weapons: WEAPONS.map((w) => w.id),
  rooms: ROOMS.map((r) => r.id),
};

/** The corners joined across the house. */
export const PASSAGES: Array<[number, number]> = [
  [0, 8],
  [2, 6],
];

export function adjacent(from: number, to: number): boolean {
  if (from < 0 || from > 8 || to < 0 || to > 8) return false;
  const steps = Math.abs(Math.floor(from / 3) - Math.floor(to / 3)) + Math.abs((from % 3) - (to % 3));
  return steps === 1 || PASSAGES.some(([a, b]) => (a === from && b === to) || (a === to && b === from));
}

export const passageFrom = (room: number): number | null => {
  const pair = PASSAGES.find(([a, b]) => a === room || b === room);
  return pair ? (pair[0] === room ? pair[1] : pair[0]) : null;
};

/** A card is "s:countess", "w:tea", "r:library". */
export function cardKind(card: string): Kind {
  return card[0] as Kind;
}

export function cardName(card: string): string {
  const id = card.slice(2);
  const kind = cardKind(card);
  const found = kind === "s" ? SUSPECTS.find((s) => s.id === id) : kind === "w" ? WEAPONS.find((w) => w.id === id) : ROOMS.find((r) => r.id === id);
  return found?.name ?? id;
}

export const tintOf = (card: string) => (cardKind(card) === "s" ? (SUSPECTS.find((s) => `s:${s.id}` === card)?.tint ?? "#999") : null);

export interface Suggestion {
  from: string;
  cards: string[];
  /** Who could not answer, in the order they were asked. */
  passed: string[];
  /** Who answered, or null when nobody could. */
  by: string | null;
  turn: number;
}

/** The case as the table may know it. Written only by the database. */
export interface Case {
  /** A fresh id for every deal. */
  game: string;
  phase: "play" | "over";
  chairs: string[];
  suspects: string[];
  weapons: string[];
  rooms: string[];
  turn: string;
  turns: number;
  /** Which room each player stands in, by its place in the grid. */
  at: Record<string, number>;
  moved: boolean;
  suggested: boolean;
  out: string[];
  /** A suggestion waiting on the player answering it to choose a card. */
  pending: Suggestion | null;
  history: Suggestion[];
  accused: Array<{ chair: string; cards: string[]; right: boolean }>;
  winner: string | null;
  /** The envelope, once the case is closed. */
  answer: string[] | null;
}

/** What one player has been shown: the card, who showed it, and when. */
export interface Shown {
  card: string;
  by: string;
  turn: number;
}

export interface DetectiveState {
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  cs?: Case;
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function emptyDetective(seatCount = 4): DetectiveState {
  return { seats: {}, holders: {}, seatCount };
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `c${i}`);
}

export const handSlot = (chair: string) => `hand:${chair}`;
export const seenSlot = (chair: string) => `seen:${chair}`;

export function readHand(cards: unknown[] | undefined): string[] {
  return (cards ?? []).filter((c): c is string => typeof c === "string" && /^[swr]:/.test(c));
}

export function readSeen(cards: unknown[] | undefined): Shown[] {
  return (cards ?? []).filter(
    (c): c is Shown => typeof c === "object" && c !== null && typeof (c as Shown).card === "string" && typeof (c as Shown).by === "string",
  );
}

/** The cards in a suggestion this hand could show. */
export function canShow(hand: string[], asked: string[]): string[] {
  return hand.filter((c) => asked.includes(c));
}

/**
 * The notebook's marks, worked out from what you know for certain: your own
 * cards, and the ones you have been shown. Anything else is yours to mark.
 */
export function known(hand: string[], seen: Shown[]): Record<string, { by: string | null }> {
  const out: Record<string, { by: string | null }> = {};
  for (const card of hand) out[card] = { by: null };
  for (const s of seen) out[s.card] ??= { by: s.by };
  return out;
}
