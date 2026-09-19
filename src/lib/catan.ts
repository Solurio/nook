// Catan. An island of nineteen hexes, each giving a resource when its number
// is rolled; settlements and cities on the corners collect it. Build roads,
// settlements and cities, trade, buy development cards -- first to ten victory
// points wins.
//
// What is secret: the development cards. They are dealt from a deck the
// database shuffles into each player's own pile, and a victory point card
// stays hidden until the moment it wins the game. Resource cards are counted
// in the open (the way a table can count them anyway); the screen only shows
// other players how many they hold.

import { EDGES, HARBOUR_EDGES, HEXES, HEX_NEIGHBORS, VERTICES } from "./catan-board";

export type Resource = "wood" | "brick" | "sheep" | "wheat" | "ore";
export type Terrain = "forest" | "hills" | "pasture" | "fields" | "mountains" | "desert";

export const RESOURCES: Resource[] = ["wood", "brick", "sheep", "wheat", "ore"];

export const YIELD: Record<Terrain, Resource | null> = {
  forest: "wood",
  hills: "brick",
  pasture: "sheep",
  fields: "wheat",
  mountains: "ore",
  desert: null,
};

export type Hand = Record<Resource, number>;

export const emptyHand = (): Hand => ({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 });
export const handSize = (h: Hand) => RESOURCES.reduce((n, r) => n + (h[r] ?? 0), 0);

export const COST = {
  road: { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 },
  city: { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 },
  dev: { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 },
} satisfies Record<string, Hand>;

export const PIECES = { road: 15, settlement: 5, city: 4 };
/** How many of each resource card there are in all. */
export const BANK = 19;
export const WIN = 10;

// ---------------------------------------------------------------------------
// Development cards
// ---------------------------------------------------------------------------

export type DevKind = "knight" | "vp" | "roads" | "plenty" | "monopoly";

export const DEV_NAME: Record<DevKind, string> = {
  knight: "Knight",
  vp: "Victory Point",
  roads: "Road Building",
  plenty: "Year of Plenty",
  monopoly: "Monopoly",
};

export const DEV_TEXT: Record<DevKind, string> = {
  knight: "move the robber and steal a card. Three or more, and the most of anyone, is the Largest Army.",
  vp: "one victory point, kept hidden until it wins you the game.",
  roads: "build two roads for free.",
  plenty: "take any two resources from the bank.",
  monopoly: "name a resource: everyone gives you all of theirs.",
};

/** The twenty-five, each named so it can be picked out of a hand. */
export const DEV_DECK: string[] = [
  ...Array.from({ length: 14 }, (_, i) => `knight-${i + 1}`),
  ...["vp-chapel", "vp-library", "vp-market", "vp-palace", "vp-university"],
  "roads-1",
  "roads-2",
  "plenty-1",
  "plenty-2",
  "monopoly-1",
  "monopoly-2",
];

export const devKind = (card: string): DevKind => card.split("-")[0] as DevKind;

export const DEV_PILE = "devdeck";
export const PLAYED_PILE = "devplayed";
/** Cards you can play. */
export const devSlot = (chair: string) => `dev:${chair}`;
/** Cards bought this turn, which cannot be played until the next. */
export const newSlot = (chair: string) => `new:${chair}`;

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export interface Hex {
  terrain: Terrain;
  number: number | null;
}

export type HarbourKind = Resource | "any";

export interface Harbour {
  edge: number;
  kind: HarbourKind;
}

export interface Board {
  hexes: Hex[];
  harbours: Harbour[];
}

type Random = (max: number) => number;
type Name = (chair: string) => string;

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const TERRAINS: Terrain[] = [
  ...Array<Terrain>(4).fill("forest"),
  ...Array<Terrain>(4).fill("pasture"),
  ...Array<Terrain>(4).fill("fields"),
  ...Array<Terrain>(3).fill("hills"),
  ...Array<Terrain>(3).fill("mountains"),
  "desert",
];
const NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const HARBOURS: HarbourKind[] = ["any", "any", "any", "any", "wood", "brick", "sheep", "wheat", "ore"];

/** Whether two red numbers -- 6 and 8 -- sit side by side. */
export function redsTouch(hexes: Hex[]): boolean {
  const red = (n: number | null) => n === 6 || n === 8;
  return hexes.some((h, i) => red(h.number) && HEX_NEIGHBORS[i].some((j) => red(hexes[j].number)));
}

/** A new island: terrain and numbers shuffled, the 6s and 8s kept apart, harbours shuffled round the coast. */
export function newBoard(random: Random): Board {
  const terrain = shuffle(TERRAINS, random);
  let hexes: Hex[] = [];
  for (let tries = 0; tries < 500; tries += 1) {
    const numbers = shuffle(NUMBERS, random);
    let n = 0;
    hexes = terrain.map((t) => ({ terrain: t, number: t === "desert" ? null : numbers[n++] }));
    if (!redsTouch(hexes)) break;
  }
  const kinds = shuffle(HARBOURS, random);
  return { hexes, harbours: HARBOUR_EDGES.map((edge, i) => ({ edge, kind: kinds[i] })) };
}

/** Dots under a number: how many ways two dice make it. */
export const pips = (n: number) => 6 - Math.abs(7 - n);

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const MIN_SEATS = 2;
export const MAX_SEATS = 4;

export type Step =
  | "setup-settlement"
  | "setup-road"
  | "roll"
  | "discard"
  | "robber"
  | "steal"
  | "main"
  | "roads";

export interface Building {
  chair: string;
  city: boolean;
}

export interface Offer {
  from: string;
  give: Hand;
  want: Hand;
}

export interface CatanState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  board: Board | null;
  robber: number;
  order: string[];
  turn: string;
  step: Step;
  /** Setup goes round and back: whose turn each placement is. */
  setupQueue: string[];
  setupAt: number;
  /** The settlement just put down in setup, which its road has to touch. */
  setupLast: number | null;
  buildings: Record<number, Building>;
  roads: Record<number, string>;
  hands: Record<string, Hand>;
  dice: [number, number] | null;
  /** Counts every roll, so every screen animates each one once. */
  rolls: number;
  /** After a 7, who still owes how many cards. */
  discards: Record<string, number>;
  /** Who can be stolen from, once the robber has moved. */
  victims: string[];
  /** Where to go back to when the robber is done: a knight can be played before rolling. */
  after: "roll" | "main";
  /** Roads still to build free, from Road Building. */
  freeRoads: number;
  knights: Record<string, number>;
  longestRoad: string | null;
  largestArmy: string | null;
  /** A development card was played this turn (only one is allowed). */
  devPlayed: boolean;
  /** Development cards bought: how many each holds, bought this turn or before. */
  devCount: Record<string, number>;
  offer: Offer | null;
  winner?: string;
  /** Victory point cards shown at the end. */
  shownVp: Record<string, number>;
  wins: Record<string, number>;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function emptyCatan(seatCount = 4): CatanState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    phase: "idle",
    board: null,
    robber: 0,
    order: [],
    turn: "s0",
    step: "roll",
    setupQueue: [],
    setupAt: 0,
    setupLast: null,
    buildings: {},
    roads: {},
    hands: {},
    dice: null,
    rolls: 0,
    discards: {},
    victims: [],
    after: "main",
    freeRoads: 0,
    knights: {},
    longestRoad: null,
    largestArmy: null,
    devPlayed: false,
    devCount: {},
    offer: null,
    shownVp: {},
    wins: {},
    log: [],
  };
}

const note = (log: string[], line: string) => [...log.slice(-40), line];

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

/** A new game: a fresh island, a random first player, and setup going round and back. */
export function startGame(state: CatanState, chairs: string[], random: Random, name: Name = (c) => c): CatanState {
  const board = newBoard(random);
  const start = random(chairs.length);
  const order = [...chairs.slice(start), ...chairs.slice(0, start)];
  const setupQueue = [...order, ...[...order].reverse()];
  return {
    ...emptyCatan(state.seatCount),
    seats: state.seats,
    holders: state.holders,
    wins: state.wins ?? {},
    phase: "play",
    board,
    robber: board.hexes.findIndex((h) => h.terrain === "desert"),
    order,
    turn: order[0],
    step: "setup-settlement",
    setupQueue,
    setupAt: 0,
    hands: Object.fromEntries(order.map((c) => [c, emptyHand()])),
    knights: Object.fromEntries(order.map((c) => [c, 0])),
    devCount: Object.fromEntries(order.map((c) => [c, 0])),
    log: [`${name(order[0])} places first`],
  };
}

// ---------------------------------------------------------------------------
// Where things can go
// ---------------------------------------------------------------------------

const count = (state: CatanState, chair: string, what: "road" | "settlement" | "city") =>
  what === "road"
    ? Object.values(state.roads).filter((c) => c === chair).length
    : Object.values(state.buildings).filter((b) => b.chair === chair && b.city === (what === "city")).length;

export const piecesLeft = (state: CatanState, chair: string, what: "road" | "settlement" | "city") => PIECES[what] - count(state, chair, what);

/** Nobody on this corner or the ones next to it. */
function roomFor(state: CatanState, v: number): boolean {
  return !state.buildings[v] && VERTICES[v].neighbors.every((n) => !state.buildings[n]);
}

/** Whether a player's road reaches this corner. */
const roadReaches = (state: CatanState, chair: string, v: number) => VERTICES[v].edges.some((e) => state.roads[e] === chair);

export function canSettle(state: CatanState, chair: string, v: number, setup = false): boolean {
  if (v < 0 || v >= VERTICES.length || !roomFor(state, v)) return false;
  return setup || roadReaches(state, chair, v);
}

export function canRoad(state: CatanState, chair: string, e: number): boolean {
  if (e < 0 || e >= EDGES.length || state.roads[e] !== undefined) return false;
  const { a, b } = EDGES[e];
  if (state.step === "setup-road") return state.setupLast === a || state.setupLast === b;
  // It has to join something of yours -- and a road cannot run on through someone else's town.
  return [a, b].some((v) => {
    const here = state.buildings[v];
    if (here) return here.chair === chair;
    return VERTICES[v].edges.some((o) => o !== e && state.roads[o] === chair);
  });
}

export function canCity(state: CatanState, chair: string, v: number): boolean {
  const here = state.buildings[v];
  return Boolean(here && here.chair === chair && !here.city);
}

export const settleSpots = (state: CatanState, chair: string, setup = false) =>
  VERTICES.map((_, v) => v).filter((v) => canSettle(state, chair, v, setup));
export const roadSpots = (state: CatanState, chair: string) => EDGES.map((_, e) => e).filter((e) => canRoad(state, chair, e));
export const citySpots = (state: CatanState, chair: string) => VERTICES.map((_, v) => v).filter((v) => canCity(state, chair, v));

// ---------------------------------------------------------------------------
// Hands and the bank
// ---------------------------------------------------------------------------

export const canPay = (hand: Hand, cost: Hand) => RESOURCES.every((r) => (hand[r] ?? 0) >= cost[r]);
const minus = (hand: Hand, cost: Hand): Hand => Object.fromEntries(RESOURCES.map((r) => [r, (hand[r] ?? 0) - cost[r]])) as Hand;
const plus = (hand: Hand, more: Partial<Hand>): Hand => Object.fromEntries(RESOURCES.map((r) => [r, (hand[r] ?? 0) + (more[r] ?? 0)])) as Hand;

/** What the bank has left of each resource. */
export function bank(state: CatanState): Hand {
  const out = Object.fromEntries(RESOURCES.map((r) => [r, BANK])) as Hand;
  for (const h of Object.values(state.hands)) for (const r of RESOURCES) out[r] -= h[r] ?? 0;
  return out;
}

// ---------------------------------------------------------------------------
// Victory points, the longest road, the largest army
// ---------------------------------------------------------------------------

/** Points everyone can see: towns, cities, and the two cards for road and army. */
export function publicPoints(state: CatanState, chair: string): number {
  let points = 0;
  for (const b of Object.values(state.buildings)) if (b.chair === chair) points += b.city ? 2 : 1;
  if (state.longestRoad === chair) points += 2;
  if (state.largestArmy === chair) points += 2;
  return points + (state.shownVp[chair] ?? 0);
}

/** The longest unbroken run of a player's road, not passing through anyone else's town. */
export function longestRoadOf(state: CatanState, chair: string): number {
  const mine = EDGES.map((_, e) => e).filter((e) => state.roads[e] === chair);
  let best = 0;
  const walk = (v: number, used: Set<number>, length: number) => {
    best = Math.max(best, length);
    const here = state.buildings[v];
    if (length > 0 && here && here.chair !== chair) return;
    for (const e of VERTICES[v].edges) {
      if (state.roads[e] !== chair || used.has(e)) continue;
      used.add(e);
      walk(EDGES[e].a === v ? EDGES[e].b : EDGES[e].a, used, length + 1);
      used.delete(e);
    }
  };
  const starts = new Set(mine.flatMap((e) => [EDGES[e].a, EDGES[e].b]));
  for (const v of starts) walk(v, new Set(), 0);
  return best;
}

/**
 * Who holds the longest road now. Five or more, and it only changes hands to
 * somebody strictly longer: the holder keeps it on a tie. If the holder's road
 * is cut and two others tie for longest, nobody has it.
 */
export function roadHolder(state: CatanState): string | null {
  const lengths = Object.fromEntries(state.order.map((c) => [c, longestRoadOf(state, c)]));
  const top = Math.max(0, ...Object.values(lengths));
  const current = state.longestRoad;
  if (current && lengths[current] >= 5 && lengths[current] === top) return current;
  const leaders = state.order.filter((c) => lengths[c] === top);
  return top >= 5 && leaders.length === 1 ? leaders[0] : null;
}

function awardRoad(state: CatanState, name: Name): CatanState {
  const holder = roadHolder(state);
  if (holder === state.longestRoad) return state;
  const lengths = Object.fromEntries(state.order.map((c) => [c, longestRoadOf(state, c)]));
  return { ...state, longestRoad: holder, log: note(state.log, holder ? `${name(holder)} has the longest road (${lengths[holder]})` : "nobody has the longest road now") };
}

function awardArmy(state: CatanState, chair: string, name: Name): CatanState {
  const mine = state.knights[chair] ?? 0;
  const held = state.largestArmy ? (state.knights[state.largestArmy] ?? 0) : 0;
  if (mine >= 3 && state.largestArmy !== chair && mine > held) {
    return { ...state, largestArmy: chair, log: note(state.log, `${name(chair)} has the largest army (${mine})`) };
  }
  return state;
}

/** Ten points on your own turn wins -- as far as anyone can see. Hidden cards are added by their holder. */
function checkWin(state: CatanState, name: Name): CatanState {
  const chair = state.turn;
  if (state.phase !== "play" || publicPoints(state, chair) < WIN) return state;
  return finish(state, chair, name);
}

function finish(state: CatanState, chair: string, name: Name): CatanState {
  return {
    ...state,
    phase: "over",
    winner: chair,
    offer: null,
    wins: { ...state.wins, [chair]: (state.wins[chair] ?? 0) + 1 },
    log: note(state.log, `${name(chair)} wins`),
  };
}

/** A win with victory point cards shown: they are added to the public count first. */
export function claimWin(state: CatanState, chair: string, vpCards: number, name: Name = (c) => c): CatanState {
  if (state.phase !== "play" || state.turn !== chair) return state;
  const shown = { ...state.shownVp, [chair]: (state.shownVp[chair] ?? 0) + vpCards };
  const next = { ...state, shownVp: shown };
  return publicPoints(next, chair) >= WIN ? finish(next, chair, name) : state;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function setupSettlement(state: CatanState, v: number, name: Name = (c) => c): CatanState {
  if (state.step !== "setup-settlement" || !canSettle(state, state.turn, v, true)) return state;
  const second = state.setupAt >= state.order.length;
  let hands = state.hands;
  if (second && state.board) {
    // The second settlement starts you off with one of everything round it.
    const got = emptyHand();
    for (const h of VERTICES[v].hexes) {
      const r = YIELD[state.board.hexes[h].terrain];
      if (r) got[r] += 1;
    }
    hands = { ...hands, [state.turn]: plus(hands[state.turn] ?? emptyHand(), got) };
  }
  return {
    ...state,
    buildings: { ...state.buildings, [v]: { chair: state.turn, city: false } },
    hands,
    step: "setup-road",
    setupLast: v,
    log: note(state.log, `${name(state.turn)} settles`),
  };
}

export function setupRoad(state: CatanState, e: number, name: Name = (c) => c): CatanState {
  if (state.step !== "setup-road" || !canRoad(state, state.turn, e)) return state;
  const at = state.setupAt + 1;
  const done = at >= state.setupQueue.length;
  const next: CatanState = {
    ...state,
    roads: { ...state.roads, [e]: state.turn },
    setupAt: at,
    setupLast: null,
    turn: done ? state.order[0] : state.setupQueue[at],
    step: done ? "roll" : "setup-settlement",
  };
  return { ...next, log: note(state.log, done ? `setup is done -- ${name(next.turn)} rolls first` : `${name(next.turn)} to place`) };
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/** What a roll gives each player, bank permitting: a resource the bank cannot cover for everyone goes to nobody. */
export function production(state: CatanState, total: number): Record<string, Hand> {
  const out: Record<string, Hand> = Object.fromEntries(state.order.map((c) => [c, emptyHand()]));
  if (!state.board) return out;
  state.board.hexes.forEach((hex, h) => {
    const r = YIELD[hex.terrain];
    if (!r || hex.number !== total || h === state.robber) return;
    for (const v of HEXES[h].corners) {
      const b = state.buildings[v];
      if (b) out[b.chair][r] += b.city ? 2 : 1;
    }
  });
  const left = bank(state);
  for (const r of RESOURCES) {
    const takers = state.order.filter((c) => out[c][r] > 0);
    const wanted = takers.reduce((n, c) => n + out[c][r], 0);
    if (wanted <= left[r]) continue;
    if (takers.length === 1) out[takers[0]][r] = left[r];
    else for (const c of takers) out[c][r] = 0;
  }
  return out;
}

export function roll(state: CatanState, random: Random, name: Name = (c) => c): CatanState {
  if (state.phase !== "play" || state.step !== "roll") return state;
  const dice: [number, number] = [random(6) + 1, random(6) + 1];
  const total = dice[0] + dice[1];
  const rolled = { ...state, dice, rolls: state.rolls + 1, log: note(state.log, `${name(state.turn)} rolls ${total}`) };
  if (total === 7) {
    const discards: Record<string, number> = {};
    for (const c of state.order) {
      const n = handSize(state.hands[c] ?? emptyHand());
      if (n > 7) discards[c] = Math.floor(n / 2);
    }
    return { ...rolled, discards, step: Object.keys(discards).length ? "discard" : "robber", after: "main" };
  }
  const got = production(state, total);
  const hands = Object.fromEntries(state.order.map((c) => [c, plus(state.hands[c] ?? emptyHand(), got[c])]));
  return { ...rolled, hands, step: "main" };
}

/** Half a big hand, gone after a 7. Each player chooses their own. */
export function discard(state: CatanState, chair: string, cards: Hand): CatanState {
  const owed = state.discards[chair] ?? 0;
  if (state.step !== "discard" || !owed || handSize(cards) !== owed || !canPay(state.hands[chair], cards)) return state;
  const discards = { ...state.discards };
  delete discards[chair];
  return {
    ...state,
    hands: { ...state.hands, [chair]: minus(state.hands[chair], cards) },
    discards,
    step: Object.keys(discards).length ? "discard" : "robber",
  };
}

// ---------------------------------------------------------------------------
// The robber
// ---------------------------------------------------------------------------

export function moveRobber(state: CatanState, hex: number, name: Name = (c) => c): CatanState {
  if (state.step !== "robber" || hex === state.robber || hex < 0 || hex >= HEXES.length) return state;
  const victims = [
    ...new Set(
      HEXES[hex].corners.map((v) => state.buildings[v]?.chair).filter((c): c is string => Boolean(c) && c !== state.turn && handSize(state.hands[c as string]) > 0),
    ),
  ];
  const moved = { ...state, robber: hex, log: note(state.log, `${name(state.turn)} moves the robber`) };
  if (!victims.length) return { ...moved, victims: [], step: state.after };
  return { ...moved, victims, step: "steal" };
}

export function steal(state: CatanState, victim: string, random: Random, name: Name = (c) => c): CatanState {
  if (state.step !== "steal" || !state.victims.includes(victim)) return state;
  const theirs = state.hands[victim];
  const cards = RESOURCES.flatMap((r) => Array<Resource>(theirs[r] ?? 0).fill(r));
  if (!cards.length) return { ...state, victims: [], step: state.after };
  const r = cards[random(cards.length)];
  return {
    ...state,
    hands: {
      ...state.hands,
      [victim]: { ...theirs, [r]: theirs[r] - 1 },
      [state.turn]: { ...state.hands[state.turn], [r]: (state.hands[state.turn][r] ?? 0) + 1 },
    },
    victims: [],
    step: state.after,
    log: note(state.log, `${name(state.turn)} steals a card from ${name(victim)}`),
  };
}

// ---------------------------------------------------------------------------
// Building and buying
// ---------------------------------------------------------------------------

export function buildRoad(state: CatanState, e: number, name: Name = (c) => c): CatanState {
  const chair = state.turn;
  const free = state.step === "roads" && state.freeRoads > 0;
  if (!(state.step === "main" || free) || !canRoad(state, chair, e) || piecesLeft(state, chair, "road") <= 0) return state;
  if (!free && !canPay(state.hands[chair], COST.road)) return state;
  const freeRoads = free ? state.freeRoads - 1 : state.freeRoads;
  const next: CatanState = {
    ...state,
    roads: { ...state.roads, [e]: chair },
    hands: free ? state.hands : { ...state.hands, [chair]: minus(state.hands[chair], COST.road) },
    freeRoads,
    step: free && (freeRoads === 0 || piecesLeft({ ...state, roads: { ...state.roads, [e]: chair } }, chair, "road") <= 0) ? "main" : state.step,
  };
  return checkWin(awardRoad(next, name), name);
}

export function buildSettlement(state: CatanState, v: number, name: Name = (c) => c): CatanState {
  const chair = state.turn;
  if (state.step !== "main" || !canSettle(state, chair, v) || piecesLeft(state, chair, "settlement") <= 0) return state;
  if (!canPay(state.hands[chair], COST.settlement)) return state;
  const next: CatanState = {
    ...state,
    buildings: { ...state.buildings, [v]: { chair, city: false } },
    hands: { ...state.hands, [chair]: minus(state.hands[chair], COST.settlement) },
    log: note(state.log, `${name(chair)} builds a settlement`),
  };
  // A new town can cut somebody's road in two.
  return checkWin(awardRoad(next, name), name);
}

export function buildCity(state: CatanState, v: number, name: Name = (c) => c): CatanState {
  const chair = state.turn;
  if (state.step !== "main" || !canCity(state, chair, v) || piecesLeft(state, chair, "city") <= 0) return state;
  if (!canPay(state.hands[chair], COST.city)) return state;
  return checkWin(
    {
      ...state,
      buildings: { ...state.buildings, [v]: { chair, city: true } },
      hands: { ...state.hands, [chair]: minus(state.hands[chair], COST.city) },
      log: note(state.log, `${name(chair)} builds a city`),
    },
    name,
  );
}

/** Paying for a development card. The card itself comes from the database. */
export function buyDev(state: CatanState, deckLeft: number, name: Name = (c) => c): CatanState {
  const chair = state.turn;
  if (state.step !== "main" || deckLeft <= 0 || !canPay(state.hands[chair], COST.dev)) return state;
  return {
    ...state,
    hands: { ...state.hands, [chair]: minus(state.hands[chair], COST.dev) },
    devCount: { ...state.devCount, [chair]: (state.devCount[chair] ?? 0) + 1 },
    log: note(state.log, `${name(chair)} buys a development card`),
  };
}

// ---------------------------------------------------------------------------
// Playing development cards: one a turn, never the one just bought
// ---------------------------------------------------------------------------

const canPlayDev = (state: CatanState) =>
  state.phase === "play" && !state.devPlayed && (state.step === "main" || state.step === "roll");

function played(state: CatanState, kind: DevKind, name: Name): CatanState {
  const chair = state.turn;
  return {
    ...state,
    devPlayed: true,
    devCount: { ...state.devCount, [chair]: Math.max(0, (state.devCount[chair] ?? 0) - 1) },
    log: note(state.log, `${name(chair)} plays ${DEV_NAME[kind]}`),
  };
}

export function playKnight(state: CatanState, name: Name = (c) => c): CatanState {
  if (!canPlayDev(state)) return state;
  const chair = state.turn;
  const next = played(state, "knight", name);
  const withKnight = { ...next, knights: { ...next.knights, [chair]: (next.knights[chair] ?? 0) + 1 }, step: "robber" as Step, after: state.step as "roll" | "main" };
  return checkWin(awardArmy(withKnight, chair, name), name);
}

export function playRoadBuilding(state: CatanState, name: Name = (c) => c): CatanState {
  if (!canPlayDev(state) || state.step !== "main") return state;
  const free = Math.min(2, piecesLeft(state, state.turn, "road"), roadSpots(state, state.turn).length ? 2 : 0);
  return { ...played(state, "roads", name), freeRoads: free, step: free ? "roads" : "main" };
}

export function playYearOfPlenty(state: CatanState, a: Resource, b: Resource, name: Name = (c) => c): CatanState {
  if (!canPlayDev(state) || state.step !== "main") return state;
  const left = bank(state);
  const want = plus(emptyHand(), { [a]: 1 });
  want[b] += 1;
  if (RESOURCES.some((r) => want[r] > left[r])) return state;
  const next = played(state, "plenty", name);
  return { ...next, hands: { ...next.hands, [state.turn]: plus(next.hands[state.turn], want) } };
}

export function playMonopoly(state: CatanState, r: Resource, name: Name = (c) => c): CatanState {
  if (!canPlayDev(state) || state.step !== "main") return state;
  const chair = state.turn;
  const next = played(state, "monopoly", name);
  let taken = 0;
  const hands = { ...next.hands };
  for (const c of state.order) {
    if (c === chair) continue;
    taken += hands[c][r] ?? 0;
    hands[c] = { ...hands[c], [r]: 0 };
  }
  hands[chair] = { ...hands[chair], [r]: (hands[chair][r] ?? 0) + taken };
  return { ...next, hands, log: note(next.log, `${name(chair)} takes every ${r} (${taken})`) };
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

/** The best the bank will do for a resource: 4 of it, 3 with any harbour, 2 with its own. */
export function tradeRate(state: CatanState, chair: string, r: Resource): number {
  let rate = 4;
  for (const h of state.board?.harbours ?? []) {
    const { a, b } = EDGES[h.edge];
    const mine = [a, b].some((v) => state.buildings[v]?.chair === chair);
    if (!mine) continue;
    if (h.kind === r) rate = Math.min(rate, 2);
    else if (h.kind === "any") rate = Math.min(rate, 3);
  }
  return rate;
}

export function bankTrade(state: CatanState, give: Resource, get: Resource): CatanState {
  const chair = state.turn;
  if (state.step !== "main" || give === get) return state;
  const rate = tradeRate(state, chair, give);
  if ((state.hands[chair][give] ?? 0) < rate || bank(state)[get] < 1) return state;
  const hand = { ...state.hands[chair], [give]: state.hands[chair][give] - rate, [get]: (state.hands[chair][get] ?? 0) + 1 };
  return { ...state, hands: { ...state.hands, [chair]: hand } };
}

export function offerTrade(state: CatanState, give: Hand, want: Hand): CatanState {
  if (state.step !== "main" || !handSize(give) || !handSize(want) || !canPay(state.hands[state.turn], give)) return state;
  if (RESOURCES.some((r) => give[r] > 0 && want[r] > 0)) return state;
  return { ...state, offer: { from: state.turn, give, want } };
}

/** Someone takes the offer: both hands have to cover it still. */
export function acceptTrade(state: CatanState, chair: string, name: Name = (c) => c): CatanState {
  const offer = state.offer;
  if (!offer || state.step !== "main" || chair === offer.from || !state.order.includes(chair)) return state;
  if (!canPay(state.hands[offer.from], offer.give) || !canPay(state.hands[chair], offer.want)) return state;
  return {
    ...state,
    hands: {
      ...state.hands,
      [offer.from]: plus(minus(state.hands[offer.from], offer.give), offer.want),
      [chair]: plus(minus(state.hands[chair], offer.want), offer.give),
    },
    offer: null,
    log: note(state.log, `${name(offer.from)} trades with ${name(chair)}`),
  };
}

export const cancelOffer = (state: CatanState): CatanState => ({ ...state, offer: null });

// ---------------------------------------------------------------------------
// Ending a turn
// ---------------------------------------------------------------------------

export function endTurn(state: CatanState, name: Name = (c) => c): CatanState {
  // Free roads nobody could place are simply lost.
  if (state.phase !== "play" || (state.step !== "main" && state.step !== "roads")) return state;
  const at = state.order.indexOf(state.turn);
  const next = state.order[(at + 1) % state.order.length];
  return {
    ...state,
    turn: next,
    step: "roll",
    dice: state.dice,
    devPlayed: false,
    offer: null,
    freeRoads: 0,
    log: note(state.log, `${name(next)}'s turn`),
  };
}
