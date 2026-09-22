// A card table with nothing decided for you: the felt, some decks, and whatever
// the people sitting round it agree to do with them.
//
// The unit of everything is the stack. A single card on the felt is a stack of
// one; a deck is a stack of fifty-two; a discard pile, a draw pile, a meld laid
// down in front of someone -- all stacks. Each sits somewhere on the felt, face
// up or face down, squared up or spread into a fan or a row.
//
// Face-up stacks keep their cards in the table's state, because everyone can
// see them. A face-down stack keeps its cards in a secret pile nobody owns, so
// nobody can read it -- not even whoever put it there -- until someone turns it
// over, which the database does in front of everyone. Hands are secret piles
// owned by whoever sits in that chair.
//
// Everything here is pure. Operations return the new public state and, when a
// secret pile is involved, the database call that goes with it; the component
// sends both in one go so the two halves can never disagree.
//
// Card order: index 0 is the top of a stack, here and in the database alike.

import { buildDeck, type DeckConfig, type Rank, type Suit, RANKS, SUITS } from "./cards";
import type { PileFn, PileMeta, Revealed } from "./piles";

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export type BackPattern = "lattice" | "stripes" | "dots" | "plain";

export interface CardBack {
  color: string;
  pattern: BackPattern;
  /** A picture for the back, instead of the pattern. */
  image?: string;
}

/** A card somebody made up: a title, a line of text, a colour, maybe a picture. */
export interface CustomCard {
  id: string;
  title: string;
  text?: string;
  color: string;
  image?: string;
  copies: number;
}

export type DeckKind = "standard" | "tarot" | "custom";

export interface DeckDef {
  id: string;
  name: string;
  kind: DeckKind;
  /** Standard decks: which ranks and suits, jokers, how many copies. */
  config?: DeckConfig;
  /** Custom decks: the cards. */
  custom?: CustomCard[];
  back: CardBack;
  /** Tarot: cards may come out upside down, which in a reading means something. */
  reversals?: boolean;
  /** Tarot: which printing. */
  theme?: "classic" | "night" | "rose";
}

export const BACK_COLORS = ["#7a2e3b", "#243f6b", "#2f5a3a", "#5b3a7a", "#1d1a24", "#8a5a1c"];

export const TAROT_SUITS = ["W", "C", "S", "P"] as const;
export type TarotSuit = (typeof TAROT_SUITS)[number];

export const TAROT_SUIT_NAME: Record<TarotSuit, string> = {
  W: "wands",
  C: "cups",
  S: "swords",
  P: "pentacles",
};

export const MAJOR_ARCANA = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
] as const;

export const TAROT_COURT = ["Page", "Knight", "Queen", "King"] as const;

/** Every card a deck asks for, each tagged with the deck it came from. */
export function deckCards(deck: DeckDef): string[] {
  const tag = (face: string) => `${deck.id}|${face}`;

  if (deck.kind === "standard") {
    return buildDeck(deck.config ?? { ranks: [...RANKS], suits: [...SUITS], jokers: 0, copies: 1 }).map(
      tag,
    );
  }

  if (deck.kind === "tarot") {
    const out: string[] = [];
    for (let n = 0; n < MAJOR_ARCANA.length; n += 1) out.push(tag(`M${n}`));
    for (const suit of TAROT_SUITS) {
      for (let n = 1; n <= 14; n += 1) out.push(tag(`${suit}${n}`));
    }
    return out;
  }

  const out: string[] = [];
  for (const card of deck.custom ?? []) {
    for (let i = 0; i < Math.max(1, Math.min(20, card.copies)); i += 1) out.push(tag(`k:${card.id}`));
  }
  return out;
}

export type CardFace =
  | { kind: "standard"; rank: Rank; suit: Suit }
  | { kind: "joker"; n: number }
  | { kind: "major"; n: number; name: string }
  | { kind: "minor"; suit: TarotSuit; n: number; name: string }
  | { kind: "custom"; card: CustomCard }
  | { kind: "unknown"; raw: string };

/** What a card is, given the decks on the table. */
export function readFace(card: string, decks: DeckDef[]): { deck: DeckDef | null; face: CardFace } {
  const bar = card.indexOf("|");
  const deckId = bar >= 0 ? card.slice(0, bar) : "";
  const raw = bar >= 0 ? card.slice(bar + 1) : card;
  const deck = decks.find((d) => d.id === deckId) ?? null;

  if (raw.startsWith("JK")) return { deck, face: { kind: "joker", n: Number(raw.slice(2)) || 1 } };

  if (raw.startsWith("k:")) {
    const found = deck?.custom?.find((c) => c.id === raw.slice(2));
    return { deck, face: found ? { kind: "custom", card: found } : { kind: "unknown", raw } };
  }

  if (deck?.kind === "tarot") {
    if (raw.startsWith("M")) {
      const n = Number(raw.slice(1));
      if (n >= 0 && n < MAJOR_ARCANA.length) {
        return { deck, face: { kind: "major", n, name: MAJOR_ARCANA[n] } };
      }
    }
    const suit = raw[0] as TarotSuit;
    const n = Number(raw.slice(1));
    if (TAROT_SUITS.includes(suit) && n >= 1 && n <= 14) {
      const rank = n === 1 ? "Ace" : n <= 10 ? String(n) : TAROT_COURT[n - 11];
      return { deck, face: { kind: "minor", suit, n, name: `${rank} of ${TAROT_SUIT_NAME[suit]}` } };
    }
  }

  const suit = raw.slice(-1) as Suit;
  const rank = raw.slice(0, -1) as Rank;
  if (SUITS.includes(suit) && RANKS.includes(rank)) {
    return { deck, face: { kind: "standard", rank, suit } };
  }
  return { deck, face: { kind: "unknown", raw } };
}

export function faceName(face: CardFace): string {
  switch (face.kind) {
    case "standard": {
      const suit = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" }[face.suit];
      const rank = { A: "ace", J: "jack", Q: "queen", K: "king" }[face.rank as "A"] ?? face.rank;
      return `${rank} of ${suit}`;
    }
    case "joker":
      return "joker";
    case "major":
    case "minor":
      return face.name;
    case "custom":
      return face.card.title;
    default:
      return "a card";
  }
}

// ---------------------------------------------------------------------------
// Presets: the decks a table usually starts with
// ---------------------------------------------------------------------------

export type Preset = "52" | "54" | "40" | "canasta" | "tarot" | "custom";

export const PRESET_NAME: Record<Preset, string> = {
  "52": "fifty-two",
  "54": "with two jokers",
  "40": "forty (truco, sueca)",
  canasta: "two decks and jokers (canasta, buraco)",
  tarot: "tarot",
  custom: "make your own",
};

export function presetDecks(preset: Preset, id = "d1"): DeckDef[] {
  const back: CardBack = { color: BACK_COLORS[0], pattern: "lattice" };
  const standard = (config: DeckConfig, name: string): DeckDef => ({
    id,
    name,
    kind: "standard",
    config,
    back,
  });

  switch (preset) {
    case "54":
      return [standard({ ranks: [...RANKS], suits: [...SUITS], jokers: 2, copies: 1 }, "deck")];
    case "40":
      return [
        standard(
          {
            ranks: RANKS.filter((r) => r !== "8" && r !== "9" && r !== "10"),
            suits: [...SUITS],
            jokers: 0,
            copies: 1,
          },
          "forty",
        ),
      ];
    case "canasta":
      return [standard({ ranks: [...RANKS], suits: [...SUITS], jokers: 2, copies: 2 }, "double deck")];
    case "tarot":
      return [
        {
          id,
          name: "tarot",
          kind: "tarot",
          back: { color: BACK_COLORS[3], pattern: "dots" },
          reversals: true,
        },
      ];
    case "custom":
      return [
        {
          id,
          name: "my cards",
          kind: "custom",
          custom: [{ id: "a", title: "a card", color: "#f6c177", copies: 4 }],
          back: { color: BACK_COLORS[1], pattern: "stripes" },
        },
      ];
    default:
      return [standard({ ranks: [...RANKS], suits: [...SUITS], jokers: 0, copies: 1 }, "deck")];
  }
}

// ---------------------------------------------------------------------------
// The felt
// ---------------------------------------------------------------------------

export type Facing = "up" | "down";
export type Layout = "stack" | "fan" | "row";

export interface Stack {
  id: string;
  /** Centre of the stack, as a fraction of the felt: 0..1 across and down. */
  x: number;
  y: number;
  face: Facing;
  /** Face-up stacks only. Face-down cards are in the secret pile stackSlot(id). */
  cards?: string[];
  layout: Layout;
  /** Named places: "draw", "discard", or whatever a game calls them. */
  label?: string;
  /** A face-down stack that belongs to someone: they can read it, nobody else. */
  owner?: string | null;
  /** Turned end over end -- upside down, which for tarot is a reversal. */
  turned?: boolean;
  z: number;
}

export interface TableState {
  version: 2;
  decks: DeckDef[];
  stacks: Stack[];
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** 0 is everyone for themselves; 2 or more pairs chairs across the table. */
  teams: number;
  dealEach: number;
  /** Lay the deck out as soon as the table is first opened -- how tarot arrives ready to read. */
  autoSet?: boolean;
  /** Written by the database. */
  piles?: PileMeta;
  revealed?: Revealed;
}

export const MAX_CHAIRS = 8;

export function stackSlot(id: string): string {
  return `stack:${id}`;
}

export function handSlot(chair: string): string {
  return `hand:${chair}`;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(1, Math.min(MAX_CHAIRS, count)) }, (_, i) => `s${i}`);
}

/** A short random id for a new stack. */
export function stackId(random: () => number = Math.random): string {
  return Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
}

export function emptyTable(preset: Preset = "52"): TableState {
  return {
    version: 2,
    decks: presetDecks(preset),
    stacks: [],
    seats: {},
    holders: {},
    seatCount: 4,
    teams: 0,
    dealEach: 5,
  };
}

/** How many cards a stack holds, wherever they live. */
export function stackSize(stack: Stack, piles: PileMeta | undefined): number {
  if (stack.face === "up") return stack.cards?.length ?? 0;
  return piles?.[stackSlot(stack.id)]?.size ?? 0;
}

export function topZ(stacks: Stack[]): number {
  return stacks.reduce((max, s) => Math.max(max, s.z), 0) + 1;
}

const clamp01 = (v: number) => Math.max(0.04, Math.min(0.96, v));

// ---------------------------------------------------------------------------
// Operations
//
// Each returns the public state to write and, when a secret pile moves, the
// database call to make with it. `call.args` never includes p_item or
// p_public; whoever runs the operation adds both.
// ---------------------------------------------------------------------------

export interface Call {
  fn: PileFn;
  args: Record<string, unknown>;
}

export interface Step {
  table: TableState;
  call?: Call;
  /** Some moves take two database calls in order, the second after the first lands. */
  then?: Call;
  /** How to put the table right if that second call never lands. */
  undo?: (live: TableState) => TableState;
}

function withStack(table: TableState, stack: Stack): TableState {
  return { ...table, stacks: [...table.stacks, stack] };
}

function without(table: TableState, id: string): TableState {
  return { ...table, stacks: table.stacks.filter((s) => s.id !== id) };
}

function replaced(table: TableState, stack: Stack): TableState {
  return { ...table, stacks: table.stacks.map((s) => (s.id === stack.id ? stack : s)) };
}

function find(table: TableState, id: string): Stack {
  const stack = table.stacks.find((s) => s.id === id);
  if (!stack) throw new Error(`no stack ${id}`);
  return stack;
}

/**
 * Lays every deck out face down across the middle, plus an empty discard
 * place, and shuffles each one where nobody can watch.
 */
export function setTable(table: TableState, random: () => number = Math.random): Step {
  const decks = table.decks;
  const stacks: Stack[] = [];
  const piles: Array<{ slot: string; cards: string[]; shuffle: boolean }> = [];
  const gap = 1 / (decks.length + 2);

  decks.forEach((deck, i) => {
    const id = stackId(random);
    stacks.push({
      id,
      x: gap * (i + 1),
      y: 0.42,
      face: "down",
      layout: "stack",
      label: decks.length > 1 ? deck.name : "draw",
      z: i + 1,
    });
    piles.push({ slot: stackSlot(id), cards: deckCards(deck), shuffle: true });
  });

  stacks.push({
    id: stackId(random),
    x: gap * (decks.length + 1),
    y: 0.42,
    face: "up",
    cards: [],
    layout: "stack",
    label: "discard",
    z: decks.length + 1,
  });

  const next: TableState = { ...table, stacks };
  delete next.revealed;
  return { table: next, call: { fn: "pile_setup", args: { p_piles: piles } } };
}

/** Moves a stack somewhere else on the felt. */
export function moveStack(table: TableState, id: string, x: number, y: number): TableState {
  const stack = find(table, id);
  return replaced(table, { ...stack, x: clamp01(x), y: clamp01(y), z: topZ(table.stacks) });
}

/** Moves several stacks by the same amount -- a group picked up together. */
export function moveStacks(table: TableState, ids: string[], dx: number, dy: number): TableState {
  const z = topZ(table.stacks);
  return {
    ...table,
    stacks: table.stacks.map((s, i) =>
      ids.includes(s.id) ? { ...s, x: clamp01(s.x + dx), y: clamp01(s.y + dy), z: z + i } : s,
    ),
  };
}

export function setLayout(table: TableState, id: string, layout: Layout): TableState {
  return replaced(table, { ...find(table, id), layout });
}

export function renameStack(table: TableState, id: string, label: string): TableState {
  const trimmed = label.trim().slice(0, 24);
  return replaced(table, { ...find(table, id), label: trimmed || undefined });
}

export function turnStack(table: TableState, id: string): TableState {
  const stack = find(table, id);
  return replaced(table, { ...stack, turned: !stack.turned });
}

/** An empty named place to put things: a draw pile, a meld, a trick. */
export function addPlace(
  table: TableState,
  label: string,
  x: number,
  y: number,
  random: () => number = Math.random,
): TableState {
  return withStack(table, {
    id: stackId(random),
    x: clamp01(x),
    y: clamp01(y),
    face: "up",
    cards: [],
    layout: "stack",
    label: label.trim().slice(0, 24) || "place",
    z: topZ(table.stacks),
  });
}

/** Takes an empty stack off the felt. Stacks with cards stay put. */
export function removeIfEmpty(table: TableState, id: string): TableState {
  const stack = find(table, id);
  if (stack.face === "up" && (stack.cards?.length ?? 0) > 0) return table;
  return without(table, id);
}

/**
 * The top card of a stack into a hand. Face down it goes straight from one
 * secret pile to another; face up it was public already, so it is simply
 * put into the hand.
 */
export function drawToHand(table: TableState, id: string, chair: string, owner: string, count = 1): Step {
  const stack = find(table, id);
  const many = Math.max(1, Math.min(52, count));
  if (stack.face === "down") {
    return {
      table,
      call: {
        fn: "pile_move",
        args: { p_from: stackSlot(id), p_to: handSlot(chair), p_count: many, p_to_owner: owner },
      },
    };
  }
  const cards = stack.cards ?? [];
  const taken = cards.slice(0, many);
  if (taken.length === 0) return { table };
  return {
    table: replaced(table, { ...stack, cards: cards.slice(taken.length) }),
    call: { fn: "pile_put", args: { p_to: handSlot(chair), p_cards: taken, p_to_owner: owner } },
  };
}

export type Placement =
  | { kind: "new"; x: number; y: number; face: Facing; layout?: Layout; mine?: { chair: string; owner: string } }
  | { kind: "onto"; id: string };

/**
 * Cards from your hand onto the felt: into a new stack wherever you put them,
 * face up or face down (and, face down, optionally still yours to read), or
 * onto a stack already there, taking that stack's facing. Several at once go
 * down together, in the order they were picked up.
 */
export function playCards(
  table: TableState,
  chair: string,
  cards: string[],
  where: Placement,
  random: () => number = Math.random,
): Step {
  const from = handSlot(chair);
  if (cards.length === 0) return { table };

  if (where.kind === "onto") {
    const target = find(table, where.id);
    if (target.face === "up") {
      return {
        table: replaced(table, {
          ...target,
          cards: [...cards, ...(target.cards ?? [])],
          z: topZ(table.stacks),
        }),
        call: { fn: "pile_take", args: { p_from: from, p_cards: cards } },
      };
    }
    return {
      table: replaced(table, { ...target, z: topZ(table.stacks) }),
      call: {
        fn: "pile_move",
        args: { p_from: from, p_to: stackSlot(target.id), p_cards: cards },
      },
    };
  }

  const id = stackId(random);
  const base: Stack = {
    id,
    x: clamp01(where.x),
    y: clamp01(where.y),
    face: where.face,
    layout: where.layout ?? (cards.length > 1 ? "fan" : "stack"),
    z: topZ(table.stacks),
  };

  if (where.face === "up") {
    return {
      table: withStack(table, { ...base, cards: [...cards] }),
      call: { fn: "pile_take", args: { p_from: from, p_cards: cards } },
    };
  }

  return {
    table: withStack(table, { ...base, owner: where.mine?.chair ?? null }),
    call: {
      fn: "pile_move",
      args: {
        p_from: from,
        p_to: stackSlot(id),
        p_cards: cards,
        p_to_owner: where.mine?.owner ?? null,
      },
    },
  };
}

/** One card from your hand onto the felt. */
export function playFromHand(
  table: TableState,
  chair: string,
  card: string,
  where: Placement,
  random: () => number = Math.random,
): Step {
  return playCards(table, chair, [card], where, random);
}

/**
 * Turns a stack over. Face up to face down is easy -- everyone saw the cards
 * already -- and turning a pile over reverses it, bottom card now on top.
 * Face down to face up is the database's job: it turns the pile over for
 * everyone at once, and settle() below picks the cards up from there.
 */
export function flipStack(table: TableState, id: string): Step {
  const stack = find(table, id);
  if (stack.face === "up") {
    const cards = [...(stack.cards ?? [])].reverse();
    const next = replaced(table, { ...stack, face: "down", cards: undefined, owner: null });
    if (cards.length === 0) return { table: next };
    return {
      table: next,
      call: { fn: "pile_put", args: { p_to: stackSlot(id), p_cards: cards } },
    };
  }
  return { table, call: { fn: "pile_reveal", args: { p_slots: [stackSlot(id)] } } };
}

/**
 * Turns just the top card of a face-down stack up, next to it. Two calls: the
 * card moves into a pile of its own, then that pile is turned over.
 */
export function turnTopUp(table: TableState, id: string, random: () => number = Math.random): Step {
  const stack = find(table, id);
  if (stack.face !== "down") return { table };
  const fresh = stackId(random);
  return {
    table: withStack(table, {
      id: fresh,
      x: clamp01(stack.x + 0.1),
      y: stack.y,
      face: "down",
      layout: "stack",
      z: topZ(table.stacks),
    }),
    call: {
      fn: "pile_move",
      args: { p_from: stackSlot(id), p_to: stackSlot(fresh), p_count: 1 },
    },
    then: { fn: "pile_reveal", args: { p_slots: [stackSlot(fresh)] } },
  };
}

/**
 * Picks up whatever the database has turned over, into the stacks it came
 * from, and says which secret piles are now empty and can go. Idempotent:
 * run it twice and the second run finds nothing to do.
 */
export function settle(table: TableState): { table: TableState; drop: string[] } | null {
  const revealed = table.revealed ?? {};
  const drop: string[] = [];
  let changed = false;

  const stacks = table.stacks.map((stack) => {
    const slot = stackSlot(stack.id);
    const shown = revealed[slot] as string[] | undefined;
    if (stack.face !== "down" || !shown) return stack;
    changed = true;
    drop.push(slot);
    // Turned over as a whole: the one that was on the bottom is now on top.
    return { ...stack, face: "up" as const, owner: null, cards: [...shown].reverse() };
  });

  if (!changed) return null;

  const nextRevealed = { ...revealed };
  for (const slot of drop) delete nextRevealed[slot];
  return { table: { ...table, stacks, revealed: nextRevealed }, drop };
}

/** Puts one stack on top of another, if they face the same way. */
export function mergeStacks(table: TableState, fromId: string, toId: string, piles?: PileMeta): Step {
  if (fromId === toId) return { table };
  const from = find(table, fromId);
  const to = find(table, toId);
  if (from.face !== to.face) return { table: moveStack(table, fromId, to.x + 0.06, to.y + 0.06) };

  if (from.face === "up") {
    return {
      table: replaced(without(table, fromId), {
        ...to,
        cards: [...(from.cards ?? []), ...(to.cards ?? [])],
        z: topZ(table.stacks),
      }),
    };
  }

  const size = piles?.[stackSlot(fromId)]?.size ?? 0;
  const next = without(table, fromId);
  if (size === 0) return { table: next };
  return {
    table: next,
    call: {
      fn: "pile_move",
      args: { p_from: stackSlot(fromId), p_to: stackSlot(toId), p_count: size },
    },
  };
}

/** Lifts the top n cards off a stack into a new one beside it. */
export function splitStack(
  table: TableState,
  id: string,
  n: number,
  random: () => number = Math.random,
): Step {
  const stack = find(table, id);
  const fresh = stackId(random);
  const placed: Stack = {
    id: fresh,
    x: clamp01(stack.x + 0.08),
    y: clamp01(stack.y + 0.08),
    face: stack.face,
    layout: "stack",
    z: topZ(table.stacks),
  };

  if (stack.face === "up") {
    const cards = stack.cards ?? [];
    const take = Math.max(1, Math.min(cards.length - 1, n));
    if (cards.length < 2) return { table };
    return {
      table: withStack(replaced(table, { ...stack, cards: cards.slice(take) }), {
        ...placed,
        cards: cards.slice(0, take),
      }),
    };
  }

  return {
    table: withStack(table, placed),
    call: {
      fn: "pile_move",
      args: { p_from: stackSlot(id), p_to: stackSlot(fresh), p_count: Math.max(1, n) },
    },
  };
}

export function shuffleStack(table: TableState, id: string, random: () => number = Math.random): Step {
  const stack = find(table, id);
  if (stack.face === "down") {
    return { table, call: { fn: "pile_shuffle", args: { p_slot: stackSlot(id) } } };
  }
  const cards = [...(stack.cards ?? [])];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return { table: replaced(table, { ...stack, cards }) };
}

/** Cuts a stack: the top part goes underneath. Null cuts where a hand would. */
export function cutStack(table: TableState, id: string, at: number | null): Step {
  const stack = find(table, id);
  if (stack.face === "down") {
    return { table, call: { fn: "pile_cut", args: { p_slot: stackSlot(id), p_at: at } } };
  }
  const cards = stack.cards ?? [];
  if (cards.length < 2) return { table };
  const cut = Math.max(1, Math.min(cards.length - 1, at ?? Math.ceil(cards.length / 2)));
  return { table: replaced(table, { ...stack, cards: [...cards.slice(cut), ...cards.slice(0, cut)] }) };
}

/**
 * Deals round the table from a face-down stack, each chair's cards going to
 * whoever sits in it -- or to the dealer, for an empty chair on a phone passed
 * round. Nothing is named: the database deals off a pile nobody can read.
 */
export function dealFrom(
  table: TableState,
  id: string,
  each: number,
  dealer: string,
): Step {
  const stack = find(table, id);
  if (stack.face !== "down") return { table };
  const chairs = chairsFor(table.seatCount);
  return {
    table,
    call: {
      fn: "pile_deal",
      args: {
        p_from: stackSlot(id),
        p_targets: chairs.map((chair) => ({
          slot: handSlot(chair),
          owner: table.holders?.[chair] ?? dealer,
          count: Math.max(0, Math.min(52, each)),
        })),
      },
    },
  };
}

/** Passes cards from your hand to another chair's. Only their new holder learns what. */
export function giveCards(
  table: TableState,
  fromChair: string,
  toChair: string,
  cards: string[],
  dealer: string,
): Step {
  if (cards.length === 0) return { table };
  return {
    table,
    call: {
      fn: "pile_move",
      args: {
        p_from: handSlot(fromChair),
        p_to: handSlot(toChair),
        p_cards: cards,
        p_to_owner: table.holders?.[toChair] ?? dealer,
      },
    },
  };
}

export function giveCard(
  table: TableState,
  fromChair: string,
  toChair: string,
  card: string,
  dealer: string,
): Step {
  return giveCards(table, fromChair, toChair, [card], dealer);
}

/** Lays a whole hand down face up in front of its chair -- a showdown. */
export function showHand(
  table: TableState,
  chair: string,
  cards: string[],
  at: { x: number; y: number },
  random: () => number = Math.random,
): Step {
  if (cards.length === 0) return { table };
  return {
    table: withStack(table, {
      id: stackId(random),
      x: clamp01(at.x),
      y: clamp01(at.y),
      face: "up",
      cards: [...cards],
      layout: "fan",
      label: undefined,
      z: topZ(table.stacks),
    }),
    call: { fn: "pile_take", args: { p_from: handSlot(chair), p_cards: cards } },
  };
}

/**
 * Takes face-up cards out of a spread stack and into a hand -- picking the
 * ones you want out of a fanned discard pile.
 */
export function takeCards(
  table: TableState,
  id: string,
  indices: number[],
  chair: string,
  owner: string,
): Step {
  const stack = find(table, id);
  const cards = stack.cards ?? [];
  const wanted = new Set(indices.filter((i) => i >= 0 && i < cards.length));
  if (stack.face !== "up" || wanted.size === 0) return { table };
  const taken = cards.filter((_, i) => wanted.has(i));
  return {
    table: replaced(table, { ...stack, cards: cards.filter((_, i) => !wanted.has(i)) }),
    call: { fn: "pile_put", args: { p_to: handSlot(chair), p_cards: taken, p_to_owner: owner } },
  };
}

export function takeCard(table: TableState, id: string, index: number, chair: string, owner: string): Step {
  return takeCards(table, id, [index], chair, owner);
}

/**
 * Cards out of your hand for cards off a face-up stack, in one move: a
 * draw-and-discard turn, or swapping what you are holding for what is lying
 * there. The hand gives first, so a refusal leaves the table as it was.
 */
export function swapCards(
  table: TableState,
  chair: string,
  give: string[],
  id: string,
  indices: number[],
  owner: string,
): Step {
  const stack = find(table, id);
  const cards = stack.cards ?? [];
  const wanted = new Set(indices.filter((i) => i >= 0 && i < cards.length));
  if (stack.face !== "up" || give.length === 0 || wanted.size === 0) return { table };
  const taken = cards.filter((_, i) => wanted.has(i));
  const kept = cards.filter((_, i) => !wanted.has(i));
  return {
    table: replaced(table, { ...stack, cards: [...give, ...kept], z: topZ(table.stacks) }),
    call: { fn: "pile_take", args: { p_from: handSlot(chair), p_cards: give } },
    then: { fn: "pile_put", args: { p_to: handSlot(chair), p_cards: taken, p_to_owner: owner } },
    undo: (live: TableState) => {
      const there = live.stacks.find((s) => s.id === id);
      if (!there || there.face !== "up") return live;
      return replaced(live, { ...there, cards: [...taken, ...(there.cards ?? [])] });
    },
  };
}

/** Everything back into its decks, freshly shuffled. */
export function gather(table: TableState, random: () => number = Math.random): Step {
  return setTable({ ...table, stacks: [] }, random);
}

/** Converts a table saved before stacks existed. Its leaky hands are left behind. */
export function upgrade(state: unknown): TableState {
  const s = (state ?? {}) as Partial<TableState> & {
    config?: DeckConfig;
    seats?: Record<string, string | null>;
  };
  if (s.version === 2 && Array.isArray(s.stacks) && Array.isArray(s.decks)) return s as TableState;

  const table = emptyTable();
  if (s.config) {
    table.decks = [{ ...table.decks[0], config: s.config }];
  }
  table.seats = s.seats ?? {};
  table.seatCount = typeof s.seatCount === "number" ? s.seatCount : 4;
  table.teams = typeof s.teams === "number" ? s.teams : 0;
  table.dealEach = typeof s.dealEach === "number" ? s.dealEach : 5;
  return table;
}

// ---------------------------------------------------------------------------
// Holding a hand
//
// The order of a hand is nobody else's business, so it is kept on the device
// holding it rather than in the pile. These work out what that order means
// when cards come and go.
// ---------------------------------------------------------------------------

export type SortBy = "dealt" | "rank" | "suit" | "deck";

/** Where a card sits when a hand is sorted: deck, then suit, then rank. */
function cardOrder(card: string, decks: DeckDef[]): [number, number, number, string] {
  const { deck, face } = readFace(card, decks);
  const deckAt = Math.max(0, decks.findIndex((d) => d.id === deck?.id));
  switch (face.kind) {
    case "standard":
      return [deckAt, SUITS.indexOf(face.suit), RANKS.indexOf(face.rank), card];
    case "joker":
      return [deckAt, SUITS.length, face.n, card];
    case "major":
      return [deckAt, -1, face.n, card];
    case "minor":
      return [deckAt, TAROT_SUITS.indexOf(face.suit), face.n, card];
    case "custom": {
      const at = deck?.custom?.findIndex((c) => c.id === face.card.id) ?? 0;
      return [deckAt, 0, at, card];
    }
    default:
      return [deckAt, 99, 99, card];
  }
}

/** A hand put in order: by rank across suits, by suit, or by which deck it came from. */
export function sortHand(cards: string[], decks: DeckDef[], by: SortBy): string[] {
  if (by === "dealt") return [...cards];
  const keyed = cards.map((card) => ({ card, key: cardOrder(card, decks) }));
  keyed.sort((a, b) => {
    const [ad, as_, ar, at] = a.key;
    const [bd, bs, br, bt] = b.key;
    if (by === "deck" && ad !== bd) return ad - bd;
    if (by === "rank" && ar !== br) return ar - br;
    if (as_ !== bs) return as_ - bs;
    if (ar !== br) return ar - br;
    if (ad !== bd) return ad - bd;
    return at.localeCompare(bt);
  });
  return keyed.map((k) => k.card);
}

/**
 * The hand as its holder arranged it. Cards they have moved keep their place;
 * cards they have not seen before -- just drawn, just given -- go on the end,
 * where a hand picks them up. Identical cards count one apiece.
 */
export function arrangeHand(cards: string[], order: string[] | null | undefined): string[] {
  if (!order || order.length === 0) return [...cards];
  const left = new Map<string, number>();
  for (const card of cards) left.set(card, (left.get(card) ?? 0) + 1);
  const out: string[] = [];
  for (const card of order) {
    const have = left.get(card) ?? 0;
    if (have <= 0) continue;
    left.set(card, have - 1);
    out.push(card);
  }
  for (const card of cards) {
    const have = left.get(card) ?? 0;
    if (have <= 0) continue;
    left.set(card, have - 1);
    out.push(card);
  }
  return out;
}

/** The same cards with one run of them moved to sit before another place. */
export function reorderHand(cards: string[], from: number[], to: number): string[] {
  const moving = from.filter((i) => i >= 0 && i < cards.length).sort((a, b) => a - b);
  if (moving.length === 0) return [...cards];
  const taken = moving.map((i) => cards[i]);
  const rest = cards.filter((_, i) => !moving.includes(i));
  // Where the gap lands once the moved cards are out of the way.
  const before = moving.filter((i) => i < to).length;
  const at = Math.max(0, Math.min(rest.length, to - before));
  return [...rest.slice(0, at), ...taken, ...rest.slice(at)];
}

/**
 * How many cards the table can account for against how many it was set with.
 * Face-up stacks carry their cards; everything else is a pile, and the table
 * is told each pile's size. A difference means a move went astray, and the
 * way back is to gather everything up and deal again.
 */
export function tally(table: TableState, piles: PileMeta | undefined): { held: number; expected: number } {
  let held = 0;
  for (const stack of table.stacks) {
    if (stack.face === "up") held += stack.cards?.length ?? 0;
  }
  for (const [slot, info] of Object.entries(piles ?? {})) {
    if (slot.startsWith("stack:") || slot.startsWith("hand:")) held += info?.size ?? 0;
  }
  const expected = table.decks.reduce((sum, deck) => sum + deckCards(deck).length, 0);
  return { held, expected };
}
