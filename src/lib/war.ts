// WAR, the Brazilian game of strategy (Grow): 42 territories on six
// continents, three to six armies, dice for every battle. Each player has a
// secret objective, and the first to reach theirs shows it and wins.
//
// What is secret: the objectives, and the territory cards in each hand. An
// objective is a pile only its player can read, with a sealed copy anybody can
// turn over once the game is done. The cards are drawn from a face-down deck
// into your own hand and come out when you trade them. Everything else -- who
// holds what, how many armies, every roll of the dice -- is on the board for
// everyone.

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export type Continent = "na" | "sa" | "eu" | "af" | "as" | "oc";

export const CONTINENTS: Record<Continent, { name: string; bonus: number; tint: string }> = {
  na: { name: "North America", bonus: 5, tint: "#e8913f" },
  sa: { name: "South America", bonus: 2, tint: "#4fae6a" },
  eu: { name: "Europe", bonus: 5, tint: "#5b8fd6" },
  af: { name: "Africa", bonus: 3, tint: "#d56aa0" },
  as: { name: "Asia", bonus: 7, tint: "#d9b23f" },
  oc: { name: "Oceania", bonus: 2, tint: "#b0714c" },
};

export const CONTINENT_IDS = Object.keys(CONTINENTS) as Continent[];

export interface TerritoryInfo {
  name: string;
  continent: Continent;
  /** Where it sits on the board, in a 1000 x 560 box. */
  x: number;
  y: number;
}

export const TERRITORIES = {
  alaska: { name: "Alaska", continent: "na", x: 60, y: 95 },
  mackenzie: { name: "Mackenzie", continent: "na", x: 150, y: 80 },
  greenland: { name: "Greenland", continent: "na", x: 300, y: 50 },
  vancouver: { name: "Vancouver", continent: "na", x: 110, y: 160 },
  ottawa: { name: "Ottawa", continent: "na", x: 195, y: 165 },
  labrador: { name: "Labrador", continent: "na", x: 275, y: 135 },
  california: { name: "California", continent: "na", x: 115, y: 235 },
  newyork: { name: "New York", continent: "na", x: 205, y: 245 },
  mexico: { name: "Mexico", continent: "na", x: 150, y: 315 },

  venezuela: { name: "Venezuela", continent: "sa", x: 230, y: 340 },
  peru: { name: "Peru", continent: "sa", x: 215, y: 420 },
  brazil: { name: "Brazil", continent: "sa", x: 300, y: 405 },
  argentina: { name: "Argentina", continent: "sa", x: 250, y: 500 },

  iceland: { name: "Iceland", continent: "eu", x: 395, y: 75 },
  england: { name: "England", continent: "eu", x: 410, y: 150 },
  sweden: { name: "Sweden", continent: "eu", x: 495, y: 70 },
  moscow: { name: "Moscow", continent: "eu", x: 585, y: 110 },
  germany: { name: "Germany", continent: "eu", x: 480, y: 165 },
  portugal: { name: "Portugal", continent: "eu", x: 420, y: 225 },
  poland: { name: "Poland", continent: "eu", x: 530, y: 210 },

  algeria: { name: "Algeria", continent: "af", x: 450, y: 305 },
  egypt: { name: "Egypt", continent: "af", x: 540, y: 290 },
  sudan: { name: "Sudan", continent: "af", x: 575, y: 370 },
  congo: { name: "Congo", continent: "af", x: 505, y: 395 },
  southafrica: { name: "South Africa", continent: "af", x: 540, y: 480 },
  madagascar: { name: "Madagascar", continent: "af", x: 630, y: 455 },

  middleeast: { name: "Middle East", continent: "as", x: 625, y: 250 },
  aral: { name: "Aral", continent: "as", x: 660, y: 175 },
  omsk: { name: "Omsk", continent: "as", x: 720, y: 105 },
  dudinka: { name: "Dudinka", continent: "as", x: 790, y: 55 },
  siberia: { name: "Siberia", continent: "as", x: 875, y: 45 },
  tchita: { name: "Tchita", continent: "as", x: 820, y: 125 },
  mongolia: { name: "Mongolia", continent: "as", x: 810, y: 195 },
  vladivostok: { name: "Vladivostok", continent: "as", x: 930, y: 120 },
  china: { name: "China", continent: "as", x: 740, y: 245 },
  india: { name: "India", continent: "as", x: 690, y: 320 },
  japan: { name: "Japan", continent: "as", x: 935, y: 210 },
  vietnam: { name: "Vietnam", continent: "as", x: 790, y: 320 },

  sumatra: { name: "Sumatra", continent: "oc", x: 765, y: 405 },
  borneo: { name: "Borneo", continent: "oc", x: 860, y: 385 },
  newguinea: { name: "New Guinea", continent: "oc", x: 945, y: 400 },
  australia: { name: "Australia", continent: "oc", x: 880, y: 480 },
} satisfies Record<string, TerritoryInfo>;

export type Territory = keyof typeof TERRITORIES;

export const TERRITORY_IDS = Object.keys(TERRITORIES) as Territory[];

/** Every border once. A line on the board counts the same as a shared frontier. */
const BORDERS: Array<[Territory, Territory]> = [
  ["alaska", "mackenzie"],
  ["alaska", "vancouver"],
  ["alaska", "vladivostok"],
  ["mackenzie", "vancouver"],
  ["mackenzie", "ottawa"],
  ["mackenzie", "greenland"],
  ["greenland", "labrador"],
  ["greenland", "iceland"],
  ["vancouver", "ottawa"],
  ["vancouver", "california"],
  ["ottawa", "labrador"],
  ["ottawa", "california"],
  ["ottawa", "newyork"],
  ["labrador", "newyork"],
  ["california", "newyork"],
  ["california", "mexico"],
  ["newyork", "mexico"],
  ["mexico", "venezuela"],

  ["venezuela", "peru"],
  ["venezuela", "brazil"],
  ["peru", "brazil"],
  ["peru", "argentina"],
  ["brazil", "argentina"],
  ["brazil", "algeria"],

  ["iceland", "england"],
  ["england", "sweden"],
  ["england", "germany"],
  ["england", "portugal"],
  ["sweden", "poland"],
  ["sweden", "moscow"],
  ["germany", "portugal"],
  ["germany", "poland"],
  ["portugal", "algeria"],
  ["portugal", "egypt"],
  ["poland", "moscow"],
  ["poland", "middleeast"],
  ["poland", "egypt"],
  ["moscow", "middleeast"],
  ["moscow", "aral"],
  ["moscow", "omsk"],

  ["algeria", "egypt"],
  ["algeria", "sudan"],
  ["algeria", "congo"],
  ["egypt", "sudan"],
  ["egypt", "middleeast"],
  ["sudan", "congo"],
  ["sudan", "southafrica"],
  ["sudan", "madagascar"],
  ["congo", "southafrica"],
  ["southafrica", "madagascar"],

  ["middleeast", "aral"],
  ["middleeast", "india"],
  ["aral", "omsk"],
  ["aral", "china"],
  ["aral", "india"],
  ["omsk", "dudinka"],
  ["omsk", "tchita"],
  ["omsk", "mongolia"],
  ["omsk", "china"],
  ["dudinka", "tchita"],
  ["dudinka", "siberia"],
  ["siberia", "tchita"],
  ["siberia", "vladivostok"],
  ["tchita", "vladivostok"],
  ["tchita", "mongolia"],
  ["tchita", "china"],
  ["vladivostok", "japan"],
  ["vladivostok", "china"],
  ["mongolia", "china"],
  ["mongolia", "japan"],
  ["china", "japan"],
  ["china", "india"],
  ["china", "vietnam"],
  ["india", "vietnam"],
  ["india", "sumatra"],
  ["vietnam", "borneo"],

  ["sumatra", "australia"],
  ["borneo", "australia"],
  ["borneo", "newguinea"],
  ["newguinea", "australia"],
];

export const EDGES: ReadonlyArray<readonly [Territory, Territory]> = BORDERS;

export const NEIGHBORS: Record<Territory, Territory[]> = (() => {
  const out = Object.fromEntries(TERRITORY_IDS.map((t) => [t, [] as Territory[]])) as Record<Territory, Territory[]>;
  for (const [a, b] of BORDERS) {
    out[a].push(b);
    out[b].push(a);
  }
  return out;
})();

export const adjacent = (a: Territory, b: Territory) => NEIGHBORS[a].includes(b);

export const territoriesIn = (continent: Continent) => TERRITORY_IDS.filter((t) => TERRITORIES[t].continent === continent);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type Shape = "square" | "circle" | "triangle";

export const SHAPES: Shape[] = ["square", "circle", "triangle"];

/** A territory card is named after its territory; the two jokers are "joker-1" and "joker-2". */
export type Card = Territory | "joker-1" | "joker-2";

export const JOKERS: Card[] = ["joker-1", "joker-2"];

export const isJoker = (card: Card) => card === "joker-1" || card === "joker-2";

/** Fourteen of each figure, round the map. */
export const SHAPE_OF = Object.fromEntries(TERRITORY_IDS.map((t, i) => [t, SHAPES[i % 3]])) as Record<Territory, Shape>;

export const DECK: Card[] = [...TERRITORY_IDS, ...JOKERS];

/** Three of a figure, or one of each. A joker is whichever figure is missing. */
export function validSet(cards: Card[]): boolean {
  if (cards.length !== 3 || new Set(cards).size !== 3) return false;
  const shapes = cards.filter((c) => !isJoker(c)).map((c) => SHAPE_OF[c as Territory]);
  if (shapes.length < 3) return true;
  const kinds = new Set(shapes).size;
  return kinds === 1 || kinds === 3;
}

/** Armies for the nth trade of the game, counted across every player: 4, 6, 8, 10, 12, 15, 20... */
export function tradeValue(tradesSoFar: number): number {
  const table = [4, 6, 8, 10, 12, 15];
  return tradesSoFar < table.length ? table[tradesSoFar] : 15 + 5 * (tradesSoFar - table.length + 1);
}

/** Five cards in hand and you have to trade before placing anything. */
export const MUST_TRADE_AT = 5;

// ---------------------------------------------------------------------------
// Colours and objectives
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

export type Objective =
  | "eu-oc-any"
  | "eu-sa-any"
  | "as-sa"
  | "as-af"
  | "na-af"
  | "na-oc"
  | "t24"
  | "t18"
  | `kill-${Color}`;

const CONTINENT_GOALS: Record<string, { need: Continent[]; plusOne: boolean }> = {
  "eu-oc-any": { need: ["eu", "oc"], plusOne: true },
  "eu-sa-any": { need: ["eu", "sa"], plusOne: true },
  "as-sa": { need: ["as", "sa"], plusOne: false },
  "as-af": { need: ["as", "af"], plusOne: false },
  "na-af": { need: ["na", "af"], plusOne: false },
  "na-oc": { need: ["na", "oc"], plusOne: false },
};

/** The fourteen. A colour nobody is playing takes its card out of the game. */
export function objectivesFor(colors: Color[]): Objective[] {
  return [
    ...(Object.keys(CONTINENT_GOALS) as Objective[]),
    "t24",
    "t18",
    ...COLORS.filter((c) => colors.includes(c)).map((c) => `kill-${c}` as Objective),
  ];
}

export function objectiveText(objective: Objective): string {
  const goal = CONTINENT_GOALS[objective];
  if (goal) {
    const names = goal.need.map((c) => CONTINENTS[c].name);
    return goal.plusOne ? `conquer ${names.join(" and ")}, plus one more continent of your choice` : `conquer ${names.join(" and ")}`;
  }
  if (objective === "t24") return "conquer 24 territories of your choice";
  if (objective === "t18") return "conquer 18 territories and hold each with at least two armies";
  const color = objective.slice(5);
  return `destroy the ${color} armies completely. If they are yours, or someone else gets them first, conquer 24 territories instead`;
}

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
  continent: Partial<Record<Continent, number>>;
}

export interface WarState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  /** Everyone dealt in, in the order they play. */
  order: string[];
  /** Everyone knocked out, and who did it. */
  out: string[];
  killedBy: Record<string, string>;
  color: Record<string, Color>;
  owner: Partial<Record<Territory, string>>;
  armies: Partial<Record<Territory, number>>;
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
  moved: Partial<Record<Territory, number>>;
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

export const colorOf = (state: WarState, chair: string): Color => state.color[chair] ?? "white";
export const alive = (state: WarState) => state.order.filter((c) => !state.out.includes(c));
export const held = (state: WarState, chair: string) => TERRITORY_IDS.filter((t) => state.owner[t] === chair);
export const armiesOn = (state: WarState, t: Territory) => state.armies[t] ?? 0;
export const holdsContinent = (state: WarState, chair: string, continent: Continent) =>
  territoriesIn(continent).every((t) => state.owner[t] === chair);

/** What a player gets at the start of their turn: half their territories (three at least), and each whole continent. */
export function reinforcements(state: WarState, chair: string): Reserve {
  const continent: Partial<Record<Continent, number>> = {};
  for (const c of CONTINENT_IDS) if (holdsContinent(state, chair, c)) continent[c] = CONTINENTS[c].bonus;
  return { free: Math.max(3, Math.floor(held(state, chair).length / 2)), continent };
}

export const reserveTotal = (reserve: Reserve) =>
  reserve.free + Object.values(reserve.continent).reduce((sum, n) => sum + (n ?? 0), 0);

/**
 * A new game. The territories are dealt out in the open -- they are on the
 * board for everyone anyway -- one army on each. Whoever comes after the last
 * card dealt starts. The objectives, and the deck the cards are drawn from,
 * are for the database to shuffle.
 */
export function startGame(
  state: WarState,
  chairs: string[],
  random: Random,
  name: Name = (c) => c,
): { state: WarState; objectives: Objective[] } {
  const order = [...chairs];
  const color: Record<string, Color> = {};
  order.forEach((chair, i) => (color[chair] = COLORS[i]));
  const owner: Partial<Record<Territory, string>> = {};
  const armies: Partial<Record<Territory, number>> = {};
  shuffle(TERRITORY_IDS, random).forEach((t, i) => {
    owner[t] = order[i % order.length];
    armies[t] = 1;
  });
  const first = order[(TERRITORY_IDS.length % order.length) % order.length];
  const dealt: WarState = {
    ...emptyWar(state.seatCount),
    seats: state.seats,
    holders: state.holders,
    seatCount: state.seatCount,
    wins: state.wins ?? {},
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
    objectives: objectivesFor(order.map((c) => color[c])),
  };
}

// ---------------------------------------------------------------------------
// Placing armies
// ---------------------------------------------------------------------------

/**
 * Whether a set of placements uses up the reserve exactly, on your own land,
 * with every continent's bonus inside that continent.
 */
export function placementProblem(state: WarState, placed: Partial<Record<Territory, number>>): string | null {
  let total = 0;
  const inContinent: Partial<Record<Continent, number>> = {};
  for (const [t, n] of Object.entries(placed) as Array<[Territory, number]>) {
    if (!n) continue;
    if (n < 0 || !Number.isInteger(n)) return "whole armies only";
    if (state.owner[t] !== state.turn) return `${TERRITORIES[t]?.name ?? t} is not yours`;
    total += n;
    const c = TERRITORIES[t].continent;
    inContinent[c] = (inContinent[c] ?? 0) + n;
  }
  for (const [c, bonus] of Object.entries(state.reserve.continent) as Array<[Continent, number]>) {
    if ((inContinent[c] ?? 0) < bonus) return `${bonus} of them have to go in ${CONTINENTS[c].name}`;
  }
  const want = reserveTotal(state.reserve);
  if (total < want) return `${want - total} still to place`;
  if (total > want) return `${total - want} too many`;
  return null;
}

/** How much of each pool is still to place, given a set of placements so far. */
export function stillToPlace(state: WarState, placed: Partial<Record<Territory, number>>): Reserve {
  const continent = { ...state.reserve.continent };
  let free = state.reserve.free;
  for (const [t, n] of Object.entries(placed) as Array<[Territory, number]>) {
    let left = n ?? 0;
    const c = TERRITORIES[t].continent;
    const pool = continent[c] ?? 0;
    const fromPool = Math.min(pool, left);
    if (pool) continent[c] = pool - fromPool;
    left -= fromPool;
    free -= left;
  }
  return { free, continent };
}

/** Whether one more army can go on this territory. */
export function canPlaceOn(state: WarState, placed: Partial<Record<Territory, number>>, t: Territory): boolean {
  if (state.owner[t] !== state.turn) return false;
  const left = stillToPlace(state, placed);
  return left.free > 0 || (left.continent[TERRITORIES[t].continent] ?? 0) > 0;
}

export function place(state: WarState, placed: Partial<Record<Territory, number>>, name: Name = (c) => c): WarState {
  if (state.phase !== "play" || state.step !== "place" || placementProblem(state, placed)) return state;
  const armies = { ...state.armies };
  let total = 0;
  for (const [t, n] of Object.entries(placed) as Array<[Territory, number]>) {
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
  // The first time round there is only placing.
  return state.round <= 1 ? endTurn(next, name) : { ...next, step: "attack" };
}

/**
 * Three cards traded in for armies at the start of a turn, on top of the rest:
 * the going rate, and two more on each territory pictured that you hold.
 */
export function trade(state: WarState, cards: Card[], name: Name = (c) => c): WarState {
  if (state.phase !== "play" || state.step !== "place" || !validSet(cards)) return state;
  const worth = tradeValue(state.trades);
  const armies = { ...state.armies };
  let extra = 0;
  for (const card of cards) {
    if (!isJoker(card) && state.owner[card as Territory] === state.turn) {
      armies[card as Territory] = (armies[card as Territory] ?? 0) + 2;
      extra += 2;
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

export const attackDice = (state: WarState, from: Territory) => Math.max(0, Math.min(3, armiesOn(state, from) - 1));
export const defendDice = (state: WarState, to: Territory) => Math.max(0, Math.min(3, armiesOn(state, to)));

export function canAttackFrom(state: WarState, from: Territory): boolean {
  return state.owner[from] === state.turn && armiesOn(state, from) >= 2 && NEIGHBORS[from].some((n) => state.owner[n] !== state.turn);
}

export function targetsFrom(state: WarState, from: Territory): Territory[] {
  if (!canAttackFrom(state, from)) return [];
  return NEIGHBORS[from].filter((n) => state.owner[n] !== state.turn);
}

/** Highest against highest, then the next pair, and so on; a tie goes to the defence. Returns the armies lost by each side. */
export function fight(attack: number[], defend: number[]): [number, number] {
  const a = [...attack].sort((x, y) => y - x);
  const d = [...defend].sort((x, y) => y - x);
  let lostA = 0;
  let lostD = 0;
  for (let i = 0; i < Math.min(a.length, d.length); i += 1) {
    if (a[i] > d[i]) lostD += 1;
    else lostA += 1;
  }
  return [lostA, lostD];
}

const rollDice = (n: number, random: Random) => Array.from({ length: n }, () => random(6) + 1).sort((x, y) => y - x);

/**
 * An attack: one throw of the dice, or -- all in -- throw after throw until the
 * territory falls or there is only the occupying army left to attack with.
 * The attacker picks how many dice (three at most, and never the last army);
 * the defence rolls one for each army, up to three.
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
  if (state.phase !== "play" || state.step !== "attack" || state.round <= 1) return state;
  if (!targetsFrom(state, from).includes(to)) return state;
  const defender = state.owner[to] as string;
  const armies = { ...state.armies };
  const lost: [number, number] = [0, 0];
  let throws = 0;
  let a: number[] = [];
  let d: number[] = [];
  do {
    const nA = Math.max(1, Math.min(dice, 3, (armies[from] ?? 0) - 1));
    const nD = Math.min(3, armies[to] ?? 0);
    a = rollDice(nA, random);
    d = rollDice(nD, random);
    const [lA, lD] = fight(a, d);
    armies[from] = (armies[from] ?? 0) - lA;
    armies[to] = (armies[to] ?? 0) - lD;
    lost[0] += lA;
    lost[1] += lD;
    throws += 1;
  } while (allIn && (armies[to] ?? 0) > 0 && (armies[from] ?? 0) >= 2 && throws < 200);

  const won = (armies[to] ?? 0) <= 0;
  const battle: Battle = { n: (state.battle?.n ?? 0) + 1, chair: state.turn, from, to, attack: a, defend: d, lost, throws, won };
  const line = `${name(state.turn)} ${TERRITORIES[from].name} -> ${TERRITORIES[to].name}: lost ${lost[0]}, killed ${lost[1]}${won ? `, took it` : ""}`;
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
  if (!TERRITORY_IDS.some((t) => owner[t] === defender)) {
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
  if (state.owner[to] !== state.turn || !adjacent(from, to)) return state;
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
export const chairOfColor = (state: WarState, color: Color) => state.order.find((c) => state.color[c] === color);

/**
 * Whether a player has done what their card asks. Only the player -- or the
 * screen holding their card -- can ask this, since only they can read it.
 */
export function objectiveMet(state: WarState, chair: string, objective: Objective): boolean {
  const mine = held(state, chair);
  const goal = CONTINENT_GOALS[objective];
  if (goal) {
    if (!goal.need.every((c) => holdsContinent(state, chair, c))) return false;
    if (!goal.plusOne) return true;
    return CONTINENT_IDS.some((c) => !goal.need.includes(c) && holdsContinent(state, chair, c));
  }
  if (objective === "t24") return mine.length >= 24;
  if (objective === "t18") return mine.filter((t) => armiesOn(state, t) >= 2).length >= 18;
  if (objective.startsWith("kill-")) {
    const target = chairOfColor(state, objective.slice(5) as Color);
    if (target && target !== chair && state.out.includes(target) && state.killedBy[target] === chair) return true;
    // Your own colour, a colour not at the table, or somebody else got there first.
    const instead = !target || target === chair || (state.out.includes(target) && state.killedBy[target] !== chair);
    return instead && mine.length >= 24;
  }
  return false;
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
export function inheritance(heirHand: number, victimHand: number): { take: number; discard: number } {
  const take = Math.max(0, Math.min(victimHand, 5 - heirHand));
  return { take, discard: victimHand - take };
}
