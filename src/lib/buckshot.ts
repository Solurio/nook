// Buckshot Roulette, for a table. A shotgun is loaded with live shells and
// blanks -- how many of each is announced, the order is not -- and players
// take turns pointing it at someone, themselves included. A blank at your own
// head keeps the turn; anything else passes it on. Whoever runs out of charges
// is out, and the last one standing takes the round.
//
// The shells are a secret pile nobody can read: the database shuffles them
// and hands them out one at a time as they are fired. A magnifying glass or a
// burner phone peeks at one privately (the table is told that you looked, not
// what you saw). Everything else is on the table: charges, items, whose turn.
//
// Items, as in the game:
//   glass       -- see the shell in the chamber.
//   beer        -- rack the shotgun: the shell in the chamber is ejected, shown.
//   cigarettes  -- one charge back, up to the most you started with.
//   saw         -- the next shot does two damage.
//   cuffs       -- someone skips their next turn.
//   phone       -- learn one of the later shells, at random.
//   inverter    -- a live shell becomes a blank and a blank live.
//   medicine    -- even odds: two charges back, or lose one.
//   adrenaline  -- take someone's item and use it at once.

import { randomBelow, type Random } from "./dice";

export type Shell = "live" | "blank";
export type Gear =
  | "glass"
  | "beer"
  | "cigarettes"
  | "saw"
  | "cuffs"
  | "phone"
  | "inverter"
  | "medicine"
  | "adrenaline";

export const GEAR: Gear[] = ["glass", "beer", "cigarettes", "saw", "cuffs", "phone", "inverter", "medicine", "adrenaline"];

export const GEAR_NAME: Record<Gear, string> = {
  glass: "magnifying glass",
  beer: "beer",
  cigarettes: "cigarettes",
  saw: "hand saw",
  cuffs: "handcuffs",
  phone: "burner phone",
  inverter: "inverter",
  medicine: "expired medicine",
  adrenaline: "adrenaline",
};

export const GEAR_DOES: Record<Gear, string> = {
  glass: "see the shell in the chamber",
  beer: "rack it: the shell in the chamber comes out, face up",
  cigarettes: "one charge back",
  saw: "the next shot does two",
  cuffs: "someone skips their next turn",
  phone: "learn one of the shells after this one",
  inverter: "a live shell becomes a blank, and a blank live",
  medicine: "even odds: two charges back, or one lost",
  adrenaline: "take someone's item and use it at once",
};

export const CHAMBER = "chamber";
export const MIN_SEATS = 2;
export const MAX_SEATS = 4;
export const MAX_GEAR = 8;
export const MIN_SHELLS = 2;
export const MAX_SHELLS = 8;

export const shellKey = (load: number, n: number) => `shell:${load}:${n}`;

export interface Player {
  charges: number;
  gear: Gear[];
}

export interface Spent {
  /** What it did, after any inverter. */
  shell: Shell;
  /** What was loaded: the count of what is left goes by this. */
  raw: Shell;
  how: "shot" | "beer";
  by: string;
  at?: string;
}

export interface Firing {
  n: number;
  by: string;
  target: string;
  how: "shot" | "beer";
}

export interface BuckshotState {
  version: 1;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** Charges everyone starts a round with. */
  charges: number;
  /** Items handed to each player at every load. */
  gearPerLoad: number;
  players: Record<string, Player>;
  turn: string;
  phase: "idle" | "play" | "over";
  winner?: string;
  wins: Record<string, number>;
  round: number;
  /** Which loading of the shotgun this is, in the whole game. */
  load: number;
  /** What went in, as announced. */
  loaded: { live: number; blank: number } | null;
  /** Shells out of the gun this load, in order. */
  spent: Spent[];
  saw: boolean;
  inverted: boolean;
  /** Chairs that skip their next turn. */
  cuffed: string[];
  /** A shell on its way out, waiting for the database to say what it was. */
  firing: Firing | null;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
  peeked?: Array<{ slot: string; index: number; by: string; at: number }>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyBuckshot(seatCount = 2): BuckshotState {
  return {
    version: 1,
    seats: {},
    holders: {},
    seatCount,
    charges: 4,
    gearPerLoad: 2,
    players: {},
    turn: "s0",
    phase: "idle",
    wins: {},
    round: 0,
    load: 0,
    loaded: null,
    spent: [],
    saw: false,
    inverted: false,
    cuffed: [],
    firing: null,
    log: [],
  };
}

const note = (log: string[], line: string) => [...log.slice(-24), line];

export const alive = (state: BuckshotState) =>
  Object.keys(state.players)
    .filter((c) => state.players[c].charges > 0)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

export const left = (state: BuckshotState) =>
  state.loaded ? state.loaded.live + state.loaded.blank - state.spent.length : 0;

/** Live and blank still in the gun, as far as the table can count. */
export function remaining(state: BuckshotState): { live: number; blank: number } {
  if (!state.loaded) return { live: 0, blank: 0 };
  const out = { ...state.loaded };
  for (const s of state.spent) out[s.raw ?? s.shell] -= 1;
  return out;
}

export const flip = (shell: Shell): Shell => (shell === "live" ? "blank" : "live");

/**
 * The next load: two to eight shells, never all of one kind, and a handful of
 * items for everyone still in. Returns the shells for the database to shuffle.
 */
export function newLoad(state: BuckshotState, random: Random = randomBelow): { state: BuckshotState; shells: Shell[] } {
  const total = MIN_SHELLS + random(MAX_SHELLS - MIN_SHELLS + 1);
  const live = 1 + random(total - 1);
  const shells: Shell[] = [...Array<Shell>(live).fill("live"), ...Array<Shell>(total - live).fill("blank")];
  const players = { ...state.players };
  for (const chair of alive(state)) {
    const gear = [...players[chair].gear];
    for (let i = 0; i < state.gearPerLoad && gear.length < MAX_GEAR; i += 1) gear.push(GEAR[random(GEAR.length)]);
    players[chair] = { ...players[chair], gear };
  }
  return {
    state: {
      ...state,
      players,
      load: state.load + 1,
      loaded: { live, blank: total - live },
      spent: [],
      saw: false,
      inverted: false,
      firing: null,
      log: note(state.log, `loaded: ${live} live, ${total - live} blank`),
    },
    shells,
  };
}

/** A new round: everyone full of charges, empty-handed, the gun about to be loaded. */
export function startRound(state: BuckshotState, chairs: string[], random: Random = randomBelow) {
  const players: Record<string, Player> = {};
  for (const chair of chairs) players[chair] = { charges: state.charges, gear: [] };
  const fresh: BuckshotState = {
    ...state,
    players,
    turn: chairs[state.round % chairs.length],
    phase: "play",
    winner: undefined,
    round: state.round + 1,
    cuffed: [],
    log: [`round ${state.round + 1}`],
  };
  return newLoad(fresh, random);
}

/** Next in line who is still in, skipping (and freeing) anyone in cuffs. */
export function nextTurn(state: BuckshotState, name: (c: string) => string = (c) => c): BuckshotState {
  const ring = Object.keys(state.players).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  let cuffed = [...state.cuffed];
  let at = ring.indexOf(state.turn);
  const log = [...state.log];
  for (let step = 0; step < ring.length * 2; step += 1) {
    at = (at + 1) % ring.length;
    const chair = ring[at];
    if (state.players[chair].charges <= 0) continue;
    if (cuffed.includes(chair)) {
      cuffed = cuffed.filter((c) => c !== chair);
      log.push(`${name(chair)} is in cuffs and sits this one out`);
      continue;
    }
    return { ...state, turn: chair, cuffed, log: log.slice(-25) };
  }
  return { ...state, cuffed };
}

/** Pointing the gun. The shell is revealed by the database, then `landed` says what it did. */
export function aim(state: BuckshotState, by: string, target: string): BuckshotState {
  return { ...state, firing: { n: state.spent.length, by, target, how: "shot" } };
}

/**
 * The shell is out and everyone can see it. `raw` is what the database turned
 * over; the inverter, if used, decides what it actually was.
 */
export function landed(state: BuckshotState, raw: Shell, name: (c: string) => string): BuckshotState {
  const firing = state.firing;
  if (!firing) return state;
  const shell = state.inverted ? flip(raw) : raw;
  const spent: Spent[] = [
    ...state.spent,
    { shell, raw, how: firing.how, by: firing.by, ...(firing.how === "shot" ? { at: firing.target } : {}) },
  ];
  let next: BuckshotState = { ...state, spent, firing: null, inverted: false };

  if (firing.how === "beer") {
    return { ...next, log: note(next.log, `${name(firing.by)} racked out a ${shell}`) };
  }

  const damage = shell === "live" ? (state.saw ? 2 : 1) : 0;
  const hit = { ...next.players[firing.target] };
  hit.charges = Math.max(0, hit.charges - damage);
  next = {
    ...next,
    saw: false,
    players: { ...next.players, [firing.target]: hit },
    log: note(
      next.log,
      shell === "live"
        ? `${name(firing.by)} shot ${firing.target === firing.by ? "themselves" : name(firing.target)}: live${damage > 1 ? ", sawn off" : ""}`
        : `${name(firing.by)} shot ${firing.target === firing.by ? "themselves" : name(firing.target)}: blank`,
    ),
  };

  const standing = alive(next);
  if (standing.length <= 1) {
    const winner = standing[0] ?? firing.by;
    return { ...next, phase: "over", winner, wins: { ...next.wins, [winner]: (next.wins[winner] ?? 0) + 1 } };
  }
  // A blank at your own head keeps the turn. Anything else passes it on.
  if (firing.target === firing.by && shell === "blank") return next;
  return nextTurn(next, name);
}

/** The gun is empty and needs loading before anyone can do anything else. */
export const needsLoad = (state: BuckshotState) => state.phase === "play" && !state.firing && left(state) <= 0;

/** What using an item does to the public state. Peeks and racking also need the database. */
export function applyGear(
  state: BuckshotState,
  by: string,
  gear: Gear,
  name: (c: string) => string,
  options: { target?: string; random?: Random; stolenFrom?: string } = {},
): { state: BuckshotState; peek?: number; rack?: boolean } | null {
  const random = options.random ?? randomBelow;
  const owner = options.stolenFrom ?? by;
  const held = state.players[owner]?.gear ?? [];
  const index = held.indexOf(gear);
  if (index < 0) return null;
  const players = { ...state.players, [owner]: { ...state.players[owner], gear: held.filter((_, i) => i !== index) } };
  const me = { ...players[by] };
  const stolen = options.stolenFrom ? ` (taken from ${name(options.stolenFrom)})` : "";
  let next: BuckshotState = { ...state, players };
  const say = (line: string) => note(next.log, `${name(by)} ${line}${stolen}`);

  switch (gear) {
    case "cigarettes":
      me.charges = Math.min(state.charges, me.charges + 1);
      next = { ...next, players: { ...next.players, [by]: me }, log: say("smoked a cigarette") };
      return { state: next };
    case "saw":
      if (state.saw) return null;
      return { state: { ...next, saw: true, log: say("sawed the barrel off") } };
    case "cuffs": {
      const target = options.target;
      if (!target || target === by || state.cuffed.length > 0 || (state.players[target]?.charges ?? 0) <= 0) return null;
      return { state: { ...next, cuffed: [target], log: say(`cuffed ${name(target)}`) } };
    }
    case "inverter":
      return { state: { ...next, inverted: !state.inverted, log: say("used the inverter") } };
    case "medicine": {
      const good = random(2) === 0;
      me.charges = good ? Math.min(state.charges, me.charges + 2) : Math.max(0, me.charges - 1);
      next = {
        ...next,
        players: { ...next.players, [by]: me },
        log: say(good ? "took the medicine, and it worked" : "took the medicine, and it did not agree with them"),
      };
      const standing = alive(next);
      if (standing.length <= 1) {
        const winner = standing[0] ?? by;
        return { state: { ...next, phase: "over", winner, wins: { ...next.wins, [winner]: (next.wins[winner] ?? 0) + 1 } } };
      }
      return { state: me.charges <= 0 ? nextTurn(next, name) : next };
    }
    case "glass":
      return { state: { ...next, log: say("looked down the barrel") }, peek: 0 };
    case "phone": {
      const rest = left(state);
      if (rest < 2) return { state: { ...next, log: say("made a call, and nobody answered") } };
      return { state: { ...next, log: say("made a call") }, peek: 1 + random(rest - 1) };
    }
    case "beer":
      return { state: { ...next, firing: { n: state.spent.length, by, target: by, how: "beer" }, log: say("cracked a beer") }, rack: true };
    case "adrenaline":
      // Adrenaline is spent choosing what to steal; see `steal`.
      return null;
  }
}

/** Adrenaline: spend it, then use one of someone else's items as if it were yours. */
export function steal(
  state: BuckshotState,
  by: string,
  from: string,
  gear: Gear,
  name: (c: string) => string,
  options: { target?: string; random?: Random } = {},
): { state: BuckshotState; peek?: number; rack?: boolean } | null {
  if (gear === "adrenaline" || from === by) return null;
  const held = state.players[by]?.gear ?? [];
  const at = held.indexOf("adrenaline");
  if (at < 0) return null;
  const spent: BuckshotState = {
    ...state,
    players: { ...state.players, [by]: { ...state.players[by], gear: held.filter((_, i) => i !== at) } },
  };
  return applyGear(spent, by, gear, name, { ...options, stolenFrom: from });
}

/** The chance the next shell is live, as the table can work it out -- before anyone's private peeks. */
export function oddsLive(state: BuckshotState): number {
  const { live, blank } = remaining(state);
  if (live + blank === 0) return 0;
  const p = live / (live + blank);
  return state.inverted ? 1 - p : p;
}
