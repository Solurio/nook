// Uno: match the colour or the number, and be the first with an empty hand.
//
// A card is a short string: its colour, then what it is. "R5" is a red five,
// "GS" a green skip, "BR" a blue reverse, "Y+" a yellow draw two. Wilds start
// with a W and have no colour of their own: "W" is a wild, "W4" a wild draw
// four -- the colour a wild was called as lives in the table's state, not on
// the card.
//
// House rules change a lot about how the game plays, so they are a table of
// switches (UnoRules) the table picks before dealing: stacking draws, jumping
// in, the 7-0 swap, the Brazilian bar rules, a no-mercy deck, a chaos mode.
//
// Hands and the draw pile are secret piles (see lib/piles.ts). What is public
// is the discard pile, whose go it is, which way play is running, and how many
// cards each player holds.

export const COLORS = ["R", "Y", "G", "B"] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAME: Record<Color, string> = {
  R: "red",
  Y: "yellow",
  G: "green",
  B: "blue",
};

export const COLOR_HEX: Record<Color, string> = {
  R: "#d63a3a",
  Y: "#f0c419",
  G: "#2f9e57",
  B: "#2f6fd1",
};

export type Value =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "S" // skip
  | "R" // reverse
  | "+" // draw two
  | "+4" // draw four, in a colour (no mercy)
  | "SA" // skip everyone: you go again (no mercy)
  | "DA" // discard all of this colour (no mercy)
  | "W" // wild
  | "W4" // wild draw four
  | "W6" // wild draw six (no mercy)
  | "W10" // wild draw ten (no mercy)
  | "WR" // wild reverse draw four (no mercy)
  | "WC" // wild colour roulette: the next player draws until they find the colour (no mercy)
  | "WS"; // wild swap hands (chaos)

export const DRAW_PILE = "draw";
export const MIN_SEATS = 2;
export const MAX_SEATS = 10;
/** A hand this big is out of the round, when the no mercy rule is on. */
export const MERCY_LIMIT = 25;

export function handSlot(chair: string): string {
  return `hand:${chair}`;
}

// ---------------------------------------------------------------------------
// House rules
// ---------------------------------------------------------------------------

export type StackRule = "off" | "same" | "up" | "any";

export interface UnoRules {
  /** Cards dealt to each hand. */
  hand: number;
  /**
   * Draw cards piling up on each other instead of being drawn at once.
   * "same" -- a +2 on a +2, a +4 on a +4; "up" -- the same or bigger;
   * "any" -- any draw card on any other.
   */
  stack: StackRule;
  /** With a draw coming at you: a reverse sends it back, a skip passes it on. */
  reflect: boolean;
  /** Out of turn, the exact same card as the one on top may be slapped down. */
  jumpIn: boolean;
  /** A 7 swaps your hand with anyone's; a 0 passes every hand along. */
  sevenO: boolean;
  /** No drawing just one: you draw until something can be played. */
  drawUntil: boolean;
  /** Holding something you can play, you have to play. */
  forcePlay: boolean;
  /** Several of the same number go down together. */
  multiples: boolean;
  /** The wild draw four may be played whenever. */
  freeW4: boolean;
  /** A wild draw four may be challenged: bluffing costs four, a wrong challenge six. */
  challenge: boolean;
  /** You cannot go out on an action card or a wild. */
  noActionFinish: boolean;
  /** Cards drawn for being caught without calling uno. */
  unoPenalty: number;
  /** Seconds for each go; 0 for no clock. */
  timer: number;
  /** "first" -- first out takes the round; "last" -- play on until one is left holding cards. */
  end: "first" | "last";
  /** Something odd happens now and then, and swap-hand wilds join the deck. */
  chaos: boolean;
  /** The no mercy deck: +4s in colour, +6, +10, roulette, discard all; 25 cards and you are out. */
  mercy: boolean;
}

export const CLASSIC_RULES: UnoRules = {
  hand: 7,
  stack: "off",
  reflect: false,
  jumpIn: false,
  sevenO: false,
  drawUntil: false,
  forcePlay: false,
  multiples: false,
  freeW4: false,
  challenge: false,
  noActionFinish: false,
  unoPenalty: 2,
  timer: 0,
  end: "first",
  chaos: false,
  mercy: false,
};

export type PresetId = "classic" | "official" | "brazil" | "seven" | "chaos" | "mercy" | "blitz";

export const PRESETS: Array<{ id: PresetId; name: string; blurb: string; rules: UnoRules }> = [
  { id: "classic", name: "classic", blurb: "the box rules, nothing added", rules: CLASSIC_RULES },
  {
    id: "official",
    name: "by the book",
    blurb: "a wild draw four can be bluffed, and challenged",
    rules: { ...CLASSIC_RULES, challenge: true },
  },
  {
    id: "brazil",
    name: "Brazilian bar rules",
    blurb: "stack anything, reverse it back, cut in, play pairs, the +4 whenever, and nobody goes out on a special",
    rules: { ...CLASSIC_RULES, stack: "any", reflect: true, jumpIn: true, multiples: true, freeW4: true, noActionFinish: true },
  },
  {
    id: "seven",
    name: "7-0",
    blurb: "a 7 swaps hands with someone, a 0 passes every hand along",
    rules: { ...CLASSIC_RULES, sevenO: true, jumpIn: true },
  },
  {
    id: "chaos",
    name: "chaos",
    blurb: "everything on, swap wilds in the deck, and something strange every few plays",
    rules: { ...CLASSIC_RULES, stack: "any", reflect: true, jumpIn: true, sevenO: true, multiples: true, freeW4: true, chaos: true },
  },
  {
    id: "mercy",
    name: "no mercy",
    blurb: "+6, +10, colour roulette, discard all, stack anything, draw until you can play -- 25 cards and you are out",
    rules: { ...CLASSIC_RULES, stack: "any", sevenO: true, drawUntil: true, forcePlay: true, mercy: true },
  },
  {
    id: "blitz",
    name: "blitz",
    blurb: "ten seconds a go, cutting in allowed, and you play if you can",
    rules: { ...CLASSIC_RULES, timer: 10, jumpIn: true, forcePlay: true },
  },
];

/** The rules this round is being played by: the ones it was dealt with. */
export function rulesOf(state: Pick<UnoState, "rules" | "playing">): UnoRules {
  return { ...CLASSIC_RULES, ...(state.playing ?? state.rules ?? {}) };
}

/** The table's house rules, as they will be at the next deal. */
export function houseRules(state: Pick<UnoState, "rules">): UnoRules {
  return { ...CLASSIC_RULES, ...(state.rules ?? {}) };
}

/** Which preset these rules are, if they are one exactly. */
export function presetOf(rules: UnoRules): PresetId | null {
  const same = (a: UnoRules, b: UnoRules) => (Object.keys(CLASSIC_RULES) as Array<keyof UnoRules>).every((k) => a[k] === b[k]);
  return PRESETS.find((p) => same(p.rules, rules))?.id ?? null;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** The box: per colour one zero, two of each 1-9 and of each action; eight wilds. Plus whatever the rules add. */
export function fullDeck(rules: UnoRules = CLASSIC_RULES, copies = 1): string[] {
  const out: string[] = [];
  for (let n = 0; n < copies; n += 1) {
    for (const color of COLORS) {
      out.push(`${color}0`);
      for (let v = 1; v <= 9; v += 1) out.push(`${color}${v}`, `${color}${v}`);
      for (const action of ["S", "R", "+"]) out.push(`${color}${action}`, `${color}${action}`);
      if (rules.mercy) for (const action of ["+4", "SA", "DA"]) out.push(`${color}${action}`, `${color}${action}`);
    }
    for (let i = 0; i < 4; i += 1) out.push("W", "W4");
    if (rules.mercy) {
      for (let i = 0; i < 4; i += 1) out.push("W6", "WR", "WC");
      out.push("W10", "W10");
    }
    if (rules.chaos) for (let i = 0; i < 4; i += 1) out.push("WS");
  }
  return out;
}

/** One deck is enough for a small table; a crowd plays with two shuffled together. */
export function decksFor(seatCount: number, rules: UnoRules): number {
  return seatCount * rules.hand > 60 ? 2 : 1;
}

export function isWild(card: string): boolean {
  return card.startsWith("W");
}

export function parse(card: string): { color: Color | null; value: Value } {
  if (isWild(card)) return { color: null, value: card as Value };
  return { color: card[0] as Color, value: card.slice(1) as Value };
}

const NUMBERS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
export const isNumber = (card: string): boolean => NUMBERS.has(parse(card).value);

/** How many cards a card makes someone draw. */
export function drawAmount(card: string): number {
  switch (parse(card).value) {
    case "+":
      return 2;
    case "+4":
    case "W4":
    case "WR":
      return 4;
    case "W6":
      return 6;
    case "W10":
      return 10;
    default:
      return 0;
  }
}

export const isDraw = (card: string): boolean => drawAmount(card) > 0;

/** Whether a card may go on the discard pile, given its top card and the colour in play. */
export function matches(card: string, top: string | undefined, color: Color | null): boolean {
  if (isWild(card)) return true;
  if (!top) return true;
  const c = parse(card);
  if (color && c.color === color) return true;
  const t = parse(top);
  return !isWild(top) && c.value === t.value;
}

/** The draw a pending penalty is made of, for deciding what may go on it. */
export interface Pending {
  /** Cards owed, all together. */
  count: number;
  /** Who put the last one down. */
  by: string;
  /** The card that did it. */
  card: string;
  /** A wild draw four played on its own: the colour that was in play before it, for a challenge. */
  challenge?: Color | null;
  /** Colour roulette: draw until this colour turns up. */
  roulette?: Color;
}

/** Whether a draw card may go on top of a pending draw, under a stacking rule. */
export function stacks(card: string, pending: Pending, color: Color | null, rule: StackRule): boolean {
  if (rule === "off" || pending.roulette) return false;
  const mine = drawAmount(card);
  if (!mine) return false;
  const theirs = drawAmount(pending.card);
  const same = parse(card).value === parse(pending.card).value;
  // A coloured draw still has to fit the colour in play or the card under it.
  const fits = isWild(card) || matches(card, pending.card, color);
  if (rule === "same") return same && fits;
  if (rule === "up") return mine >= theirs && fits;
  return fits;
}

/**
 * The cards in a hand that may be played, everything taken into account: a
 * draw coming at you, the wild draw four's restriction, going out on a
 * special, a card drawn a moment ago.
 */
export function playable(
  hand: string[],
  top: string | undefined,
  color: Color | null,
  rules: UnoRules = CLASSIC_RULES,
  pending: Pending | null = null,
): string[] {
  if (pending?.roulette) return [];
  const holdsColor = color !== null && hand.some((c) => !isWild(c) && parse(c).color === color);
  return hand.filter((card) => {
    if (rules.noActionFinish && hand.length === 1 && !isNumber(card)) return false;
    if (pending) {
      if (stacks(card, pending, color, rules.stack)) return true;
      if (rules.reflect && rules.stack !== "off") {
        const v = parse(card).value;
        if ((v === "R" || v === "S") && matches(card, top, color)) return true;
      }
      return false;
    }
    if (card === "W4" && !rules.freeW4 && !rules.challenge) return !holdsColor;
    return matches(card, top, color);
  });
}

/** Cards that could go down together with this one: the same number, when the rule allows it. */
export function companions(hand: string[], card: string, rules: UnoRules): string[] {
  if (!rules.multiples || !isNumber(card)) return [];
  const value = parse(card).value;
  const rest = [...hand];
  rest.splice(rest.indexOf(card), 1);
  return rest.filter((c) => !isWild(c) && parse(c).value === value);
}

/** A card identical to the one on top: what lets you jump in out of turn. */
export function jumpable(hand: string[], top: string | undefined, rules: UnoRules): string[] {
  if (!rules.jumpIn || !top || isWild(top)) return [];
  if (rules.noActionFinish && hand.length === 1 && !isNumber(top)) return [];
  return hand.filter((c) => c === top);
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export interface UnoState {
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** The house rules the next deal will use. */
  rules?: UnoRules;
  /** The rules the round in progress was dealt with. */
  playing?: UnoRules;
  /** Face up, top first. */
  discard: string[];
  /** The colour in play. Null only while a round that opened on a wild waits for it. */
  color: Color | null;
  turn: string;
  direction: 1 | -1;
  round: number;
  /** Round number to the chair that went out first. */
  results: Record<string, string>;
  /** Round number to the chair left holding cards, when playing to the last one. */
  losers?: Record<string, string>;
  /** Who has called uno with this hand. */
  called: Record<string, boolean>;
  /** Down to one card without calling it: anyone may catch them until the next play. */
  exposed: string | null;
  /** Drew this turn, and may now play what they drew or pass. */
  drew: string | null;
  /** A draw on its way to whoever's turn it is, waiting for them to stack, send it back, challenge or take it. */
  pending?: Pending | null;
  /** Someone who played a 7 or a swap wild, picking whose hand they get. */
  choosing?: { chair: string; kind: "seven" | "swap" } | null;
  /** Hands on the move between chairs: each chair's hand goes to the one it points at. */
  swap?: { id: number; moves: Record<string, string> } | null;
  /** Chairs out of this round: gone out when playing to the last one, or over the mercy limit. */
  out?: string[];
  /** When the current go started, for the clock. */
  turnAt?: number;
  /** The last odd thing chaos did. */
  chaos?: string | null;
  /** The chair that dealt this round. */
  dealer: string;
  log: string[];
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
  tested?: unknown;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

/** The chair `steps` places along, the way play is running, stepping over anyone out of the round. */
export function seatAfter(chairs: string[], from: string, direction: 1 | -1, steps = 1, out: string[] = []): string {
  const n = chairs.length;
  let at = chairs.indexOf(from);
  if (at < 0) return chairs[0];
  if (out.length >= n) return from;
  let left = steps;
  let guard = 0;
  while (left > 0 && guard < n * (steps + 1)) {
    at = (((at + direction) % n) + n) % n;
    guard += 1;
    if (!out.includes(chairs[at])) left -= 1;
  }
  return chairs[at];
}

export const activeChairs = (chairs: string[], state: Pick<UnoState, "out">): string[] =>
  chairs.filter((c) => !(state.out ?? []).includes(c));

export function emptyUno(seatCount = 4): UnoState {
  return {
    seats: {},
    holders: {},
    seatCount,
    rules: CLASSIC_RULES,
    discard: [],
    color: null,
    turn: "s0",
    direction: 1,
    round: 0,
    results: {},
    losers: {},
    called: {},
    exposed: null,
    drew: null,
    pending: null,
    choosing: null,
    swap: null,
    out: [],
    dealer: "s0",
    log: [],
  };
}

/** Whether the round is finished: someone went out, or, playing to the last, one is left. */
export function roundOver(state: UnoState): boolean {
  const round = String(state.round);
  if (!state.results[round] && !state.losers?.[round]) return false;
  return rulesOf(state).end === "first" || Boolean(state.losers?.[round]);
}

const note = (log: string[], line: string) => [...log.slice(-19), line];

export interface Played {
  state: UnoState;
  /** Cards to be drawn straight away, by whoever the play hit. */
  penalty: { chair: string; count: number } | null;
}

/**
 * What happens when cards go down. `played` is one card, or several of the
 * same number, the last of them ending up on top. Returns the next public
 * state, plus who has to draw at once and how many, which the player's own
 * client carries out by moving cards from the draw pile into that hand --
 * without seeing them. A draw that can be answered (stacked, sent back,
 * challenged) is left pending instead, for its target to deal with.
 */
export function afterPlay(
  state: UnoState,
  chairs: string[],
  played: string | string[],
  chosen: Color | null,
  cardsLeft: number,
  name: (chair: string) => string,
  options: { actor?: string; now?: number } = {},
): Played {
  const rules = rulesOf(state);
  const cards = Array.isArray(played) ? played : [played];
  const card = cards[cards.length - 1];
  const me = options.actor ?? state.turn;
  const now = options.now ?? Date.now();
  const round = String(state.round);
  const { value, color: own } = parse(card);
  const facing = state.pending ?? null;

  let out = [...(state.out ?? [])];
  let direction = state.direction;
  let skip = 0;
  let again = false;
  let penalty: { chair: string; count: number } | null = null;
  let pending: Pending | null = null;
  let choosing: UnoState["choosing"] = null;
  let swap: UnoState["swap"] = null;
  let results = state.results;
  let losers = state.losers ?? {};
  const called = { ...state.called };

  const goesOut = cardsLeft === 0;
  if (goesOut) {
    if (!results[round]) results = { ...results, [round]: me };
    if (rules.end === "last") out = [...out, me];
  }
  const live = chairs.filter((c) => !out.includes(c));
  const pair = live.length <= 2;
  const next = (from: string, dir: 1 | -1, steps = 1) => seatAfter(chairs, from, dir, steps, out);

  if (facing) {
    const amount = cards.reduce((sum, c) => sum + drawAmount(c), 0);
    if (amount > 0) {
      if (value === "WR") direction = (direction * -1) as 1 | -1;
      pending = { count: facing.count + amount, by: me, card };
    } else if (value === "R") {
      // Sent back where it came from.
      if (!pair) direction = (direction * -1) as 1 | -1;
      pending = { ...facing, by: me, challenge: undefined };
    } else if (value === "S") {
      pending = { ...facing, by: me, challenge: undefined };
    }
  } else {
    if (value === "R") {
      if (pair) skip = 1;
      else direction = (direction * -1) as 1 | -1;
    }
    if (value === "S") skip = 1;
    if (value === "SA") again = true;
    if (value === "WR") direction = (direction * -1) as 1 | -1;
    const amount = cards.reduce((sum, c) => sum + drawAmount(c), 0);
    if (amount > 0) {
      const target = next(me, direction);
      const answerable = rules.stack !== "off" || (value === "W4" && rules.challenge);
      if (answerable) {
        pending = { count: amount, by: me, card, challenge: value === "W4" && rules.challenge ? state.color : undefined };
      } else {
        penalty = { chair: target, count: amount };
        skip = 1;
      }
    }
    if (value === "WC" && chosen) pending = { count: 0, by: me, card, roulette: chosen };
    if (!goesOut) {
      if (value === "WS") choosing = { chair: me, kind: "swap" };
      if (rules.sevenO && value === "7") choosing = { chair: me, kind: "seven" };
      if (rules.sevenO && value === "0" && live.length > 1) {
        const moves: Record<string, string> = {};
        for (const c of live) moves[c] = seatAfter(chairs, c, direction, 1, out);
        swap = { id: now, moves };
        for (const c of live) delete called[c];
      }
    }
  }

  // The round ends when someone goes out -- or, playing to the last, when one is left.
  let over = false;
  if (goesOut) {
    if (rules.end === "first") over = true;
    else if (live.length <= 1) {
      losers = { ...losers, [round]: live[0] ?? me };
      over = true;
    }
  }

  if (over) {
    pending = null;
    penalty = null;
    choosing = null;
    swap = null;
  }

  let turn: string;
  if (over) turn = me;
  else if (choosing) turn = me;
  else if (again) turn = me;
  else if (pending) turn = next(me, direction);
  else turn = next(me, direction, 1 + skip);

  // Going down to one without having called it leaves you open to a catch.
  const exposed = cardsLeft === 1 && !called[me] ? me : null;
  if (cardsLeft !== 1) delete called[me];

  const names = cards.map((c) => describe(c, chosen));
  const what = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  let line = `${name(me)} played ${what}`;
  if (options.actor && options.actor !== state.turn) line = `${name(me)} cut in with ${what}`;
  if (penalty) line += `, ${name(penalty.chair)} draws ${penalty.count}`;
  if (pending && !pending.roulette && pending.count > 0) line += ` -- ${name(turn)} faces ${pending.count}`;
  if (goesOut) line += over && rules.end === "last" ? `, and ${name(losers[round])} is left holding cards` : ` and is out`;

  return {
    state: {
      ...state,
      discard: [...[...cards].reverse(), ...state.discard],
      color: own ?? chosen,
      direction,
      turn,
      results,
      losers,
      called,
      exposed,
      drew: null,
      pending,
      choosing,
      swap: swap ?? state.swap ?? null,
      out,
      turnAt: now,
      log: note(state.log, line),
    },
    penalty,
  };
}

/** A 7 or a swap wild: the hand goes to `target`, theirs comes back. */
export function afterChoosing(state: UnoState, chairs: string[], target: string, name: (c: string) => string, now = Date.now()): UnoState {
  const me = state.choosing?.chair ?? state.turn;
  const out = state.out ?? [];
  const called = { ...state.called };
  delete called[me];
  delete called[target];
  return {
    ...state,
    choosing: null,
    swap: target === me ? state.swap ?? null : { id: now, moves: { [me]: target, [target]: me } },
    called,
    exposed: null,
    turn: seatAfter(chairs, me, state.direction, 1, out),
    turnAt: now,
    log: note(state.log, target === me ? `${name(me)} kept their own hand` : `${name(me)} swaps hands with ${name(target)}`),
  };
}

/** Taking a pending draw: the cards go in your hand and your go is gone. */
export function afterTaking(state: UnoState, chairs: string[], name: (c: string) => string, now = Date.now()): UnoState {
  const me = state.turn;
  const count = state.pending?.count ?? 0;
  return {
    ...state,
    pending: null,
    drew: null,
    exposed: null,
    turn: seatAfter(chairs, me, state.direction, 1, state.out ?? []),
    turnAt: now,
    log: note(state.log, `${name(me)} draws ${count}`),
  };
}

/**
 * A challenged wild draw four. Caught bluffing, the one who played it draws
 * the four and the challenger plays on as if nothing had come; an honest four
 * costs the challenger six and their go.
 */
export function afterChallenge(
  state: UnoState,
  chairs: string[],
  guilty: boolean,
  name: (c: string) => string,
  now = Date.now(),
): { state: UnoState; penalty: { chair: string; count: number } } {
  const me = state.turn;
  const by = state.pending?.by ?? me;
  const count = state.pending?.count ?? 4;
  if (guilty) {
    return {
      state: { ...state, pending: null, turnAt: now, log: note(state.log, `${name(me)} challenged -- ${name(by)} was bluffing and draws ${count}`) },
      penalty: { chair: by, count },
    };
  }
  return {
    state: {
      ...state,
      pending: null,
      exposed: null,
      turn: seatAfter(chairs, me, state.direction, 1, state.out ?? []),
      turnAt: now,
      log: note(state.log, `${name(me)} challenged and was wrong -- draws ${count + 2}`),
    },
    penalty: { chair: me, count: count + 2 },
  };
}

/** Every card of a colour that could be in a hand, for a challenge to look for. */
export function cardsOfColor(color: Color, rules: UnoRules): string[] {
  const values = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "R", "+", ...(rules.mercy ? ["+4", "SA", "DA"] : [])];
  return values.map((v) => `${color}${v}`);
}

/** After drawing: the turn moves on unless the drawn card is played. */
export function afterDraw(state: UnoState): UnoState {
  return { ...state, drew: state.turn };
}

/** Keeping what you drew, or having nothing to play after drawing. */
export function afterPass(state: UnoState, chairs: string[], name: (c: string) => string, now = Date.now()): UnoState {
  return {
    ...state,
    turn: seatAfter(chairs, state.turn, state.direction, 1, state.out ?? []),
    drew: null,
    exposed: null,
    turnAt: now,
    log: note(state.log, `${name(state.turn)} passed`),
  };
}

/** Colour roulette done: the colour came up, and the go is over. */
export function afterRoulette(state: UnoState, chairs: string[], drawn: number, name: (c: string) => string, now = Date.now()): UnoState {
  const me = state.turn;
  return {
    ...state,
    pending: null,
    exposed: null,
    turn: seatAfter(chairs, me, state.direction, 1, state.out ?? []),
    turnAt: now,
    log: note(state.log, `${name(me)} drew ${drawn} before the ${COLOR_NAME[state.pending?.roulette ?? "R"]} came up`),
  };
}

/** Over the mercy limit: out of the round. If that leaves one, they take it. */
export function afterMercy(state: UnoState, chairs: string[], chair: string, name: (c: string) => string, now = Date.now()): UnoState {
  if ((state.out ?? []).includes(chair)) return state;
  const out = [...(state.out ?? []), chair];
  const live = chairs.filter((c) => !out.includes(c));
  const round = String(state.round);
  const turn = state.turn === chair ? seatAfter(chairs, chair, state.direction, 1, out) : state.turn;
  let results = state.results;
  if (live.length === 1 && !results[round]) results = { ...results, [round]: live[0] };
  return {
    ...state,
    out,
    turn,
    results,
    pending: state.turn === chair ? null : state.pending,
    turnAt: now,
    log: note(state.log, `${name(chair)} hit ${MERCY_LIMIT} cards and is out of the round`),
  };
}

// ---------------------------------------------------------------------------
// Chaos
// ---------------------------------------------------------------------------

export type ChaosKind = "rain" | "carousel" | "storm" | "uturn" | "gift" | "robin";

export const CHAOS_TEXT: Record<ChaosKind, string> = {
  rain: "chaos: everyone else draws one",
  carousel: "chaos: every hand moves one seat along",
  storm: "chaos: the colour changes by itself",
  uturn: "chaos: play turns round",
  gift: "chaos: the next player draws two",
  robin: "chaos: the biggest hand and the smallest swap",
};

/**
 * Now and then, after a play, something happens that nobody asked for. `roll`
 * is a number in [0, 1): below the chance, an event, picked by the rest of it.
 */
export function chaosAfter(
  state: UnoState,
  chairs: string[],
  actor: string,
  roll: number,
  sizes: Record<string, number>,
  now = Date.now(),
): { state: UnoState; draws: Array<{ chair: string; count: number }> } | null {
  const CHANCE = 0.28;
  if (roll >= CHANCE || roundOver(state) || state.choosing || state.pending || state.swap) return null;
  const kinds: ChaosKind[] = ["rain", "carousel", "storm", "uturn", "gift", "robin"];
  const kind = kinds[Math.min(kinds.length - 1, Math.floor((roll / CHANCE) * kinds.length))];
  const out = state.out ?? [];
  const live = chairs.filter((c) => !out.includes(c));
  const draws: Array<{ chair: string; count: number }> = [];
  let next: UnoState = { ...state, chaos: kind, turnAt: now };

  switch (kind) {
    case "rain":
      for (const c of live) if (c !== actor) draws.push({ chair: c, count: 1 });
      break;
    case "carousel": {
      if (live.length < 2) return null;
      const moves: Record<string, string> = {};
      for (const c of live) moves[c] = seatAfter(chairs, c, state.direction, 1, out);
      next = { ...next, swap: { id: now, moves }, called: {} };
      break;
    }
    case "storm": {
      const others = COLORS.filter((c) => c !== state.color);
      next = { ...next, color: others[Math.floor(((roll * 997) % 1) * others.length)] ?? "R" };
      break;
    }
    case "uturn": {
      if (live.length <= 2) return null;
      const direction = (state.direction * -1) as 1 | -1;
      next = { ...next, direction, turn: seatAfter(chairs, actor, direction, 1, out) };
      break;
    }
    case "gift":
      if (state.turn === actor) return null;
      draws.push({ chair: state.turn, count: 2 });
      break;
    case "robin": {
      if (live.length < 2) return null;
      const sorted = [...live].sort((a, b) => (sizes[a] ?? 0) - (sizes[b] ?? 0));
      const small = sorted[0];
      const big = sorted[sorted.length - 1];
      if ((sizes[small] ?? 0) === (sizes[big] ?? 0)) return null;
      next = { ...next, swap: { id: now, moves: { [small]: big, [big]: small } }, called: {} };
      break;
    }
  }
  return { state: { ...next, log: note(next.log, CHAOS_TEXT[kind]) }, draws };
}

// ---------------------------------------------------------------------------
// Opening a round
// ---------------------------------------------------------------------------

/**
 * The card turned up to start a round, and what it does to whoever goes
 * first. Anything that makes someone draw, or asks for a choice, cannot start
 * a round; the caller puts it back and turns another.
 */
export function openWith(
  state: UnoState,
  chairs: string[],
  card: string,
  now = Date.now(),
): { state: UnoState; penalty: { chair: string; count: number } | null } | "again" {
  const { value, color } = parse(card);
  if (isWild(card) && card !== "W") return "again";
  if (value === "+4" || value === "SA" || value === "DA") return "again";
  const first = seatAfter(chairs, state.dealer, 1, 1);
  let turn = first;
  let direction: 1 | -1 = 1;
  let penalty: { chair: string; count: number } | null = null;

  if (value === "S") turn = seatAfter(chairs, first, 1, 1);
  if (value === "R") {
    if (chairs.length === 2) {
      turn = seatAfter(chairs, first, 1, 1);
    } else {
      direction = -1;
      turn = state.dealer;
    }
  }
  if (value === "+") {
    penalty = { chair: first, count: 2 };
    turn = seatAfter(chairs, first, 1, 1);
  }

  return {
    state: {
      ...state,
      discard: [card],
      color,
      turn,
      direction,
      drew: null,
      exposed: null,
      pending: null,
      choosing: null,
      turnAt: now,
      log: note(state.log, `the round opens on ${describe(card, null)}`),
    },
    penalty,
  };
}

const VALUE_NAME: Record<string, string> = {
  S: "skip",
  R: "reverse",
  "+": "draw two",
  "+4": "draw four",
  SA: "skip everyone",
  DA: "discard all",
};

const WILD_NAME: Record<string, string> = {
  W: "a wild",
  W4: "a wild draw four",
  W6: "a wild draw six",
  W10: "a wild draw ten",
  WR: "a wild reverse draw four",
  WC: "a colour roulette",
  WS: "a swap-hands wild",
};

export function describe(card: string, chosen: Color | null): string {
  const { color, value } = parse(card);
  if (isWild(card)) {
    const base = WILD_NAME[value] ?? "a wild";
    return chosen ? `${base}, calling ${COLOR_NAME[chosen]}` : base;
  }
  const colorName = color ? COLOR_NAME[color] : "";
  return `a ${colorName} ${VALUE_NAME[value] ?? value}`;
}

/**
 * The discard pile, less its top card, goes back under as a new draw pile
 * when the old one runs out. Wilds go back as plain wilds.
 */
export function reshuffle(state: UnoState): { state: UnoState; back: string[] } {
  const [top, ...rest] = state.discard;
  return { state: { ...state, discard: top ? [top] : [] }, back: rest };
}

/** Round wins per chair. */
export function tally(results: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const seat of Object.values(results)) out[seat] = (out[seat] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------
// Hands changing places
// ---------------------------------------------------------------------------

/**
 * A hand on its way to another chair waits in a pile nobody owns, named for
 * where it is going. Each hand's owner sends theirs off, then takes in what
 * was sent to them -- in that order, so the two never mix.
 */
export const transitSlot = (id: number, to: string) => `swap:${id}:${to}`;

type Meta = Record<string, { owner: string | null; size: number }>;

/** What this device, owning some hands, has to do next for a swap in progress. */
export function swapWork(
  swap: UnoState["swap"],
  meta: Meta | undefined,
  mine: (chair: string) => boolean,
): Array<{ kind: "send"; chair: string; to: string } | { kind: "take"; chair: string }> {
  if (!swap || !meta) return [];
  const work: Array<{ kind: "send"; chair: string; to: string } | { kind: "take"; chair: string }> = [];
  for (const [chair, to] of Object.entries(swap.moves)) {
    if (!mine(chair)) continue;
    const sent = transitSlot(swap.id, to) in meta;
    if (!sent) {
      work.push({ kind: "send", chair, to });
      continue;
    }
    const incoming = meta[transitSlot(swap.id, chair)];
    if (incoming && incoming.size > 0) work.push({ kind: "take", chair });
  }
  return work;
}

/** Whether every hand has arrived where it was going. */
export function swapDone(swap: UnoState["swap"], meta: Meta | undefined): boolean {
  if (!swap) return true;
  if (!meta) return false;
  return Object.values(swap.moves).every((to) => {
    const slot = meta[transitSlot(swap.id, to)];
    return slot !== undefined && slot.size === 0;
  });
}
