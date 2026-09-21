// WAR, the Brazilian game of strategy (Grow), on any world: the classic
// forty-two territories, ancient Greece, or a map a table drew for its own
// campaign. Three to six armies, dice for every battle, and a secret
// objective each -- or, if the table prefers, the last army standing wins.
//
// The rules below read everything about the map from the world the game is
// played on (war-world.ts): which territories there are, whose continent is
// whose, who borders whom, what each continent is worth, and what the
// objectives ask for. The table's own rules -- trade values, dice, the
// reinforcement formula -- ride along in the state too.
//
// What is secret: the objectives, and the territory cards in each hand. An
// objective is a pile only its player can read, with a sealed copy anybody can
// turn over once the game is done. Everything else is on the board.

import {
  DEFAULT_RULES,
  describeObjective,
  dealObjectives,
  fallbackCount,
  indexOf,
  parseObjective,
  rulesOf,
  territoryName,
  tidyRules,
  tradeValueFor,
  worldOf,
  type Shape,
  type WarRules,
  type WarWorld,
} from "./war-world";

export type { Shape, WarRules, WarWorld } from "./war-world";
export { SHAPES } from "./war-world";

/** A territory, by its id in the world being played. */
export type Territory = string;
/** A continent, by its id in the world being played. */
export type Continent = string;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** A territory card is named after its territory; jokers are "joker-1", "joker-2"... */
export type Card = string;

export const isJoker = (card: Card) => card.startsWith("joker-");

/** The deck for a world: a card for every territory, and the table's jokers. */
export function deckFor(world: WarWorld, rules: WarRules = DEFAULT_RULES): Card[] {
  return [...indexOf(world).ids, ...Array.from({ length: rules.jokers }, (_, i) => `joker-${i + 1}`)];
}

export const figureOf = (world: WarWorld, card: Card): Shape | null => (isJoker(card) ? null : indexOf(world).figure(card));

/** Three of a figure, or one of each. A joker is whichever figure is missing. */
export function validSet(cards: Card[], world: WarWorld = worldOf(null)): boolean {
  if (cards.length !== 3 || new Set(cards).size !== 3) return false;
  const shapes = cards.filter((c) => !isJoker(c)).map((c) => indexOf(world).figure(c));
  if (shapes.length < 3) return true;
  const kinds = new Set(shapes).size;
  return kinds === 1 || kinds === 3;
}

/** Armies for the nth trade of the game, counted across every player. */
export const tradeValue = (tradesSoFar: number, rules?: WarRules | number) =>
  tradeValueFor(rules && typeof rules === "object" ? rules : DEFAULT_RULES, tradesSoFar);

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export type Color = "blue" | "red" | "green" | "yellow" | "black" | "white";

export const COLORS: Color[] = ["blue", "red", "green", "yellow", "black", "white"];

export const COLOR_HEX: Record<Color, { fill: string; ink: string }> = {
  blue: { fill: "#3f7fe0", ink: "#ffffff" },
  red: { fill: "#d9463e", ink: "#ffffff" },
  green: { fill: "#3a9e57", ink: "#ffffff" },
  yellow: { fill: "#e6c143", ink: "#231a05" },
  black: { fill: "#26222c", ink: "#f4efe6" },
  white: { fill: "#efeae1", ink: "#1b1720" },
};

/** An objective card, as dealt: see war-world.ts for what the codes mean. */
export type Objective = string;

export const objectiveText = (world: WarWorld, objective: Objective) => describeObjective(world, objective);

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const MIN_SEATS = 3;
export const MAX_SEATS = 6;

export const DECK_PILE = "deck";
export const DISCARD_PILE = "discard";
export const OBJECTIVES_PILE = "objectives";
export const SEALED_PILE = "objectives-sealed";
export const handSlot = (chair: string) => `hand:${chair}`;
export const objectiveSlot = (chair: string) => `objective:${chair}`;
/** A copy of the objective nobody can read and anybody can turn over, for the end. */
export const sealedSlot = (chair: string) => `sealed:${chair}`;

export type Step = "place" | "attack" | "occupy" | "move";

export interface Battle {
  /** Counts every throw in the game, so every screen animates each one once. */
  n: number;
  /** Whose turn it was. */
  chair: string;
  from: Territory;
  to: Territory;
  /** The last throw, highest first. */
  attack: number[];
  defend: number[];
  /** Armies lost over the whole assault: attacker, defender. */
  lost: [number, number];
  /** Throws it took -- more than one when the attacker went all in. */
  throws: number;
  won: boolean;
}

export interface Reserve {
  /** To place anywhere you hold. */
  free: number;
  /** Continent bonuses, to be placed inside their continent. */
  continent: Record<Continent, number>;
}

export interface WarState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  /** The world being played on; the classic board when absent. */
  world?: WarWorld;
  /** The table's rules; the classic ones when absent. */
  rules?: Partial<WarRules>;
  /** Everyone dealt in, in the order they play. */
  order: string[];
  /** Everyone knocked out, and who did it. */
  out: string[];
  killedBy: Record<string, string>;
  color: Record<string, Color>;
  owner: Record<Territory, string>;
  armies: Record<Territory, number>;
  turn: string;
  /** The first round only places armies. */
  round: number;
  /** Who opened the game; the round goes up each time it comes back round. */
  first: string;
  step: Step;
  reserve: Reserve;
  /** Trades made in the whole game, which is what sets the next one's worth. */
  trades: number;
  /** Took a territory this turn: a card at the end of it. */
  conquered: boolean;
  /** Just taken, waiting for armies to march in. */
  occupy: { from: Territory; to: Territory; max: number } | null;
  /** Armies that marched in this turn and cannot march again. */
  moved: Record<Territory, number>;
  battle: Battle | null;
  /** The last trade, shown to the table. */
  traded: { chair: string; cards: Card[]; armies: number } | null;
  winner?: string;
  wins: Record<string, number>;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyWar(seatCount = 4): WarState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    phase: "idle",
    order: [],
    out: [],
    killedBy: {},
    color: {},
    owner: {},
    armies: {},
    turn: "s0",
    round: 0,
    first: "s0",
    step: "place",
    reserve: { free: 0, continent: {} },
    trades: 0,
    conquered: false,
    occupy: null,
    moved: {},
    battle: null,
    traded: null,
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

const idx = (state: WarState) => indexOf(worldOf(state));
export const nameOf = (state: WarState, t: Territory) => territoryName(worldOf(state), t);
const continentOf = (state: WarState, t: Territory) => idx(state).byId.get(t)?.continent ?? "";
export const neighborsOf = (state: WarState, t: Territory) => idx(state).neighbors.get(t) ?? [];
export const adjacent = (state: WarState, a: Territory, b: Territory) => neighborsOf(state, a).includes(b);

export const colorOf = (state: WarState, chair: string): Color => state.color[chair] ?? "white";
export const alive = (state: WarState) => state.order.filter((c) => !state.out.includes(c));
export const held = (state: WarState, chair: string) => idx(state).ids.filter((t) => state.owner[t] === chair);
export const armiesOn = (state: WarState, t: Territory) => state.armies[t] ?? 0;
export function holdsContinent(state: WarState, chair: string, continent: Continent): boolean {
  const members = idx(state).members.get(continent) ?? [];
  return members.length > 0 && members.every((t) => state.owner[t] === chair);
}

/** What a player gets at the start of their turn: their territories divided by the rule (at least its minimum), and each whole continent. */
export function reinforcements(state: WarState, chair: string): Reserve {
  const rules = rulesOf(state);
  const index = idx(state);
  const continent: Record<Continent, number> = {};
  for (const c of index.continentIds) {
    const bonus = index.continents.get(c)?.bonus ?? 0;
    if (bonus > 0 && holdsContinent(state, chair, c)) continent[c] = bonus;
  }
  return { free: Math.max(rules.minimum, Math.floor(held(state, chair).length / rules.divisor)), continent };
}

export const reserveTotal = (reserve: Reserve) =>
  reserve.free + Object.values(reserve.continent).reduce((sum, n) => sum + (n ?? 0), 0);

/**
 * A new game on the world and rules already in the state. The territories are
 * dealt out in the open, one army on each; whoever comes after the last card
 * dealt starts. The objectives, and the deck the cards are drawn from, are for
 * the database to shuffle.
 */
export function startGame(
  state: WarState,
  chairs: string[],
  random: Random,
  name: Name = (c) => c,
): { state: WarState; objectives: Objective[]; deck: Card[] } {
  const world = worldOf(state);
  const rules = rulesOf(state);
  const ids = indexOf(world).ids;
  const order = [...chairs];
  const color: Record<string, Color> = {};
  order.forEach((chair, i) => (color[chair] = COLORS[i]));
  const owner: Record<Territory, string> = {};
  const armies: Record<Territory, number> = {};
  shuffle(ids, random).forEach((t, i) => {
    owner[t] = order[i % order.length];
    armies[t] = 1;
  });
  const first = order[ids.length % order.length];
  const dealt: WarState = {
    ...emptyWar(state.seatCount),
    seats: state.seats,
    holders: state.holders,
    seatCount: state.seatCount,
    wins: state.wins ?? {},
    world,
    rules,
    phase: "play",
    order,
    color,
    owner,
    armies,
    first,
    turn: first,
    round: 1,
    log: [`territories dealt; ${name(first)} starts`],
  };
  return {
    state: { ...dealt, reserve: reinforcements(dealt, first) },
    objectives: rules.goal === "objectives" ? dealObjectives(world, order.map((c) => color[c]), rules) : [],
    deck: rules.cards ? deckFor(world, rules) : [],
  };
}

// ---------------------------------------------------------------------------
// Placing armies
// ---------------------------------------------------------------------------

/**
 * Whether a set of placements uses up the reserve exactly, on your own land,
 * with every continent's bonus inside that continent.
 */
export function placementProblem(state: WarState, placed: Record<Territory, number>): string | null {
  let total = 0;
  const inContinent: Record<Continent, number> = {};
  for (const [t, n] of Object.entries(placed)) {
    if (!n) continue;
    if (n < 0 || !Number.isInteger(n)) return "whole armies only";
    if (state.owner[t] !== state.turn) return `${nameOf(state, t)} is not yours`;
    total += n;
    const c = continentOf(state, t);
    inContinent[c] = (inContinent[c] ?? 0) + n;
  }
  for (const [c, bonus] of Object.entries(state.reserve.continent)) {
    if ((inContinent[c] ?? 0) < bonus) return `${bonus} of them have to go in ${idx(state).continents.get(c)?.name ?? c}`;
  }
  const want = reserveTotal(state.reserve);
  if (total < want) return `${want - total} still to place`;
  if (total > want) return `${total - want} too many`;
  return null;
}

/** How much of each pool is still to place, given a set of placements so far. */
export function stillToPlace(state: WarState, placed: Record<Territory, number>): Reserve {
  const continent = { ...state.reserve.continent };
  let free = state.reserve.free;
  for (const [t, n] of Object.entries(placed)) {
    let left = n ?? 0;
    const c = continentOf(state, t);
    const pool = continent[c] ?? 0;
    const fromPool = Math.min(pool, left);
    if (pool) continent[c] = pool - fromPool;
    left -= fromPool;
    free -= left;
  }
  return { free, continent };
}

/** Whether one more army can go on this territory. */
export function canPlaceOn(state: WarState, placed: Record<Territory, number>, t: Territory): boolean {
  if (state.owner[t] !== state.turn) return false;
  const left = stillToPlace(state, placed);
  return left.free > 0 || (left.continent[continentOf(state, t)] ?? 0) > 0;
}

export function place(state: WarState, placed: Record<Territory, number>, name: Name = (c) => c): WarState {
  if (state.phase !== "play" || state.step !== "place" || placementProblem(state, placed)) return state;
  const armies = { ...state.armies };
  let total = 0;
  for (const [t, n] of Object.entries(placed)) {
    armies[t] = (armies[t] ?? 0) + (n ?? 0);
    total += n ?? 0;
  }
  const next: WarState = {
    ...state,
    armies,
    reserve: { free: 0, continent: {} },
    traded: null,
    log: note(state.log, `${name(state.turn)} placed ${total}`),
  };
  // The first time round there is only placing, when the table plays that way.
  return state.round <= 1 && rulesOf(state).placeFirstRound ? endTurn(next, name) : { ...next, step: "attack" };
}

/**
 * Three cards traded in for armies at the start of a turn, on top of the rest:
 * the going rate, and the table's extra armies on each territory pictured that
 * you hold.
 */
export function trade(state: WarState, cards: Card[], name: Name = (c) => c): WarState {
  const rules = rulesOf(state);
  if (!rules.cards || state.phase !== "play" || state.step !== "place" || !validSet(cards, worldOf(state))) return state;
  const worth = tradeValueFor(rules, state.trades);
  const armies = { ...state.armies };
  let extra = 0;
  for (const card of cards) {
    if (!isJoker(card) && state.owner[card] === state.turn && rules.ownedCardBonus > 0) {
      armies[card] = (armies[card] ?? 0) + rules.ownedCardBonus;
      extra += rules.ownedCardBonus;
    }
  }
  return {
    ...state,
    armies,
    trades: state.trades + 1,
    reserve: { ...state.reserve, free: state.reserve.free + worth },
    traded: { chair: state.turn, cards, armies: worth + extra },
    log: note(state.log, `${name(state.turn)} traded three cards for ${worth}${extra ? ` (+${extra} on the land pictured)` : ""}`),
  };
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export const attackDice = (state: WarState, from: Territory) => Math.max(0, Math.min(rulesOf(state).attackDice, armiesOn(state, from) - 1));
export const defendDice = (state: WarState, to: Territory) => Math.max(0, Math.min(rulesOf(state).defendDice, armiesOn(state, to)));

export function canAttackFrom(state: WarState, from: Territory): boolean {
  return state.owner[from] === state.turn && armiesOn(state, from) >= 2 && neighborsOf(state, from).some((n) => state.owner[n] !== state.turn);
}

export function targetsFrom(state: WarState, from: Territory): Territory[] {
  if (!canAttackFrom(state, from)) return [];
  return neighborsOf(state, from).filter((n) => state.owner[n] !== state.turn);
}

/**
 * Highest against highest, then the next pair, and so on; a tie goes to the
 * defence, unless the table plays otherwise. Returns the armies lost by each side.
 */
export function fight(attack: number[], defend: number[], tiesToDefence = true): [number, number] {
  const a = [...attack].sort((x, y) => y - x);
  const d = [...defend].sort((x, y) => y - x);
  let lostA = 0;
  let lostD = 0;
  for (let i = 0; i < Math.min(a.length, d.length); i += 1) {
    if (a[i] > d[i] || (!tiesToDefence && a[i] === d[i])) lostD += 1;
    else lostA += 1;
  }
  return [lostA, lostD];
}

const rollDice = (n: number, random: Random) => Array.from({ length: n }, () => random(6) + 1).sort((x, y) => y - x);

/**
 * An attack: one throw of the dice, or -- all in -- throw after throw until the
 * territory falls or there is only the occupying army left to attack with.
 */
export function attack(
  state: WarState,
  from: Territory,
  to: Territory,
  dice: number,
  random: Random,
  name: Name = (c) => c,
  allIn = false,
): WarState {
  const rules = rulesOf(state);
  if (state.phase !== "play" || state.step !== "attack" || (state.round <= 1 && rules.placeFirstRound)) return state;
  if (!targetsFrom(state, from).includes(to)) return state;
  const defender = state.owner[to] as string;
  const armies = { ...state.armies };
  const lost: [number, number] = [0, 0];
  let throws = 0;
  let a: number[] = [];
  let d: number[] = [];
  do {
    const nA = Math.max(1, Math.min(dice, rules.attackDice, (armies[from] ?? 0) - 1));
    const nD = Math.min(rules.defendDice, armies[to] ?? 0);
    a = rollDice(nA, random);
    d = rollDice(nD, random);
    const [lA, lD] = fight(a, d, rules.tiesToDefence);
    armies[from] = (armies[from] ?? 0) - lA;
    armies[to] = (armies[to] ?? 0) - lD;
    lost[0] += lA;
    lost[1] += lD;
    throws += 1;
  } while (allIn && (armies[to] ?? 0) > 0 && (armies[from] ?? 0) >= 2 && throws < 400);

  const won = (armies[to] ?? 0) <= 0;
  const battle: Battle = { n: (state.battle?.n ?? 0) + 1, chair: state.turn, from, to, attack: a, defend: d, lost, throws, won };
  const line = `${name(state.turn)} ${nameOf(state, from)} -> ${nameOf(state, to)}: lost ${lost[0]}, killed ${lost[1]}${won ? `, took it` : ""}`;
  if (!won) return { ...state, armies, battle, log: note(state.log, line) };

  const owner = { ...state.owner, [to]: state.turn };
  armies[to] = 0;
  let next: WarState = {
    ...state,
    owner,
    armies,
    battle,
    conquered: true,
    step: "occupy",
    occupy: { from, to, max: Math.max(1, Math.min(a.length, (armies[from] ?? 1) - 1)) },
    log: note(state.log, line),
  };
  if (!idx(state).ids.some((t) => owner[t] === defender)) {
    next = {
      ...next,
      out: [...next.out, defender],
      killedBy: { ...next.killedBy, [defender]: state.turn },
      log: note(next.log, `${name(defender)} is out, destroyed by ${name(state.turn)}`),
    };
  }
  return next;
}

/** Marching into the territory just taken: at least one army, at most as many as fought the last throw. */
export function occupy(state: WarState, n: number): WarState {
  const o = state.occupy;
  if (!o || state.step !== "occupy") return state;
  const count = Math.max(1, Math.min(o.max, n, armiesOn(state, o.from) - 1));
  return {
    ...state,
    armies: { ...state.armies, [o.from]: armiesOn(state, o.from) - count, [o.to]: count },
    occupy: null,
    step: "attack",
  };
}

export function stopAttacking(state: WarState): WarState {
  if (state.step !== "attack") return state;
  return { ...state, step: "move" };
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

/** Armies that can still march from here: never the last one, never one that has marched already this turn. */
export function movable(state: WarState, from: Territory): number {
  if (state.owner[from] !== state.turn) return 0;
  const here = armiesOn(state, from);
  return Math.max(0, here - Math.max(1, state.moved[from] ?? 0));
}

export function moveArmies(state: WarState, from: Territory, to: Territory, n: number): WarState {
  if (state.phase !== "play" || state.step !== "move") return state;
  if (state.owner[to] !== state.turn || !adjacent(state, from, to)) return state;
  const count = Math.min(n, movable(state, from));
  if (count <= 0) return state;
  return {
    ...state,
    armies: { ...state.armies, [from]: armiesOn(state, from) - count, [to]: armiesOn(state, to) + count },
    moved: { ...state.moved, [to]: (state.moved[to] ?? 0) + count },
  };
}

/** The next player still in, after this one. */
export function nextChair(state: WarState, chair: string): string {
  const players = state.order;
  const at = players.indexOf(chair);
  for (let i = 1; i <= players.length; i += 1) {
    const c = players[(at + i) % players.length];
    if (!state.out.includes(c)) return c;
  }
  return chair;
}

/** Whether going from one chair to the next passes the one who opened the game. */
function passesFirst(state: WarState, from: string, to: string): boolean {
  const n = state.order.length;
  const start = state.order.indexOf(state.first);
  const a = (state.order.indexOf(from) - start + n) % n;
  const b = (state.order.indexOf(to) - start + n) % n;
  return b <= a;
}

/**
 * The turn is over. The card owed for taking a territory is drawn by the
 * screen, from the database, in the same breath as writing this.
 */
export function endTurn(state: WarState, name: Name = (c) => c): WarState {
  if (state.phase !== "play") return state;
  if (alive(state).length <= 1) return state;
  const next = nextChair(state, state.turn);
  const round = passesFirst(state, state.turn, next) ? state.round + 1 : state.round;
  const moved: WarState = {
    ...state,
    turn: next,
    round,
    step: "place",
    conquered: false,
    occupy: null,
    moved: {},
    battle: state.battle,
    log: note(state.log, `${name(next)}'s turn${round !== state.round ? ` -- round ${round}` : ""}`),
  };
  return { ...moved, reserve: reinforcements(moved, next) };
}

// ---------------------------------------------------------------------------
// Winning
// ---------------------------------------------------------------------------

/** Who plays a colour, if anyone. */
export const chairOfColor = (state: WarState, color: string) => state.order.find((c) => state.color[c] === color);

/**
 * Whether a player has done what their card asks. Only the player -- or the
 * screen holding their card -- can ask this, since only they can read it.
 */
export function objectiveMet(state: WarState, chair: string, objective: Objective): boolean {
  const world = worldOf(state);
  const index = indexOf(world);
  const goal = parseObjective(objective);
  if (!goal) return false;
  const mine = held(state, chair);
  if (goal.kind === "continents") {
    if (!goal.need.every((c) => holdsContinent(state, chair, c))) return false;
    if (!goal.plusOne) return true;
    return index.continentIds.some((c) => !goal.need.includes(c) && holdsContinent(state, chair, c));
  }
  if (goal.kind === "territories") {
    return mine.filter((t) => armiesOn(state, t) >= Math.max(1, goal.armies)).length >= goal.count;
  }
  const target = chairOfColor(state, goal.color);
  if (target && target !== chair && state.out.includes(target) && state.killedBy[target] === chair) return true;
  // Your own colour, a colour not at the table, or somebody else got there first.
  const instead = !target || target === chair || (state.out.includes(target) && state.killedBy[target] !== chair);
  return instead && mine.length >= fallbackCount(world);
}

/** The objective is shown and the game is theirs. */
export function claimWin(state: WarState, chair: string, name: Name = (c) => c): WarState {
  if (state.phase !== "play") return state;
  return {
    ...state,
    phase: "over",
    winner: chair,
    occupy: null,
    wins: { ...state.wins, [chair]: (state.wins[chair] ?? 0) + 1 },
    log: note(state.log, `${name(chair)} has done it`),
  };
}

/** Everyone else knocked out: whatever the card said, there is nobody left to play. */
export function lastStanding(state: WarState): string | null {
  const left = alive(state);
  return state.phase === "play" && left.length === 1 ? left[0] : null;
}

/**
 * Cards a player inherits from someone they knock out: all of them, as long as
 * that leaves five at most. Past five, only enough to make five, drawn blind;
 * the rest go to the discards.
 */
export function inheritance(heirHand: number, victimHand: number, most = 5): { take: number; discard: number } {
  const take = Math.max(0, Math.min(victimHand, most - heirHand));
  return { take, discard: victimHand - take };
}

/** The rules a state is playing by, tidied. */
export const rulesFor = (state: WarState) => tidyRules(state.rules);
