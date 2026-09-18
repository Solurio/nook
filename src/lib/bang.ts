// BANG! -- the Wild West card game of hidden roles. The Sheriff is known to
// all; everyone else's role is a secret pile only its owner can read. Hands
// are secret piles, the draw deck is read by nobody, and what is in front of
// each player -- guns, horses, barrels, jail, dynamite -- is out in the open.
//
// This module is the rules: pure, and a state machine in which it is always
// clear whose move it is. The database does the dealing, the drawing and the
// turning over; the table component says which to ask it for.

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

export type Suit = "S" | "H" | "D" | "C";

export type CardName =
  | "bang"
  | "missed"
  | "beer"
  | "saloon"
  | "stagecoach"
  | "wellsfargo"
  | "store"
  | "panic"
  | "catbalou"
  | "duel"
  | "indians"
  | "gatling"
  | "barrel"
  | "scope"
  | "mustang"
  | "jail"
  | "dynamite"
  | "volcanic"
  | "schofield"
  | "remington"
  | "carabine"
  | "winchester";

export interface CardInfo {
  name: CardName;
  suit: Suit;
  /** 2..10, J, Q, K, A. */
  rank: string;
}

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** The base game's eighty cards, each with the suit and value its "draw!" checks read. */
const LIST: Array<[CardName, string]> = [
  ["bang", "AS"],
  ...RANKS.map((r) => ["bang", `${r}D`] as [CardName, string]),
  ...["2", "3", "4", "5", "6", "7", "8", "9"].map((r) => ["bang", `${r}C`] as [CardName, string]),
  ["bang", "QH"],
  ["bang", "KH"],
  ["bang", "AH"],
  ...["10", "J", "Q", "K", "A"].map((r) => ["missed", `${r}C`] as [CardName, string]),
  ...["2", "3", "4", "5", "6", "7", "8"].map((r) => ["missed", `${r}S`] as [CardName, string]),
  ...["6", "7", "8", "9", "10", "J"].map((r) => ["beer", `${r}H`] as [CardName, string]),
  ["saloon", "5H"],
  ["stagecoach", "9S"],
  ["stagecoach", "9S"],
  ["wellsfargo", "3H"],
  ["store", "9C"],
  ["store", "QS"],
  ["panic", "JH"],
  ["panic", "QH"],
  ["panic", "AH"],
  ["panic", "8D"],
  ["catbalou", "KH"],
  ["catbalou", "9D"],
  ["catbalou", "10D"],
  ["catbalou", "JD"],
  ["duel", "QD"],
  ["duel", "JS"],
  ["duel", "8C"],
  ["indians", "KD"],
  ["indians", "AD"],
  ["gatling", "10H"],
  ["barrel", "QS"],
  ["barrel", "KS"],
  ["scope", "AS"],
  ["mustang", "8H"],
  ["mustang", "9H"],
  ["jail", "JS"],
  ["jail", "10S"],
  ["jail", "4H"],
  ["dynamite", "2H"],
  ["volcanic", "10S"],
  ["volcanic", "10C"],
  ["schofield", "JC"],
  ["schofield", "QC"],
  ["schofield", "KS"],
  ["remington", "KC"],
  ["carabine", "AC"],
  ["winchester", "8S"],
];

/** Every card is its own id, so two BANG!s are never confused. */
export const CARDS: Record<string, CardInfo> = Object.fromEntries(
  LIST.map(([name, code], i) => [
    `${name}-${String(i).padStart(2, "0")}`,
    { name, rank: code.slice(0, -1), suit: code.slice(-1) as Suit },
  ]),
);

export const DECK: string[] = Object.keys(CARDS);

export const info = (id: string): CardInfo => CARDS[id] ?? { name: "bang", suit: "S", rank: "?" };
export const nameOf = (id: string): CardName => info(id).name;

export const CARD_TITLE: Record<CardName, string> = {
  bang: "BANG!",
  missed: "Missed!",
  beer: "Beer",
  saloon: "Saloon",
  stagecoach: "Stagecoach",
  wellsfargo: "Wells Fargo",
  store: "General Store",
  panic: "Panic!",
  catbalou: "Cat Balou",
  duel: "Duel",
  indians: "Indians!",
  gatling: "Gatling",
  barrel: "Barrel",
  scope: "Scope",
  mustang: "Mustang",
  jail: "Jail",
  dynamite: "Dynamite",
  volcanic: "Volcanic",
  schofield: "Schofield",
  remington: "Remington",
  carabine: "Rev. Carabine",
  winchester: "Winchester",
};

export const CARD_TEXT: Record<CardName, string> = {
  bang: "shoot a player within the reach of your gun. Once a turn.",
  missed: "cancel a shot aimed at you.",
  beer: "one life back. Useless with only two left standing.",
  saloon: "everyone still in gets a life back.",
  stagecoach: "draw two cards.",
  wellsfargo: "draw three cards.",
  store: "turn up one card for each player; everyone takes one, starting with you.",
  panic: "take a card from a player at distance 1: blind from their hand, or one in front of them.",
  catbalou: "make any player discard a card: blind from their hand, or one in front of them.",
  duel: "you and a player take turns discarding a BANG!. The first who cannot loses a life.",
  indians: "every other player discards a BANG! or loses a life.",
  gatling: "a shot at every other player.",
  barrel: "when shot, draw!: a heart and it missed.",
  scope: "you see everyone one closer.",
  mustang: "everyone sees you one further away.",
  jail: "put it on another player (not the Sheriff). At their turn, draw!: a heart and they walk out; otherwise they skip the turn.",
  dynamite: "at your turn, draw!: a spade from 2 to 9 and it blows -- three lives. Otherwise it passes on.",
  volcanic: "reach 1, and as many BANG!s a turn as you like.",
  schofield: "a gun with reach 2.",
  remington: "a gun with reach 3.",
  carabine: "a gun with reach 4.",
  winchester: "a gun with reach 5.",
};

const BLUE: CardName[] = ["barrel", "scope", "mustang", "jail", "dynamite", "volcanic", "schofield", "remington", "carabine", "winchester"];
export const isBlue = (id: string) => BLUE.includes(nameOf(id));
const GUNS: Partial<Record<CardName, number>> = { volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5 };
export const isGun = (id: string) => nameOf(id) in GUNS;

export const isRed = (id: string) => info(id).suit === "H" || info(id).suit === "D";
const rankValue = (rank: string) => (rank === "A" ? 14 : rank === "K" ? 13 : rank === "Q" ? 12 : rank === "J" ? 11 : Number(rank));
/** Dynamite goes off on a spade from 2 to 9. */
export const blowsUp = (id: string) => info(id).suit === "S" && rankValue(info(id).rank) >= 2 && rankValue(info(id).rank) <= 9;
export const SUIT_MARK: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

// ---------------------------------------------------------------------------
// Roles and characters
// ---------------------------------------------------------------------------

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

export const ROLE_NAME: Record<Role, string> = { sheriff: "Sheriff", deputy: "Deputy", outlaw: "Outlaw", renegade: "Renegade" };
export const ROLE_GOAL: Record<Role, string> = {
  sheriff: "kill every Outlaw and the Renegade.",
  deputy: "keep the Sheriff alive; kill every Outlaw and the Renegade.",
  outlaw: "kill the Sheriff.",
  renegade: "be the last one standing -- the Sheriff last of all.",
};

export const MIN_SEATS = 4;
export const MAX_SEATS = 7;

export function rolesFor(players: number): Role[] {
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, players));
  const out: Role[] = ["sheriff", "renegade", "outlaw", "outlaw"];
  if (n >= 5) out.push("deputy");
  if (n >= 6) out.push("outlaw");
  if (n >= 7) out.push("deputy");
  return out;
}

export type Character =
  | "bart"
  | "blackjack"
  | "calamity"
  | "gringo"
  | "jesse"
  | "jourdonnais"
  | "kit"
  | "lucky"
  | "paul"
  | "pedro"
  | "rose"
  | "sid"
  | "slab"
  | "suzy"
  | "vulture"
  | "willy";

export const CHARACTERS: Record<Character, { name: string; life: number; text: string }> = {
  bart: { name: "Bart Cassidy", life: 4, text: "each time he loses a life, he draws a card." },
  blackjack: { name: "Black Jack", life: 4, text: "shows the second card he draws; a heart or a diamond and he draws one more." },
  calamity: { name: "Calamity Janet", life: 4, text: "uses BANG! as Missed! and Missed! as BANG!." },
  gringo: { name: "El Gringo", life: 3, text: "each time a player costs him a life, he takes a card blind from that player's hand." },
  jesse: { name: "Jesse Jones", life: 4, text: "may take his first card blind from another player's hand." },
  jourdonnais: { name: "Jourdonnais", life: 4, text: "always has a Barrel." },
  kit: { name: "Kit Carlson", life: 4, text: "draws three, keeps two, and puts one back on the deck." },
  lucky: { name: "Lucky Duke", life: 4, text: "turns up two cards for every draw! and keeps the better." },
  paul: { name: "Paul Regret", life: 3, text: "everyone sees him one further away." },
  pedro: { name: "Pedro Ramirez", life: 4, text: "may take his first card from the top of the discards." },
  rose: { name: "Rose Doolan", life: 4, text: "sees everyone one closer." },
  sid: { name: "Sid Ketchum", life: 4, text: "may discard two cards to get a life back, any time." },
  slab: { name: "Slab the Killer", life: 4, text: "a BANG! from him takes two Missed! to stop." },
  suzy: { name: "Suzy Lafayette", life: 4, text: "draws a card whenever her hand runs out." },
  vulture: { name: "Vulture Sam", life: 4, text: "takes every card of anyone who is killed." },
  willy: { name: "Willy the Kid", life: 4, text: "can play as many BANG!s a turn as he likes." },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as Character[];

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const DECK_PILE = "deck";
export const ROLES_PILE = "roles";
/** Where a card taken blind from a hand waits to be turned over into the discards. */
export const LIMBO = "limbo";
export const handSlot = (chair: string) => `hand:${chair}`;
export const roleSlot = (chair: string) => `role:${chair}`;
export const checkKey = (n: number) => `check:${n}`;
export const storeKey = (n: number) => `store:${n}`;
export const limboKey = (n: number) => `limbo:${n}`;

export interface Player {
  character: Character;
  life: number;
  max: number;
  /** Blue cards in front of them. */
  inPlay: string[];
  /** Public once they are the Sheriff, or dead. */
  role?: Role;
  dead?: boolean;
}

/** A draw! in progress: what for, and whose. */
export interface Check {
  n: number;
  who: string;
  why: "dynamite" | "jail" | "barrel" | "blackjack";
}

export type Pending =
  /** A shot: the target plays Missed!, tries a barrel, or takes it. */
  | { kind: "shot"; from: string; card: CardName; targets: string[]; need: number; got: number; barrel: boolean }
  | { kind: "indians"; from: string; targets: string[] }
  | { kind: "duel"; from: string; to: string; turnOf: string }
  | { kind: "store"; from: string; n: number; order: string[]; taken: string[] }
  /** At no lives left: drink a Beer, or fall. */
  | { kind: "dying"; who: string; by: string | null; then: Pending | null };

export interface BangState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  players: Record<string, Player>;
  /** Everyone who sat down this game, round the table. */
  order: string[];
  turn: string;
  /** Where the turn has got to. */
  step: "checks" | "draw" | "main" | "discard";
  bangs: number;
  discard: string[];
  pending: Pending | null;
  check: Check | null;
  /** Rewards and penalties owed, settled by the device that holds the hand. */
  owed: Array<{ to: string; draw?: number; discardAll?: boolean; from?: string; blind?: number }>;
  counter: number;
  /** Kit Carlson has drawn three and owes one back to the deck. */
  kitBack?: boolean;
  winner?: "sheriff" | "outlaws" | "renegade";
  log: string[];
  round: number;
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyBang(seatCount = 5): BangState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    phase: "idle",
    players: {},
    order: [],
    turn: "s0",
    step: "checks",
    bangs: 0,
    discard: [],
    pending: null,
    check: null,
    owed: [],
    counter: 0,
    log: [],
    round: 0,
  };
}

const note = (log: string[], line: string) => [...log.slice(-30), line];
const shuffle = <T>(items: T[], random: (max: number) => number): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/**
 * A new game. The Sheriff is chosen here, in the open, since everyone gets to
 * know anyway; the other roles are shuffled and dealt by the database, and
 * nobody -- the dealer included -- learns who got which.
 */
export function startGame(
  state: BangState,
  chairs: string[],
  random: (max: number) => number,
  name: (c: string) => string = (c) => c,
): { state: BangState; sheriff: string; otherRoles: Role[]; hands: Record<string, number> } {
  const sheriff = chairs[random(chairs.length)];
  const characters = shuffle(CHARACTER_IDS, random).slice(0, chairs.length);
  const players: Record<string, Player> = {};
  chairs.forEach((chair, i) => {
    const character = characters[i];
    const max = CHARACTERS[character].life + (chair === sheriff ? 1 : 0);
    players[chair] = { character, life: max, max, inPlay: [], ...(chair === sheriff ? { role: "sheriff" as Role } : {}) };
  });
  const otherRoles = rolesFor(chairs.length).filter((r) => r !== "sheriff");
  return {
    state: {
      ...state,
      phase: "play",
      players,
      order: chairs,
      turn: sheriff,
      step: "checks",
      bangs: 0,
      discard: [],
      pending: null,
      check: null,
      owed: [],
      winner: undefined,
      round: state.round + 1,
      log: [`${name(sheriff)} wears the star`],
    },
    sheriff,
    otherRoles,
    hands: Object.fromEntries(chairs.map((c) => [c, players[c].life])),
  };
}

export const alive = (state: BangState) => state.order.filter((c) => state.players[c] && !state.players[c].dead);
const has = (state: BangState, chair: string, card: CardName) => state.players[chair]?.inPlay.some((id) => nameOf(id) === card) ?? false;
const is = (state: BangState, chair: string, character: Character) => state.players[chair]?.character === character;

/** How far apart two players sit, the way BANG! counts it. */
export function distance(state: BangState, from: string, to: string): number {
  const ring = alive(state);
  const a = ring.indexOf(from);
  const b = ring.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 0;
  const around = Math.abs(a - b);
  let d = Math.min(around, ring.length - around);
  if (has(state, to, "mustang")) d += 1;
  if (is(state, to, "paul")) d += 1;
  if (has(state, from, "scope")) d -= 1;
  if (is(state, from, "rose")) d -= 1;
  return Math.max(1, d);
}

/** How far a player's gun reaches: a Colt .45 is 1. */
export function reach(state: BangState, chair: string): number {
  const gun = state.players[chair]?.inPlay.find(isGun);
  return gun ? (GUNS[nameOf(gun)] ?? 1) : 1;
}

export function canShootAgain(state: BangState, chair: string): boolean {
  return state.bangs < 1 || has(state, chair, "volcanic") || is(state, chair, "willy");
}

/** What a card in hand may be aimed at, if anything. */
export function targetsFor(state: BangState, by: string, card: string): string[] | null {
  const others = alive(state).filter((c) => c !== by);
  const name = nameOf(card);
  const asBang = name === "bang" || (name === "missed" && is(state, by, "calamity"));
  if (asBang) return canShootAgain(state, by) ? others.filter((c) => distance(state, by, c) <= reach(state, by)) : [];
  switch (name) {
    case "panic":
      return others.filter((c) => distance(state, by, c) <= 1);
    case "catbalou":
    case "duel":
      return others;
    case "jail":
      return others.filter((c) => state.players[c].role !== "sheriff" && !has(state, c, "jail"));
    default:
      return null;
  }
}

/** Whether a card can be played from hand at all, on your own turn. */
export function playable(state: BangState, by: string, card: string): boolean {
  if (state.phase !== "play" || state.turn !== by || state.step !== "main" || state.pending || state.check) return false;
  const name = nameOf(card);
  const aimed = targetsFor(state, by, card);
  if (aimed) return aimed.length > 0;
  if (name === "missed") return false;
  if (name === "beer") return state.players[by].life < state.players[by].max && alive(state).length > 2;
  if (isBlue(card)) {
    if (name === "jail") return false;
    // One of each thing in front of you; a new gun replaces the old one.
    return isGun(card) || !has(state, by, name);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Playing cards
// ---------------------------------------------------------------------------

export interface Effect {
  /** Cards for the player to draw into their own hand. */
  draw?: number;
  /** Cards to turn up from the deck for the General Store. */
  store?: number;
  /** A card to take blind from a hand: into yours (Panic!) or into the discards (Cat Balou). */
  blind?: { from: string; to: "hand" | "discard" };
}

/**
 * A card leaves a hand and does its thing. `pick` is a card in front of the
 * target, for Panic! and Cat Balou, when the player chose one of those rather
 * than a card blind from the hand.
 */
export function play(
  state: BangState,
  by: string,
  card: string,
  target: string | null,
  name: (c: string) => string,
  pick?: string,
): { state: BangState; effect?: Effect } {
  const kind = nameOf(card);
  const title = CARD_TITLE[kind];
  const me = { ...state.players[by], inPlay: [...state.players[by].inPlay] };
  const players = { ...state.players, [by]: me };
  let next: BangState = { ...state, players };
  const say = (line: string) => note(next.log, line);
  const toDiscard = (id: string) => [id, ...next.discard];

  if (isBlue(card)) {
    if (kind === "jail" && target) {
      const them = { ...players[target], inPlay: [...players[target].inPlay, card] };
      return { state: { ...next, players: { ...players, [target]: them }, log: say(`${name(by)} put ${name(target)} in jail`) } };
    }
    if (isGun(card)) {
      const old = me.inPlay.find(isGun);
      if (old) {
        me.inPlay = me.inPlay.filter((id) => id !== old);
        next = { ...next, discard: toDiscard(old) };
      }
    }
    me.inPlay.push(card);
    return { state: { ...next, log: say(`${name(by)} put down a ${title}`) } };
  }

  next = { ...next, discard: toDiscard(card) };
  const others = alive(state).filter((c) => c !== by);

  if (kind === "bang" || (kind === "missed" && is(state, by, "calamity"))) {
    if (!target) return { state };
    return {
      state: {
        ...next,
        bangs: next.bangs + 1,
        pending: { kind: "shot", from: by, card: "bang", targets: [target], need: is(state, by, "slab") ? 2 : 1, got: 0, barrel: false },
        log: say(`${name(by)} shoots at ${name(target)}`),
      },
    };
  }

  switch (kind) {
    case "beer":
      me.life = Math.min(me.max, me.life + 1);
      return { state: { ...next, log: say(`${name(by)} drinks a beer`) } };
    case "saloon":
      for (const c of alive(state)) players[c] = { ...players[c], life: Math.min(players[c].max, players[c].life + 1) };
      return { state: { ...next, players, log: say(`${name(by)} buys a round at the saloon`) } };
    case "stagecoach":
      return { state: { ...next, log: say(`${name(by)} takes the stagecoach`) }, effect: { draw: 2 } };
    case "wellsfargo":
      return { state: { ...next, log: say(`${name(by)} robs Wells Fargo`) }, effect: { draw: 3 } };
    case "store": {
      const ring = alive(state);
      const at = ring.indexOf(by);
      const order = [...ring.slice(at), ...ring.slice(0, at)];
      const n = next.counter + 1;
      return {
        state: { ...next, counter: n, pending: { kind: "store", from: by, n, order, taken: [] }, log: say(`${name(by)} opens the general store`) },
        effect: { store: order.length },
      };
    }
    case "gatling":
      return {
        state: {
          ...next,
          pending: { kind: "shot", from: by, card: "gatling", targets: others, need: 1, got: 0, barrel: false },
          log: say(`${name(by)} opens up with the Gatling`),
        },
      };
    case "indians":
      return { state: { ...next, pending: { kind: "indians", from: by, targets: others }, log: say(`Indians! -- sent by ${name(by)}`) } };
    case "duel":
      if (!target) return { state };
      return { state: { ...next, pending: { kind: "duel", from: by, to: target, turnOf: target }, log: say(`${name(by)} calls ${name(target)} out`) } };
    case "panic":
    case "catbalou": {
      if (!target) return { state };
      if (pick) {
        const them = { ...players[target], inPlay: players[target].inPlay.filter((id) => id !== pick) };
        players[target] = them;
        if (kind === "panic") return { state: { ...next, players, log: say(`${name(by)} takes ${name(target)}'s ${CARD_TITLE[nameOf(pick)]}`) }, effect: {} };
        return { state: { ...next, players, discard: [pick, ...next.discard], log: say(`${name(by)} makes ${name(target)} throw away their ${CARD_TITLE[nameOf(pick)]}`) } };
      }
      return {
        state: { ...next, log: say(kind === "panic" ? `${name(by)} takes a card from ${name(target)}'s hand` : `${name(by)} makes ${name(target)} throw away a card`) },
        effect: { blind: { from: target, to: kind === "panic" ? "hand" : "discard" } },
      };
    }
    default:
      return { state: next };
  }
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

/** Who has to answer next, if the table is waiting on someone. */
export function waitingOn(state: BangState): string | null {
  const p = state.pending;
  if (!p) return null;
  switch (p.kind) {
    case "shot":
    case "indians":
      return p.targets[0] ?? null;
    case "duel":
      return p.turnOf;
    case "store":
      return p.order[0] ?? null;
    case "dying":
      return p.who;
  }
}

/** Moves a shared attack on to its next target, or ends it. */
function nextTarget(state: BangState): BangState {
  const p = state.pending;
  if (!p || (p.kind !== "shot" && p.kind !== "indians")) return state;
  const targets = p.targets.slice(1).filter((c) => !state.players[c]?.dead);
  if (targets.length === 0) return { ...state, pending: null };
  return { ...state, pending: p.kind === "shot" ? { ...p, targets, got: 0, barrel: false } : { ...p, targets } };
}

/** A Missed! (or a barrel that came up hearts) against the shot in front of you. */
export function dodge(state: BangState, name: (c: string) => string, card?: string): BangState {
  const p = state.pending;
  if (!p || p.kind !== "shot") return state;
  const who = p.targets[0];
  const discard = card ? [card, ...state.discard] : state.discard;
  const got = p.got + 1;
  const log = note(state.log, `${name(who)} dodges${card ? "" : ", thanks to the barrel"}`);
  if (got < p.need) return { ...state, discard, log, pending: { ...p, got } };
  return nextTarget({ ...state, discard, log });
}

/** The barrel's draw! came up, whatever it was. */
export function barrelTried(state: BangState): BangState {
  const p = state.pending;
  if (!p || p.kind !== "shot") return state;
  return { ...state, pending: { ...p, barrel: true } };
}

/** Losing lives. Returns the state, and whether the player is now at the edge. */
export function hurt(state: BangState, who: string, amount: number, by: string | null, name: (c: string) => string): BangState {
  const player = { ...state.players[who] };
  player.life -= amount;
  let next: BangState = { ...state, players: { ...state.players, [who]: player }, log: note(state.log, `${name(who)} loses ${amount === 1 ? "a life" : `${amount} lives`}`) };
  const owed = [...next.owed];
  if (player.character === "bart" && player.life > 0) owed.push({ to: who, draw: amount });
  if (player.character === "gringo" && by && by !== who && player.life > 0) owed.push({ to: who, from: by, blind: amount });
  next = { ...next, owed };
  if (player.life <= 0) {
    const then = next.pending;
    return { ...next, pending: { kind: "dying", who, by, then } };
  }
  return next;
}

/** Taking the hit from whatever is in front of you. */
export function takeIt(state: BangState, name: (c: string) => string): BangState {
  const p = state.pending;
  if (!p) return state;
  if (p.kind === "shot" || p.kind === "indians") {
    const who = p.targets[0];
    const after = nextTarget(state);
    return hurt(after, who, 1, p.from, name);
  }
  if (p.kind === "duel") {
    const loser = p.turnOf;
    const winner = loser === p.to ? p.from : p.to;
    return hurt({ ...state, pending: null }, loser, 1, winner, name);
  }
  return state;
}

/** Discarding a BANG! against Indians! or in a duel. */
export function answerWithBang(state: BangState, card: string, name: (c: string) => string): BangState {
  const p = state.pending;
  if (!p) return state;
  const discard = [card, ...state.discard];
  if (p.kind === "indians") return nextTarget({ ...state, discard, log: note(state.log, `${name(p.targets[0])} fends off the Indians`) });
  if (p.kind === "duel") {
    const other = p.turnOf === p.to ? p.from : p.to;
    return { ...state, discard, pending: { ...p, turnOf: other }, log: note(state.log, `${name(p.turnOf)} fires back`) };
  }
  return state;
}

/** A Beer at no lives left: back up to one. */
export function drinkToLive(state: BangState, card: string, name: (c: string) => string): BangState {
  const p = state.pending;
  if (!p || p.kind !== "dying") return state;
  const player = { ...state.players[p.who], life: state.players[p.who].life + 1 };
  const next = { ...state, discard: [card, ...state.discard], players: { ...state.players, [p.who]: player }, log: note(state.log, `${name(p.who)} drinks a beer to stay up`) };
  return player.life > 0 ? { ...next, pending: p.then } : { ...next, pending: p };
}

/** Whether a dying player is allowed to drink their way back. */
export const canDrinkToLive = (state: BangState) => alive(state).length > 2;

/** Whoever is due a dead player's cards: Vulture Sam, if he is still in. */
export const vultureFor = (state: BangState, dead: string) =>
  alive(state).find((c) => c !== dead && state.players[c].character === "vulture") ?? null;

/**
 * Falling. The dead player's role is turned over by their own device first;
 * this takes it as given. Their cards go to the discards -- or to Vulture Sam,
 * whose hand the device moves them into -- and whoever killed them is paid or
 * punished.
 */
export function fall(state: BangState, role: Role, hand: string[], name: (c: string) => string): BangState {
  const p = state.pending;
  if (!p || p.kind !== "dying") return state;
  const who = p.who;
  const dead = { ...state.players[who], dead: true, life: 0, role, inPlay: [] as string[] };
  const players = { ...state.players, [who]: dead };
  const discard = vultureFor(state, who) ? state.discard : [...state.players[who].inPlay, ...hand, ...state.discard];
  // Anything still owed to the dead goes with them.
  const owed = state.owed.filter((o) => o.to !== who);
  // A dead Outlaw pays three cards to whoever killed them; a Sheriff who kills
  // his own Deputy throws away everything he has.
  if (p.by && p.by !== who && !state.players[p.by]?.dead) {
    if (role === "outlaw") owed.push({ to: p.by, draw: 3 });
    if (role === "deputy" && state.players[p.by].role === "sheriff") owed.push({ to: p.by, discardAll: true });
  }
  let next: BangState = {
    ...state,
    players,
    discard,
    owed,
    pending: p.then && p.then.kind !== "dying" ? p.then : null,
    log: note(state.log, `${name(who)} is dead -- the ${ROLE_NAME[role]}`),
  };
  // Pending attacks carry on past the dead.
  if (next.pending && (next.pending.kind === "shot" || next.pending.kind === "indians")) {
    const targets = next.pending.targets.filter((c) => !next.players[c].dead);
    next = { ...next, pending: targets.length ? { ...next.pending, targets } : null };
  }
  if (next.pending?.kind === "duel") next = { ...next, pending: null };
  const verdict = winnerOf(next);
  if (verdict) return { ...next, phase: "over", winner: verdict, pending: null };
  if (who === state.turn) return endTurn({ ...next, pending: null }, name);
  return next;
}

/**
 * Who has won, once enough roles are known. The Sheriff's side wins when
 * every Outlaw and the Renegade are dead; with the Sheriff dead, the Renegade
 * wins only by being the last one left, and otherwise the Outlaws do.
 */
export function winnerOf(state: BangState): BangState["winner"] | null {
  const roles = rolesFor(state.order.length);
  const dead = state.order.filter((c) => state.players[c]?.dead);
  const deadRoles = dead.map((c) => state.players[c].role);
  const count = (r: Role, list: Array<Role | undefined>) => list.filter((x) => x === r).length;
  const sheriffDead = deadRoles.includes("sheriff");
  if (sheriffDead) {
    const standing = alive(state);
    const allButRenegade = count("outlaw", deadRoles) === count("outlaw", roles) && count("deputy", deadRoles) === count("deputy", roles);
    return standing.length === 1 && allButRenegade ? "renegade" : "outlaws";
  }
  if (count("outlaw", deadRoles) === count("outlaw", roles) && count("renegade", deadRoles) === count("renegade", roles)) return "sheriff";
  return null;
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

/** What has to be drawn for at the start of this turn, in order: dynamite, then jail. */
export function checksDue(state: BangState): Array<"dynamite" | "jail"> {
  const out: Array<"dynamite" | "jail"> = [];
  if (has(state, state.turn, "dynamite")) out.push("dynamite");
  if (has(state, state.turn, "jail")) out.push("jail");
  return out;
}

export function startCheck(state: BangState, why: Check["why"], who: string): BangState {
  const n = state.counter + 1;
  return { ...state, counter: n, check: { n, who, why } };
}

/** How many cards a draw! turns up: Lucky Duke sees two. */
export const checkCount = (state: BangState, who: string) => (is(state, who, "lucky") ? 2 : 1);

/** The better of Lucky Duke's two, for what the check is for. */
export function bestOf(cards: string[], why: Check["why"]): string {
  if (cards.length === 1) return cards[0];
  if (why === "dynamite") return cards.find((c) => !blowsUp(c)) ?? cards[0];
  return cards.find((c) => info(c).suit === "H") ?? cards[0];
}

/** A draw! has come up. The cards go to the discards; what happens depends on why. */
export function checked(state: BangState, cards: string[], name: (c: string) => string): BangState {
  const c = state.check;
  if (!c || cards.length === 0) return state;
  const card = bestOf(cards, c.why);
  const shown = `${info(card).rank}${SUIT_MARK[info(card).suit]}`;
  // Black Jack only shows his card; it stays in his hand. Every other draw!
  // goes on the discards.
  let next: BangState = { ...state, check: null, discard: c.why === "blackjack" ? state.discard : [...cards, ...state.discard] };
  const who = c.who;
  const me = { ...next.players[who], inPlay: [...next.players[who].inPlay] };

  if (c.why === "barrel") {
    const hearts = info(card).suit === "H";
    next = barrelTried({ ...next, log: note(next.log, `${name(who)} draws for the barrel: ${shown}`) });
    return hearts ? dodge(next, name) : next;
  }
  if (c.why === "blackjack") {
    return { ...next, log: note(next.log, `Black Jack shows ${shown}${isRed(card) ? ", and draws again" : ""}`) };
  }
  if (c.why === "dynamite") {
    const dynamite = me.inPlay.find((id) => nameOf(id) === "dynamite") as string;
    me.inPlay = me.inPlay.filter((id) => id !== dynamite);
    if (blowsUp(card)) {
      next = { ...next, players: { ...next.players, [who]: me }, discard: [dynamite, ...next.discard], log: note(next.log, `the dynamite goes off on ${name(who)}: ${shown}`) };
      return hurt(next, who, 3, null, name);
    }
    // Passed on to the next player still in who has no dynamite of their own.
    const ring = alive(next);
    const at = ring.indexOf(who);
    const to = ring[(at + 1) % ring.length];
    const them = { ...next.players[to], inPlay: [...next.players[to].inPlay, dynamite] };
    return { ...next, players: { ...next.players, [who]: me, [to]: them }, log: note(next.log, `the dynamite fizzles (${shown}) and moves on to ${name(to)}`) };
  }
  // Jail.
  const jail = me.inPlay.find((id) => nameOf(id) === "jail") as string;
  me.inPlay = me.inPlay.filter((id) => id !== jail);
  next = { ...next, players: { ...next.players, [who]: me }, discard: [jail, ...next.discard] };
  if (info(card).suit === "H") return { ...next, log: note(next.log, `${name(who)} walks out of jail: ${shown}`) };
  return endTurn({ ...next, log: note(next.log, `${name(who)} stays in jail: ${shown}`) }, name, true);
}

/** Done with the checks; on to drawing. */
export const toDraw = (state: BangState): BangState => ({ ...state, step: "draw" });
export const toMain = (state: BangState, name: (c: string) => string, how = "draws two"): BangState => ({
  ...state,
  step: "main",
  log: note(state.log, `${name(state.turn)} ${how}`),
});

/** Hand size at the end of the turn: no more cards than lives. */
export const mustDiscard = (state: BangState, handSize: number) => Math.max(0, handSize - (state.players[state.turn]?.life ?? 0));

export function endTurn(state: BangState, name: (c: string) => string, jailed = false): BangState {
  const ring = alive(state);
  if (ring.length === 0) return state;
  const at = state.order.indexOf(state.turn);
  let next = state.turn;
  for (let step = 1; step <= state.order.length; step += 1) {
    const c = state.order[(at + step) % state.order.length];
    if (!state.players[c]?.dead) {
      next = c;
      break;
    }
  }
  return {
    ...state,
    turn: next,
    step: "checks",
    bangs: 0,
    pending: null,
    check: null,
    log: jailed ? state.log : note(state.log, `${name(next)}'s turn`),
  };
}

/** Sid Ketchum: two cards away for a life. */
export function sidHeals(state: BangState, who: string, cards: string[], name: (c: string) => string): BangState {
  if (!is(state, who, "sid") || cards.length !== 2) return state;
  const player = { ...state.players[who], life: Math.min(state.players[who].max, state.players[who].life + 1) };
  const next: BangState = { ...state, discard: [...cards, ...state.discard], players: { ...state.players, [who]: player }, log: note(state.log, `${name(who)} trades two cards for a life`) };
  if (state.pending?.kind === "dying" && state.pending.who === who && player.life > 0) return { ...next, pending: state.pending.then };
  return next;
}

/** A card taken from the General Store. */
export function tookFromStore(state: BangState, card: string, name: (c: string) => string): BangState {
  const p = state.pending;
  if (!p || p.kind !== "store") return state;
  const order = p.order.slice(1);
  return {
    ...state,
    pending: order.length ? { ...p, order, taken: [...p.taken, card] } : null,
    log: note(state.log, `${name(p.order[0])} takes the ${CARD_TITLE[nameOf(card)]}`),
  };
}

/** What is left on the General Store's counter. */
export function storeLeft(state: BangState): string[] {
  const p = state.pending;
  if (!p || p.kind !== "store") return [];
  const shown = (state.revealed?.[storeKey(p.n)] as string[] | undefined) ?? [];
  const gone = new Set(p.taken);
  return shown.filter((c) => !gone.has(c));
}
