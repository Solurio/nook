// Monopoly, the whole of it: buying, rent, sets, houses and hotels, the
// mortgage, jail, the two decks, auctions when nobody buys, trading, and going
// broke. Every move is a pure function from one state of the game to the
// next, so the rules live here and nowhere else.
//
// The board is the classic one, laid on the streets of Atlantic City. The
// cards say what the classic cards do, in their own words.

export type Chair = `p${number}`;

export type Group = "brown" | "light" | "pink" | "orange" | "red" | "yellow" | "green" | "blue";

export type Space =
  | { kind: "go"; name: string }
  | { kind: "street"; name: string; group: Group; price: number; rents: number[]; house: number }
  | { kind: "rail"; name: string; price: number }
  | { kind: "utility"; name: string; price: number }
  | { kind: "tax"; name: string; amount: number }
  | { kind: "chance"; name: string }
  | { kind: "chest"; name: string }
  | { kind: "jail"; name: string }
  | { kind: "parking"; name: string }
  | { kind: "gotojail"; name: string };

const street = (name: string, group: Group, price: number, house: number, rents: number[]): Space => ({
  kind: "street",
  name,
  group,
  price,
  house,
  rents,
});

/** Forty squares, starting at GO and going round. */
export const BOARD: Space[] = [
  { kind: "go", name: "GO" },
  street("Mediterranean Avenue", "brown", 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: "chest", name: "Community Chest" },
  street("Baltic Avenue", "brown", 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: "tax", name: "Income Tax", amount: 200 },
  { kind: "rail", name: "Reading Railroad", price: 200 },
  street("Oriental Avenue", "light", 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: "chance", name: "Chance" },
  street("Vermont Avenue", "light", 100, 50, [6, 30, 90, 270, 400, 550]),
  street("Connecticut Avenue", "light", 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: "jail", name: "Jail" },
  street("St. Charles Place", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  { kind: "utility", name: "Electric Company", price: 150 },
  street("States Avenue", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  street("Virginia Avenue", "pink", 160, 100, [12, 60, 180, 500, 700, 900]),
  { kind: "rail", name: "Pennsylvania Railroad", price: 200 },
  street("St. James Place", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: "chest", name: "Community Chest" },
  street("Tennessee Avenue", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  street("New York Avenue", "orange", 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: "parking", name: "Free Parking" },
  street("Kentucky Avenue", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: "chance", name: "Chance" },
  street("Indiana Avenue", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  street("Illinois Avenue", "red", 240, 150, [20, 100, 300, 750, 925, 1100]),
  { kind: "rail", name: "B. & O. Railroad", price: 200 },
  street("Atlantic Avenue", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  street("Ventnor Avenue", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  { kind: "utility", name: "Water Works", price: 150 },
  street("Marvin Gardens", "yellow", 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: "gotojail", name: "Go to Jail" },
  street("Pacific Avenue", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street("North Carolina Avenue", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: "chest", name: "Community Chest" },
  street("Pennsylvania Avenue", "green", 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  { kind: "rail", name: "Short Line", price: 200 },
  { kind: "chance", name: "Chance" },
  street("Park Place", "blue", 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: "tax", name: "Luxury Tax", amount: 100 },
  street("Boardwalk", "blue", 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export const JAIL = 10;
export const GO_MONEY = 200;
export const HOUSES = 32;
export const HOTELS = 12;
export const RAIL_RENT = [25, 50, 100, 200];

export const GROUP_COLOR: Record<Group, string> = {
  brown: "#8a5a33",
  light: "#a9d8f2",
  pink: "#d14e9b",
  orange: "#f08a24",
  red: "#e0303a",
  yellow: "#f4d35e",
  green: "#2f9e5b",
  blue: "#2f5fb8",
};

export const TOKENS = ["#e0655c", "#6aa9e0", "#a6d189", "#f6c177", "#c4a7f0", "#f2a4b8", "#8bc7e8", "#e9e2d0"];

export const isOwnable = (s: Space): s is Extract<Space, { price: number }> => s.kind === "street" || s.kind === "rail" || s.kind === "utility";

export const priceOf = (at: number) => {
  const s = BOARD[at];
  return isOwnable(s) ? s.price : 0;
};

export const groupOf = (at: number): Group | null => {
  const s = BOARD[at];
  return s.kind === "street" ? s.group : null;
};

export const groupSquares = (group: Group) => BOARD.map((s, i) => (s.kind === "street" && s.group === group ? i : -1)).filter((i) => i >= 0);

// ---------------------------------------------------------------------------
// The cards
// ---------------------------------------------------------------------------

export type Effect =
  | { do: "collect"; amount: number }
  | { do: "pay"; amount: number }
  | { do: "advance"; to: number }
  | { do: "back"; by: number }
  | { do: "jail" }
  | { do: "free" }
  | { do: "repairs"; house: number; hotel: number }
  | { do: "each-pays"; amount: number }
  | { do: "pay-each"; amount: number }
  | { do: "nearest"; kind: "rail" | "utility" };

export interface Card {
  text: string;
  effect: Effect;
}

export const CHANCE: Card[] = [
  { text: "Go straight to GO and collect $200.", effect: { do: "advance", to: 0 } },
  { text: "Head for Illinois Avenue. Collect $200 if you pass GO.", effect: { do: "advance", to: 24 } },
  { text: "Head for St. Charles Place. Collect $200 if you pass GO.", effect: { do: "advance", to: 11 } },
  { text: "Take a walk on the Boardwalk.", effect: { do: "advance", to: 39 } },
  { text: "Catch the Reading Railroad. Collect $200 if you pass GO.", effect: { do: "advance", to: 5 } },
  { text: "Go to the nearest railroad. If someone owns it, pay them twice the rent.", effect: { do: "nearest", kind: "rail" } },
  { text: "Go to the nearest railroad. If someone owns it, pay them twice the rent.", effect: { do: "nearest", kind: "rail" } },
  { text: "Go to the nearest utility. If someone owns it, throw the dice and pay ten times the roll.", effect: { do: "nearest", kind: "utility" } },
  { text: "The bank pays you a dividend of $50.", effect: { do: "collect", amount: 50 } },
  { text: "Your building loan comes good. Collect $150.", effect: { do: "collect", amount: 150 } },
  { text: "Get out of jail free. Keep this until you need it.", effect: { do: "free" } },
  { text: "Step back three squares.", effect: { do: "back", by: 3 } },
  { text: "Straight to jail. Do not pass GO.", effect: { do: "jail" } },
  { text: "Your properties need work: $25 a house and $100 a hotel.", effect: { do: "repairs", house: 25, hotel: 100 } },
  { text: "Caught speeding. Pay $15.", effect: { do: "pay", amount: 15 } },
  { text: "You have been voted chair of the board. Pay everyone $50.", effect: { do: "pay-each", amount: 50 } },
];

export const CHEST: Card[] = [
  { text: "Go straight to GO and collect $200.", effect: { do: "advance", to: 0 } },
  { text: "The bank made a mistake in your favour. Collect $200.", effect: { do: "collect", amount: 200 } },
  { text: "The doctor sends a bill. Pay $50.", effect: { do: "pay", amount: 50 } },
  { text: "You sold some shares. Collect $50.", effect: { do: "collect", amount: 50 } },
  { text: "Get out of jail free. Keep this until you need it.", effect: { do: "free" } },
  { text: "Straight to jail. Do not pass GO.", effect: { do: "jail" } },
  { text: "Your holiday savings come in. Collect $100.", effect: { do: "collect", amount: 100 } },
  { text: "A tax refund arrives. Collect $20.", effect: { do: "collect", amount: 20 } },
  { text: "It is your birthday. Everyone gives you $10.", effect: { do: "each-pays", amount: 10 } },
  { text: "Your life insurance pays out. Collect $100.", effect: { do: "collect", amount: 100 } },
  { text: "Hospital bill. Pay $100.", effect: { do: "pay", amount: 100 } },
  { text: "School fees are due. Pay $50.", effect: { do: "pay", amount: 50 } },
  { text: "A little consulting on the side. Collect $25.", effect: { do: "collect", amount: 25 } },
  { text: "The street needs mending: $40 a house and $115 a hotel.", effect: { do: "repairs", house: 40, hotel: 115 } },
  { text: "Second prize in a beauty contest. Collect $10.", effect: { do: "collect", amount: 10 } },
  { text: "A distant aunt leaves you $100.", effect: { do: "collect", amount: 100 } },
];

// ---------------------------------------------------------------------------
// The state of a game
// ---------------------------------------------------------------------------

export interface Player {
  cash: number;
  at: number;
  /** In jail, and how many turns have been spent there. */
  jailed: boolean;
  jailTurns: number;
  /** Get-out-of-jail cards held, by the deck each came from. */
  free: Array<"chance" | "chest">;
  bankrupt: boolean;
  color: string;
}

export interface Deed {
  by: Chair;
  /** 0 to 4 houses; 5 is a hotel. */
  houses: number;
  mortgaged: boolean;
}

export interface Trade {
  from: Chair;
  to: Chair;
  give: { cash: number; squares: number[]; free: number };
  get: { cash: number; squares: number[]; free: number };
}

export type Pending =
  | { kind: "buy"; at: number }
  | { kind: "auction"; at: number; bid: number; by: Chair | null; out: Chair[] }
  | { kind: "debt"; who: Chair; to: Chair | null };

export interface MonopolyState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "setup" | "roll" | "moved" | "over";
  /** The players in this game, in turn order. */
  order: Chair[];
  players: Record<string, Player>;
  turn: Chair;
  dice: [number, number] | null;
  /** Doubles thrown in a row this turn. */
  doubles: number;
  deeds: Record<string, Deed>;
  /** What is left of each deck, top first; a deck is reshuffled when it runs out. */
  chance: number[];
  chest: number[];
  /** The card just drawn, to show. */
  drawn?: { deck: "chance" | "chest"; card: number } | null;
  pending?: Pending | null;
  trade?: Trade | null;
  /** Free Parking collects the taxes and fines, and pays them out, if the table plays it. */
  jackpot: boolean;
  pot: number;
  log: string[];
  winner?: Chair | null;
}

export const chairsFor = (count: number): Chair[] =>
  Array.from({ length: Math.max(2, Math.min(8, count)) }, (_, i) => `p${i}` as Chair);

export function emptyMonopoly(): MonopolyState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount: 4,
    phase: "setup",
    order: [],
    players: {},
    turn: "p0",
    dice: null,
    doubles: 0,
    deeds: {},
    chance: [],
    chest: [],
    drawn: null,
    pending: null,
    trade: null,
    jackpot: false,
    pot: 0,
    log: [],
    winner: null,
  };
}

export function upgradeMonopoly(state: unknown): MonopolyState {
  const s = (state ?? {}) as Partial<MonopolyState>;
  if (s.version !== 1) return emptyMonopoly();
  return { ...emptyMonopoly(), ...s };
}

function shuffled(n: number, random: () => number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const said = (state: MonopolyState, line: string): MonopolyState => ({ ...state, log: [line, ...state.log].slice(0, 30) });

/** Everyone sitting down gets $1,500 and a colour, and the decks are shuffled. */
export function startGame(state: MonopolyState, chairs: Chair[], names: (c: Chair) => string, random: () => number = Math.random): MonopolyState {
  const order = chairs.slice(0, 8);
  if (order.length < 2) return state;
  const players: Record<string, Player> = {};
  order.forEach((c, i) => {
    players[c] = { cash: 1500, at: 0, jailed: false, jailTurns: 0, free: [], bankrupt: false, color: TOKENS[i % TOKENS.length] };
  });
  return said(
    {
      ...state,
      phase: "roll",
      order,
      players,
      turn: order[0],
      dice: null,
      doubles: 0,
      deeds: {},
      chance: shuffled(CHANCE.length, random),
      chest: shuffled(CHEST.length, random),
      drawn: null,
      pending: null,
      trade: null,
      pot: 0,
      winner: null,
      log: [],
    },
    `${names(order[0])} goes first`,
  );
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const player = (state: MonopolyState, c: Chair) => state.players[c];

function withPlayer(state: MonopolyState, c: Chair, patch: Partial<Player>): MonopolyState {
  return { ...state, players: { ...state.players, [c]: { ...state.players[c], ...patch } } };
}

/**
 * Money from one to another -- or to or from the bank, when that side is null.
 * Paying more than you have leaves you owing: your cash goes below zero and the
 * game will not move on until you raise it or give up.
 */
export function transfer(state: MonopolyState, from: Chair | null, to: Chair | null, amount: number): MonopolyState {
  if (amount <= 0) return state;
  let next = state;
  if (from) next = withPlayer(next, from, { cash: player(next, from).cash - amount });
  if (to) next = withPlayer(next, to, { cash: player(next, to).cash + amount });
  if (from && player(next, from).cash < 0 && !next.pending) {
    next = { ...next, pending: { kind: "debt", who: from, to } };
  }
  return next;
}

/** A tax or a fine: to the bank, or to Free Parking when the table plays the jackpot. */
function fine(state: MonopolyState, c: Chair, amount: number): MonopolyState {
  const paid = transfer(state, c, null, amount);
  return state.jackpot ? { ...paid, pot: paid.pot + amount } : paid;
}

// ---------------------------------------------------------------------------
// Owning things
// ---------------------------------------------------------------------------

export const deedOf = (state: MonopolyState, at: number): Deed | undefined => state.deeds[String(at)];

export const ownedBy = (state: MonopolyState, c: Chair) =>
  Object.entries(state.deeds)
    .filter(([, d]) => d.by === c)
    .map(([at]) => Number(at))
    .sort((a, b) => a - b);

/** Whether one player owns every street of a colour. */
export function ownsSet(state: MonopolyState, c: Chair, group: Group): boolean {
  return groupSquares(group).every((at) => deedOf(state, at)?.by === c);
}

export function housesLeft(state: MonopolyState): { houses: number; hotels: number } {
  let houses = 0;
  let hotels = 0;
  for (const d of Object.values(state.deeds)) {
    if (d.houses === 5) hotels += 1;
    else houses += d.houses;
  }
  return { houses: HOUSES - houses, hotels: HOTELS - hotels };
}

/** What landing here costs, given who owns it and what the dice said. */
export function rentFor(state: MonopolyState, at: number, dice: number, doubleRail = false, tenTimes = false): number {
  const s = BOARD[at];
  const d = deedOf(state, at);
  if (!d || d.mortgaged) return 0;
  if (s.kind === "street") {
    if (d.houses > 0) return s.rents[d.houses];
    return ownsSet(state, d.by, s.group) ? s.rents[0] * 2 : s.rents[0];
  }
  if (s.kind === "rail") {
    const count = BOARD.filter((x, i) => x.kind === "rail" && deedOf(state, i)?.by === d.by).length;
    return RAIL_RENT[count - 1] * (doubleRail ? 2 : 1);
  }
  if (s.kind === "utility") {
    const count = BOARD.filter((x, i) => x.kind === "utility" && deedOf(state, i)?.by === d.by).length;
    return dice * (tenTimes || count === 2 ? 10 : 4);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Going round the board
// ---------------------------------------------------------------------------

function toJail(state: MonopolyState, c: Chair, names: (c: Chair) => string): MonopolyState {
  return said({ ...withPlayer(state, c, { at: JAIL, jailed: true, jailTurns: 0 }), doubles: 0 }, `${names(c)} goes to jail`);
}

function moveTo(state: MonopolyState, c: Chair, to: number, names: (c: Chair) => string, passGo = true): MonopolyState {
  const from = player(state, c).at;
  let next = withPlayer(state, c, { at: to });
  if (passGo && to < from) {
    next = transfer(next, null, c, GO_MONEY);
    next = said(next, `${names(c)} passes GO and collects $${GO_MONEY}`);
  }
  return next;
}

/** A card off the top of a deck, and what it does. */
function draw(state: MonopolyState, c: Chair, deck: "chance" | "chest", dice: number, names: (c: Chair) => string, random: () => number): MonopolyState {
  const cards = deck === "chance" ? CHANCE : CHEST;
  let pile = state[deck].length ? state[deck] : shuffled(cards.length, random);
  // A jail card someone is holding is not in the deck.
  const held = Object.values(state.players).flatMap((p) => p.free).filter((d) => d === deck).length;
  const freeIndex = cards.findIndex((card) => card.effect.do === "free");
  if (held > 0) pile = pile.filter((i) => i !== freeIndex);
  if (!pile.length) pile = shuffled(cards.length, random).filter((i) => i !== freeIndex);
  const [top, ...rest] = pile;
  const card = cards[top];
  let next: MonopolyState = { ...state, [deck]: card.effect.do === "free" ? rest : [...rest, top], drawn: { deck, card: top } };
  next = said(next, `${names(c)}: ${card.text}`);

  const e = card.effect;
  switch (e.do) {
    case "collect":
      return transfer(next, null, c, e.amount);
    case "pay":
      return fine(next, c, e.amount);
    case "free":
      return withPlayer(next, c, { free: [...player(next, c).free, deck] });
    case "jail":
      return toJail(next, c, names);
    case "advance":
      return land(moveTo(next, c, e.to, names), c, dice, names, random);
    case "back": {
      const at = (player(next, c).at - e.by + 40) % 40;
      return land(moveTo(next, c, at, names, false), c, dice, names, random);
    }
    case "repairs": {
      let cost = 0;
      for (const d of Object.values(next.deeds)) {
        if (d.by !== c) continue;
        cost += d.houses === 5 ? e.hotel : d.houses * e.house;
      }
      return fine(next, c, cost);
    }
    case "each-pays": {
      let out = next;
      for (const other of next.order) {
        if (other === c || player(out, other).bankrupt) continue;
        out = transfer(out, other, c, e.amount);
      }
      return out;
    }
    case "pay-each": {
      let out = next;
      for (const other of next.order) {
        if (other === c || player(out, other).bankrupt) continue;
        out = transfer(out, c, other, e.amount);
      }
      return out;
    }
    case "nearest": {
      const from = player(next, c).at;
      let at = from;
      for (let step = 1; step <= 40; step += 1) {
        const i = (from + step) % 40;
        if (BOARD[i].kind === e.kind) {
          at = i;
          break;
        }
      }
      const moved = moveTo(next, c, at, names);
      const d = deedOf(moved, at);
      if (d && d.by !== c && !d.mortgaged) {
        const rent = rentFor(moved, at, dice, e.kind === "rail", e.kind === "utility");
        return said(transfer(moved, c, d.by, rent), `${names(c)} pays ${names(d.by)} $${rent}`);
      }
      return land(moved, c, dice, names, random);
    }
  }
}

/** What happens on the square a player has come to. */
function land(state: MonopolyState, c: Chair, dice: number, names: (c: Chair) => string, random: () => number): MonopolyState {
  const at = player(state, c).at;
  const s = BOARD[at];
  switch (s.kind) {
    case "street":
    case "rail":
    case "utility": {
      const d = deedOf(state, at);
      if (!d) return { ...state, pending: state.pending ?? { kind: "buy", at } };
      if (d.by === c || d.mortgaged) return state;
      const rent = rentFor(state, at, dice);
      return said(transfer(state, c, d.by, rent), `${names(c)} pays ${names(d.by)} $${rent} for ${s.name}`);
    }
    case "tax":
      return said(fine(state, c, s.amount), `${names(c)} pays $${s.amount} in ${s.name.toLowerCase()}`);
    case "chance":
      return draw(state, c, "chance", dice, names, random);
    case "chest":
      return draw(state, c, "chest", dice, names, random);
    case "gotojail":
      return toJail(state, c, names);
    case "parking":
      if (state.jackpot && state.pot > 0) {
        const pot = state.pot;
        return said({ ...transfer(state, null, c, pot), pot: 0 }, `${names(c)} scoops $${pot} off Free Parking`);
      }
      return state;
    default:
      return state;
  }
}

/**
 * A throw of the dice, and everything that follows from it: out of jail or
 * not, round the board, and whatever is waiting on the square it ends on.
 */
export function roll(state: MonopolyState, names: (c: Chair) => string, random: () => number = Math.random): MonopolyState {
  if (state.phase !== "roll" || state.pending) return state;
  const c = state.turn;
  const me = player(state, c);
  const a = 1 + Math.floor(random() * 6);
  const b = 1 + Math.floor(random() * 6);
  const double = a === b;
  let next: MonopolyState = { ...state, dice: [a, b], drawn: null };
  next = said(next, `${names(c)} throws ${a} and ${b}`);

  if (me.jailed) {
    if (double) {
      next = said(withPlayer(next, c, { jailed: false, jailTurns: 0 }), `${names(c)} throws a double and walks out`);
      // Out on a double moves, but does not throw again.
      next = { ...next, doubles: 0 };
    } else if (me.jailTurns >= 2) {
      next = fine(withPlayer(next, c, { jailed: false, jailTurns: 0 }), c, 50);
      next = said(next, `${names(c)} pays $50 on the third try and leaves`);
    } else {
      next = withPlayer(next, c, { jailTurns: me.jailTurns + 1 });
      return { ...next, phase: "moved", doubles: 0 };
    }
    const moved = moveTo(next, c, (me.at + a + b) % 40, names);
    return { ...land(moved, c, a + b, names, random), phase: "moved" };
  }

  const doubles = double ? state.doubles + 1 : 0;
  if (doubles === 3) {
    return { ...toJail(next, c, names), phase: "moved", doubles: 0 };
  }
  next = { ...next, doubles };
  const moved = moveTo(next, c, (me.at + a + b) % 40, names);
  const landed = land(moved, c, a + b, names, random);
  // A double throws again -- unless the throw ended in jail.
  const again = double && !player(landed, c).jailed;
  return { ...landed, phase: again ? "roll" : "moved", doubles: again ? doubles : 0 };
}

/** Buying the square you are standing on. */
export function buy(state: MonopolyState, names: (c: Chair) => string): MonopolyState {
  const p = state.pending;
  if (!p || p.kind !== "buy") return state;
  const c = state.turn;
  const price = priceOf(p.at);
  if (player(state, c).cash < price) return state;
  const next = transfer({ ...state, pending: null }, c, null, price);
  return said({ ...next, deeds: { ...next.deeds, [String(p.at)]: { by: c, houses: 0, mortgaged: false } } }, `${names(c)} buys ${BOARD[p.at].name} for $${price}`);
}

/** Not buying it: it goes up for auction, and anyone may bid. */
export function decline(state: MonopolyState, names: (c: Chair) => string): MonopolyState {
  const p = state.pending;
  if (!p || p.kind !== "buy") return state;
  return said({ ...state, pending: { kind: "auction", at: p.at, bid: 0, by: null, out: [] } }, `${names(state.turn)} passes, and ${BOARD[p.at].name} goes up for auction`);
}

export function bid(state: MonopolyState, c: Chair, amount: number): MonopolyState {
  const p = state.pending;
  if (!p || p.kind !== "auction" || p.out.includes(c)) return state;
  if (amount <= p.bid || amount > player(state, c).cash) return state;
  return { ...state, pending: { ...p, bid: amount, by: c } };
}

/** Dropping out of an auction. When everyone but the top bidder is out, it closes. */
export function leaveAuction(state: MonopolyState, c: Chair, names: (c: Chair) => string): MonopolyState {
  const p = state.pending;
  if (!p || p.kind !== "auction" || p.out.includes(c)) return state;
  const next = { ...state, pending: { ...p, out: [...p.out, c] } };
  const still = state.order.filter((x) => !player(state, x).bankrupt && !next.pending.out.includes(x));
  if (still.length === 0 || (still.length === 1 && still[0] === p.by)) return closeAuction(next, names);
  return next;
}

export function closeAuction(state: MonopolyState, names: (c: Chair) => string): MonopolyState {
  const p = state.pending;
  if (!p || p.kind !== "auction") return state;
  if (!p.by || p.bid <= 0) return said({ ...state, pending: null }, `nobody bid on ${BOARD[p.at].name}`);
  const next = transfer({ ...state, pending: null }, p.by, null, p.bid);
  return said(
    { ...next, deeds: { ...next.deeds, [String(p.at)]: { by: p.by, houses: 0, mortgaged: false } } },
    `${names(p.by)} wins ${BOARD[p.at].name} for $${p.bid}`,
  );
}

/** Done for this turn: the dice go round to the next player still in the game. */
export function endTurn(state: MonopolyState): MonopolyState {
  if (state.phase !== "moved" || state.pending) return state;
  const live = state.order.filter((c) => !player(state, c).bankrupt);
  const at = live.indexOf(state.turn);
  const next = live[(at + 1) % live.length] ?? state.turn;
  return { ...state, turn: next, phase: "roll", dice: null, doubles: 0, drawn: null };
}

// ---------------------------------------------------------------------------
// Jail
// ---------------------------------------------------------------------------

export function payOut(state: MonopolyState, names: (c: Chair) => string): MonopolyState {
  const c = state.turn;
  if (state.phase !== "roll" || !player(state, c).jailed || player(state, c).cash < 50) return state;
  return said(fine(withPlayer(state, c, { jailed: false, jailTurns: 0 }), c, 50), `${names(c)} pays $50 to leave jail`);
}

export function useFreeCard(state: MonopolyState, names: (c: Chair) => string): MonopolyState {
  const c = state.turn;
  const me = player(state, c);
  if (state.phase !== "roll" || !me.jailed || me.free.length === 0) return state;
  const [deck, ...rest] = me.free;
  const cards = deck === "chance" ? CHANCE : CHEST;
  const index = cards.findIndex((card) => card.effect.do === "free");
  const next = withPlayer(state, c, { jailed: false, jailTurns: 0, free: rest });
  // The card goes back under its deck.
  return said({ ...next, [deck]: [...next[deck], index] }, `${names(c)} uses a get-out-of-jail card`);
}

// ---------------------------------------------------------------------------
// Building, selling, mortgaging
// ---------------------------------------------------------------------------

/** Why a house cannot go on a street now, or null if it can. */
export function buildProblem(state: MonopolyState, c: Chair, at: number): string | null {
  const s = BOARD[at];
  const d = deedOf(state, at);
  if (s.kind !== "street" || !d || d.by !== c) return "not yours to build on";
  if (!ownsSet(state, c, s.group)) return "you need the whole colour set first";
  const set = groupSquares(s.group);
  if (set.some((i) => deedOf(state, i)?.mortgaged)) return "a street in the set is mortgaged";
  if (d.houses >= 5) return "it already has a hotel";
  const lowest = Math.min(...set.map((i) => deedOf(state, i)?.houses ?? 0));
  if (d.houses > lowest) return "build evenly across the set";
  const left = housesLeft(state);
  if (d.houses === 4 ? left.hotels <= 0 : left.houses <= 0) return d.houses === 4 ? "the bank is out of hotels" : "the bank is out of houses";
  if (player(state, c).cash < s.house) return "not enough cash";
  return null;
}

export function build(state: MonopolyState, c: Chair, at: number, names: (c: Chair) => string): MonopolyState {
  if (buildProblem(state, c, at)) return state;
  const s = BOARD[at] as Extract<Space, { kind: "street" }>;
  const d = deedOf(state, at) as Deed;
  const next = transfer(state, c, null, s.house);
  return said({ ...next, deeds: { ...next.deeds, [String(at)]: { ...d, houses: d.houses + 1 } } }, `${names(c)} builds on ${s.name}`);
}

export function sellHouse(state: MonopolyState, c: Chair, at: number, names: (c: Chair) => string): MonopolyState {
  const s = BOARD[at];
  const d = deedOf(state, at);
  if (s.kind !== "street" || !d || d.by !== c || d.houses === 0) return state;
  const set = groupSquares(s.group);
  const highest = Math.max(...set.map((i) => deedOf(state, i)?.houses ?? 0));
  if (d.houses < highest) return state;
  const next = transfer(state, null, c, Math.floor(s.house / 2));
  return clearDebt(said({ ...next, deeds: { ...next.deeds, [String(at)]: { ...d, houses: d.houses - 1 } } }, `${names(c)} sells a house on ${s.name}`));
}

export function mortgage(state: MonopolyState, c: Chair, at: number, names: (c: Chair) => string): MonopolyState {
  const s = BOARD[at];
  const d = deedOf(state, at);
  if (!isOwnable(s) || !d || d.by !== c || d.mortgaged) return state;
  if (s.kind === "street" && groupSquares(s.group).some((i) => (deedOf(state, i)?.houses ?? 0) > 0)) return state;
  const next = transfer(state, null, c, Math.floor(s.price / 2));
  return clearDebt(said({ ...next, deeds: { ...next.deeds, [String(at)]: { ...d, mortgaged: true } } }, `${names(c)} mortgages ${s.name}`));
}

export function unmortgage(state: MonopolyState, c: Chair, at: number, names: (c: Chair) => string): MonopolyState {
  const s = BOARD[at];
  const d = deedOf(state, at);
  if (!isOwnable(s) || !d || d.by !== c || !d.mortgaged) return state;
  // What the mortgage raised, and ten per cent on top.
  const half = Math.floor(s.price / 2);
  const cost = half + Math.ceil(half / 10);
  if (player(state, c).cash < cost) return state;
  const next = transfer(state, c, null, cost);
  return said({ ...next, deeds: { ...next.deeds, [String(at)]: { ...d, mortgaged: false } } }, `${names(c)} pays off the mortgage on ${s.name}`);
}

/**
 * Money raised enough to cover what was owed: the game moves on -- unless
 * somebody else is still short, a birthday card being able to put several
 * people under at once.
 */
function clearDebt(state: MonopolyState): MonopolyState {
  const p = state.pending;
  if (p?.kind !== "debt" || player(state, p.who).cash < 0) return state;
  const short = state.order.find((c) => !player(state, c).bankrupt && player(state, c).cash < 0);
  return { ...state, pending: short ? { kind: "debt", who: short, to: null } : null };
}

/**
 * Giving up. Everything goes to whoever was owed: their cash, their streets
 * mortgages and all, their jail cards -- or, owing the bank, back to the bank
 * with the buildings taken down. Last one standing wins.
 */
export function goBroke(state: MonopolyState, c: Chair, names: (c: Chair) => string): MonopolyState {
  const p = state.pending;
  const to = p?.kind === "debt" && p.who === c ? p.to : null;
  const me = player(state, c);
  let next = state;
  const deeds = { ...next.deeds };
  for (const [at, d] of Object.entries(deeds)) {
    if (d.by !== c) continue;
    if (to) deeds[at] = { ...d, by: to, houses: 0 };
    else delete deeds[at];
  }
  // Buildings go back to the bank either way; the heir gets half their price.
  let buildings = 0;
  for (const [at, d] of Object.entries(state.deeds)) {
    if (d.by !== c || d.houses === 0) continue;
    const s = BOARD[Number(at)] as Extract<Space, { kind: "street" }>;
    buildings += Math.floor((s.house * d.houses) / 2);
  }
  next = { ...next, deeds };
  if (to) {
    next = withPlayer(next, to, {
      cash: player(next, to).cash + me.cash + buildings,
      free: [...player(next, to).free, ...me.free],
    });
  }
  next = withPlayer(next, c, { bankrupt: true, cash: 0, free: [] });
  next = said({ ...next, pending: p?.kind === "debt" && p.who === c ? null : next.pending }, `${names(c)} is out of the game`);

  const live = next.order.filter((x) => !player(next, x).bankrupt);
  if (live.length === 1) {
    return said({ ...next, phase: "over", winner: live[0] }, `${names(live[0])} owns the town`);
  }
  if (next.turn === c) {
    const at = next.order.indexOf(c);
    const after = [...next.order.slice(at + 1), ...next.order.slice(0, at)].find((x) => !player(next, x).bankrupt) ?? live[0];
    next = { ...next, turn: after, phase: "roll", dice: null, doubles: 0 };
  }
  return next;
}

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------

/** Why a trade cannot stand as it is, or null. */
export function tradeProblem(state: MonopolyState, t: Trade): string | null {
  if (t.from === t.to) return "a trade needs two people";
  const a = player(state, t.from);
  const b = player(state, t.to);
  if (!a || !b || a.bankrupt || b.bankrupt) return "they are not in the game";
  if (t.give.cash > a.cash || t.get.cash > b.cash) return "there is not that much cash";
  if (t.give.free > a.free.length || t.get.free > b.free.length) return "not that many jail cards";
  const check = (squares: number[], owner: Chair) =>
    squares.every((at) => {
      const d = deedOf(state, at);
      if (!d || d.by !== owner) return false;
      const s = BOARD[at];
      // Streets change hands without their buildings on the whole set.
      return s.kind !== "street" || groupSquares(s.group).every((i) => (deedOf(state, i)?.houses ?? 0) === 0);
    });
  if (!check(t.give.squares, t.from) || !check(t.get.squares, t.to)) return "sell the buildings on a set before trading any of it";
  if (!t.give.cash && !t.get.cash && !t.give.squares.length && !t.get.squares.length && !t.give.free && !t.get.free) return "the trade is empty";
  return null;
}

export function propose(state: MonopolyState, t: Trade): MonopolyState {
  if (tradeProblem(state, t)) return state;
  return { ...state, trade: t };
}

export function answerTrade(state: MonopolyState, yes: boolean, names: (c: Chair) => string): MonopolyState {
  const t = state.trade;
  if (!t) return state;
  if (!yes || tradeProblem(state, t)) return said({ ...state, trade: null }, `${names(t.to)} turns the trade down`);
  let next: MonopolyState = { ...state, trade: null };
  next = transfer(next, t.from, t.to, t.give.cash);
  next = transfer(next, t.to, t.from, t.get.cash);
  const deeds = { ...next.deeds };
  for (const at of t.give.squares) deeds[String(at)] = { ...deeds[String(at)], by: t.to };
  for (const at of t.get.squares) deeds[String(at)] = { ...deeds[String(at)], by: t.from };
  next = { ...next, deeds };
  const a = player(next, t.from);
  const b = player(next, t.to);
  next = withPlayer(next, t.from, { free: [...a.free.slice(t.give.free), ...b.free.slice(0, t.get.free)] });
  next = withPlayer(next, t.to, { free: [...b.free.slice(t.get.free), ...a.free.slice(0, t.give.free)] });
  return said(next, `${names(t.from)} and ${names(t.to)} shake on a trade`);
}

/** What a player is worth, counting streets at their price and buildings at cost. */
export function worth(state: MonopolyState, c: Chair): number {
  let total = player(state, c)?.cash ?? 0;
  for (const [at, d] of Object.entries(state.deeds)) {
    if (d.by !== c) continue;
    const s = BOARD[Number(at)];
    if (!isOwnable(s)) continue;
    total += d.mortgaged ? s.price / 2 : s.price;
    if (s.kind === "street") total += s.house * d.houses;
  }
  return Math.round(total);
}
