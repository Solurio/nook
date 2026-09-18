// Coup. Everyone holds two cards face down and may claim to be anything; the
// only thing keeping them honest is that a challenge costs somebody a card.
//
// The cards themselves are secret piles (see lib/piles.ts): each hand is read
// by its owner alone, the court deck by nobody. So the table cannot settle a
// challenge by looking -- the person challenged answers it, by showing the
// card (which the database refuses unless they really hold it) or by giving a
// card up. What is public is coins, lost cards, whose go it is, and where the
// turn has got to. This module is that part: pure, and a state machine in
// which every phase says whose move it is.
//
// Variants are rules switched on or off rather than separate games:
//
//   inquisitor  -- the Inquisitor replaces the Ambassador: exchange one card
//                  rather than two, or examine somebody else's.
//   reformation -- allegiances. Players are Loyalist or Reformist and may not
//                  coup, assassinate, steal from, or block the foreign aid of
//                  their own side, unless everyone is on one side. Changing
//                  side costs coins, which go to the Treasury Reserve, and a
//                  player may embezzle the lot by claiming NOT to be the Duke.
//   guess       -- to eliminate someone you must name the card they hold. A
//                  wrong guess spends the action for nothing.
//   duel        -- the two-player table: the player going first starts with
//                  one coin, and guessing is on.

export type Card = "duke" | "assassin" | "captain" | "ambassador" | "contessa" | "inquisitor";

export type ActionKind =
  | "income"
  | "foreign_aid"
  | "coup"
  | "tax"
  | "assassinate"
  | "steal"
  | "exchange"
  | "examine"
  | "convert"
  | "embezzle";

export type Allegiance = "loyalist" | "reformist";

export interface CoupRules {
  mode: "standard" | "duel";
  inquisitor: boolean;
  reformation: boolean;
  guess: boolean;
}

export type Preset = "standard" | "duel" | "expanded";

export const PRESETS: Record<Preset, CoupRules> = {
  standard: { mode: "standard", inquisitor: false, reformation: false, guess: false },
  duel: { mode: "duel", inquisitor: false, reformation: false, guess: true },
  expanded: { mode: "standard", inquisitor: true, reformation: true, guess: false },
};

export const PRESET_NAME: Record<Preset, string> = {
  standard: "standard",
  duel: "two players",
  expanded: "expanded",
};

/** Copies of each character in the base box, which covers up to six players. */
export const COPIES = 3;
export const MIN_SEATS = 2;
export const MAX_SEATS = 12;
export const COUP_COST = 7;
export const ASSASSIN_COST = 3;
/** At ten coins your only move is to knock someone out. */
export const FORCED_COUP = 10;
export const CONVERT_SELF = 1;
export const CONVERT_OTHER = 2;

export const COURT = "court";
export const handSlot = (chair: string) => `hand:${chair}`;
export const shownSlot = (chair: string) => `shown:${chair}`;

/** The five characters in play. */
export function characters(rules: CoupRules): Card[] {
  return ["duke", "assassin", "captain", rules.inquisitor ? "inquisitor" : "ambassador", "contessa"];
}

/**
 * How many of each character to deal in. Three copies each -- fifteen cards --
 * carries the box up to six players; beyond that a table of ten would be
 * holding almost the whole deck between them and nothing would be left to draw
 * from, so a copy of everyone is added for every two extra chairs.
 */
export function copiesFor(players: number): number {
  if (players <= 6) return 3;
  if (players <= 8) return 4;
  if (players <= 10) return 5;
  return 6;
}

/** Total cards in play for a table of this size. */
export function deckSize(players: number): number {
  return copiesFor(players) * 5;
}

export function deckFor(rules: CoupRules, players: number): Card[] {
  const out: Card[] = [];
  for (const card of characters(rules)) {
    for (let i = 0; i < copiesFor(players); i += 1) out.push(card);
  }
  return out;
}

/** The character an action claims to be. Null for the ones anyone may take. */
export function claimOf(kind: ActionKind, rules: CoupRules): Card | null {
  switch (kind) {
    case "tax":
      return "duke";
    case "assassinate":
      return "assassin";
    case "steal":
      return "captain";
    case "exchange":
      return rules.inquisitor ? "inquisitor" : "ambassador";
    case "examine":
      return "inquisitor";
    default:
      return null;
  }
}

/** Embezzling claims the opposite: that you do not hold the Duke. */
export function challengeable(kind: ActionKind, rules: CoupRules): boolean {
  return kind === "embezzle" || claimOf(kind, rules) !== null;
}

/** Who may block what, and with which card. */
export function blockersOf(kind: ActionKind, rules: CoupRules): Card[] {
  switch (kind) {
    case "foreign_aid":
      return ["duke"];
    case "assassinate":
      return ["contessa"];
    case "steal":
      return ["captain", rules.inquisitor ? "inquisitor" : "ambassador"];
    default:
      return [];
  }
}

export function needsTarget(kind: ActionKind): boolean {
  return kind === "coup" || kind === "assassinate" || kind === "steal" || kind === "examine";
}

export interface Player {
  coins: number;
  /** Turned face up when lost; with no cards left in hand, you are out. */
  lost: Card[];
  allegiance?: Allegiance;
}

export interface Action {
  kind: ActionKind;
  by: string;
  target?: string;
}

/** What happens once a card has been given up. */
export type Then = { kind: "next" } | { kind: "resolve"; action: Action };

export type Phase =
  | { kind: "idle" }
  /** Whoever's turn it is picks something. */
  | { kind: "act" }
  /** An action is on the table; others may challenge it or block it. */
  | { kind: "respond"; action: Action; passed: string[] }
  /** Challenged: the claimant shows the card, or gives one up. */
  | {
      kind: "prove";
      claimant: string;
      card: Card | "not-duke";
      challenger: string;
      stage: "action" | "block";
      action: Action;
    }
  /** A block is on the table; others may challenge the blocker. */
  | { kind: "blocked"; action: Action; blocker: string; card: Card; passed: string[] }
  /** Somebody gives a card up -- their choice, unless a guess named it. */
  | { kind: "lose"; who: string; forced?: Card; then: Then }
  /** Eliminating with guessing on: the attacker names a card. */
  | { kind: "guess"; action: Action }
  /**
   * Draws this many from the court, then sends that many back, whichever they
   * choose. Pending until the cards are actually drawn: only the device that
   * owns the hand can draw into it, and it may not be the one that got here.
   */
  | { kind: "exchange"; who: string; drawn: number; pending: boolean }
  /** The inquisitor asked; the target picks a card to show them. */
  | { kind: "examine"; who: string; target: string }
  /** The inquisitor has looked, and decides. */
  | { kind: "judge"; who: string; target: string }
  /** The inquisitor made the target trade the card they showed. */
  | { kind: "swap"; who: string }
  | { kind: "over"; winner: string };

export interface CoupState {
  version: 2;
  rules: CoupRules;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  players: Record<string, Player>;
  treasury: number;
  turn: string;
  phase: Phase;
  log: string[];
  round: number;
  wins: Record<string, number>;
  piles?: import("./piles").PileMeta;
  revealed?: Record<string, unknown[]>;
  tested?: Array<{ slot: string; card: unknown; found: boolean; by: string; at: number }>;
}

export function chairsFor(count: number): string[] {
  return Array.from({ length: Math.max(MIN_SEATS, Math.min(MAX_SEATS, count)) }, (_, i) => `s${i}`);
}

export function emptyCoup(seatCount = 4, preset: Preset = "standard"): CoupState {
  return {
    version: 2,
    rules: { ...PRESETS[preset] },
    seats: {},
    holders: {},
    seatCount: preset === "duel" ? 2 : seatCount,
    players: {},
    treasury: 0,
    turn: "s0",
    phase: { kind: "idle" },
    log: [],
    round: 0,
    wins: {},
  };
}

/** Who is still in: anyone with a card left in hand. */
export function aliveFrom(chairs: string[], sizes: Record<string, { size: number } | undefined> | undefined): string[] {
  return chairs.filter((chair) => (sizes?.[handSlot(chair)]?.size ?? 0) > 0);
}

const note = (log: string[], line: string) => [...log.slice(-24), line];

/**
 * Starts a round: two coins each (one for whoever goes first at a table of
 * two), allegiances alternating round the table when the Reformation is on.
 * The cards are dealt by the database, not here.
 */
export function startRound(state: CoupState, chairs: string[], first: string): CoupState {
  const players: Record<string, Player> = {};
  chairs.forEach((chair, i) => {
    players[chair] = {
      coins: state.rules.mode === "duel" && chair === first ? 1 : 2,
      lost: [],
      ...(state.rules.reformation ? { allegiance: (i % 2 === 0 ? "loyalist" : "reformist") as Allegiance } : {}),
    };
  });
  return {
    ...state,
    players,
    treasury: 0,
    turn: first,
    phase: { kind: "act" },
    round: state.round + 1,
    log: [`round ${state.round + 1}`],
  };
}

/** With the Reformation on, whether two players are barred from targeting each other. */
export function sameSide(state: CoupState, a: string, b: string, alive: string[]): boolean {
  if (!state.rules.reformation) return false;
  const sides = new Set(alive.map((c) => state.players[c]?.allegiance));
  if (sides.size <= 1) return false; // everyone on one side: anything goes
  return state.players[a]?.allegiance === state.players[b]?.allegiance;
}

/** Who an action may be aimed at. */
export function targetsFor(state: CoupState, kind: ActionKind, by: string, alive: string[]): string[] {
  return alive.filter((chair) => {
    if (chair === by) return false;
    if ((kind === "coup" || kind === "assassinate" || kind === "steal") && sameSide(state, by, chair, alive)) return false;
    if (kind === "steal" && (state.players[chair]?.coins ?? 0) === 0) return false;
    return true;
  });
}

/** Everything this player may declare right now. */
export function legalActions(state: CoupState, by: string, alive: string[]): ActionKind[] {
  const me = state.players[by];
  if (!me || !alive.includes(by)) return [];
  const aimable = (kind: ActionKind) => targetsFor(state, kind, by, alive).length > 0;

  // Ten coins and the only thing on the table is a coup.
  if (me.coins >= FORCED_COUP) return aimable("coup") ? ["coup"] : ["income"];

  const out: ActionKind[] = ["income", "foreign_aid", "tax", "exchange"];
  if (me.coins >= COUP_COST && aimable("coup")) out.push("coup");
  if (me.coins >= ASSASSIN_COST && aimable("assassinate")) out.push("assassinate");
  if (aimable("steal")) out.push("steal");
  if (state.rules.inquisitor && aimable("examine")) out.push("examine");
  if (state.rules.reformation) {
    if (me.coins >= CONVERT_SELF) out.push("convert");
    if (state.treasury > 0) out.push("embezzle");
  }
  return out;
}

/** Who may block an action, and with which cards. */
export function blockers(state: CoupState, action: Action, alive: string[]): { chairs: string[]; cards: Card[] } {
  const cards = blockersOf(action.kind, state.rules);
  if (cards.length === 0) return { chairs: [], cards };
  if (action.kind === "foreign_aid") {
    // Foreign aid is everyone's business -- except, with the Reformation on,
    // the aid of a player on your own side.
    return {
      chairs: alive.filter((c) => c !== action.by && !sameSide(state, c, action.by, alive)),
      cards,
    };
  }
  return { chairs: action.target && alive.includes(action.target) ? [action.target] : [], cards };
}

/**
 * Declaring an action: costs are paid up front, and whatever cannot be
 * challenged or blocked simply happens.
 */
export function declare(
  state: CoupState,
  action: Action,
  alive: string[],
  name: (c: string) => string,
  convertTarget?: string,
): { state: CoupState; draw?: { who: string; count: number } } {
  const players = { ...state.players };
  const me = { ...players[action.by] };
  let treasury = state.treasury;

  if (action.kind === "coup") me.coins -= COUP_COST;
  if (action.kind === "assassinate") me.coins -= ASSASSIN_COST;
  if (action.kind === "convert") {
    const other = convertTarget && convertTarget !== action.by;
    const cost = other ? CONVERT_OTHER : CONVERT_SELF;
    me.coins -= cost;
    treasury += cost;
    const who = other ? convertTarget : action.by;
    players[action.by] = me;
    const switched = { ...players[who] };
    switched.allegiance = switched.allegiance === "loyalist" ? "reformist" : "loyalist";
    players[who] = switched;
    return {
      state: advance(
        {
          ...state,
          players,
          treasury,
          log: note(state.log, `${name(action.by)} turned ${other ? name(who) : "themselves"} ${switched.allegiance}`),
        },
        alive,
      ),
    };
  }
  players[action.by] = me;
  const paid = { ...state, players, treasury };

  const claim = claimOf(action.kind, state.rules);
  const line = `${name(action.by)}: ${ACTION_LABEL[action.kind]}${action.target ? ` on ${name(action.target)}` : ""}${
    claim ? ` · claiming the ${claim}` : action.kind === "embezzle" ? " · claiming no duke" : ""
  }`;

  if (!challengeable(action.kind, state.rules) && blockers(paid, action, alive).chairs.length === 0) {
    return resolve({ ...paid, log: note(paid.log, line) }, action, alive, name);
  }
  return { state: { ...paid, phase: { kind: "respond", action, passed: [] }, log: note(paid.log, line) } };
}

/**
 * What an action does once nobody has stopped it. Some of it is here; the
 * rest is the database's -- drawing cards for an exchange -- which the
 * returned `draw` asks for.
 */
export function resolve(
  state: CoupState,
  action: Action,
  alive: string[],
  name: (c: string) => string,
): { state: CoupState; draw?: { who: string; count: number } } {
  const players = { ...state.players };
  const by = { ...players[action.by] };

  switch (action.kind) {
    case "income":
      by.coins += 1;
      break;
    case "foreign_aid":
      by.coins += 2;
      break;
    case "tax":
      by.coins += 3;
      break;
    case "embezzle":
      by.coins += state.treasury;
      players[action.by] = by;
      return {
        state: advance(
          { ...state, players, treasury: 0, log: note(state.log, `${name(action.by)} took the treasury`) },
          alive,
        ),
      };
    case "steal": {
      if (!action.target || !alive.includes(action.target)) break;
      const target = { ...players[action.target] };
      const taken = Math.min(2, target.coins);
      target.coins -= taken;
      by.coins += taken;
      players[action.target] = target;
      players[action.by] = by;
      return {
        state: advance(
          { ...state, players, log: note(state.log, `${name(action.by)} took ${taken} from ${name(action.target)}`) },
          alive,
        ),
      };
    }
    case "coup":
    case "assassinate": {
      if (!action.target || !alive.includes(action.target)) return { state: advance(state, alive) };
      players[action.by] = by;
      if (state.rules.guess) {
        return { state: { ...state, players, phase: { kind: "guess", action } } };
      }
      return { state: { ...state, players, phase: { kind: "lose", who: action.target, then: { kind: "next" } } } };
    }
    case "exchange": {
      players[action.by] = by;
      const count = state.rules.inquisitor ? 1 : 2;
      return {
        state: {
          ...state,
          players,
          phase: { kind: "exchange", who: action.by, drawn: count, pending: true },
          log: note(state.log, `${name(action.by)} draws ${count} from the court`),
        },
        draw: { who: action.by, count },
      };
    }
    case "examine": {
      players[action.by] = by;
      if (!action.target) return { state: advance(state, alive) };
      return { state: { ...state, players, phase: { kind: "examine", who: action.by, target: action.target } } };
    }
    default:
      break;
  }

  players[action.by] = by;
  return { state: advance({ ...state, players }, alive) };
}

/** Moves to the next player still in, or ends the game. */
export function advance(state: CoupState, alive: string[], chairs?: string[]): CoupState {
  if (alive.length <= 1) {
    const winner = alive[0] ?? state.turn;
    return {
      ...state,
      phase: { kind: "over", winner },
      wins: { ...state.wins, [winner]: (state.wins[winner] ?? 0) + 1 },
    };
  }
  // The current chair stays in the ring even if it has just been knocked out,
  // so the turn moves on from where it was rather than from the start.
  const order =
    chairs ??
    [...new Set([...alive, state.turn])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const ring = order.filter((c) => alive.includes(c) || c === state.turn);
  const at = ring.indexOf(state.turn);
  for (let step = 1; step <= ring.length; step += 1) {
    const next = ring[(at + step) % ring.length];
    if (alive.includes(next)) return { ...state, turn: next, phase: { kind: "act" } };
  }
  return state;
}

/** Somebody passes on challenging or blocking. When everyone has, it goes through. */
export function pass(
  state: CoupState,
  who: string,
  alive: string[],
  name: (c: string) => string,
): { state: CoupState; draw?: { who: string; count: number } } {
  const phase = state.phase;
  if (phase.kind === "respond") {
    const passed = [...new Set([...phase.passed, who])];
    const waiting = alive.filter((c) => c !== phase.action.by);
    if (waiting.every((c) => passed.includes(c))) return resolve(state, phase.action, alive, name);
    return { state: { ...state, phase: { ...phase, passed } } };
  }
  if (phase.kind === "blocked") {
    const passed = [...new Set([...phase.passed, who])];
    const waiting = alive.filter((c) => c !== phase.blocker);
    if (waiting.every((c) => passed.includes(c))) {
      return { state: advance({ ...state, log: note(state.log, `the block holds`) }, alive) };
    }
    return { state: { ...state, phase: { ...phase, passed } } };
  }
  return { state };
}

export function block(state: CoupState, blocker: string, card: Card, name: (c: string) => string): CoupState {
  if (state.phase.kind !== "respond") return state;
  return {
    ...state,
    phase: { kind: "blocked", action: state.phase.action, blocker, card, passed: [] },
    log: note(state.log, `${name(blocker)} blocks with the ${card}`),
  };
}

export function challenge(state: CoupState, challenger: string, name: (c: string) => string): CoupState {
  const phase = state.phase;
  if (phase.kind === "respond") {
    const claim = claimOf(phase.action.kind, state.rules);
    return {
      ...state,
      phase: {
        kind: "prove",
        claimant: phase.action.by,
        card: phase.action.kind === "embezzle" ? "not-duke" : (claim as Card),
        challenger,
        stage: "action",
        action: phase.action,
      },
      log: note(state.log, `${name(challenger)} challenges ${name(phase.action.by)}`),
    };
  }
  if (phase.kind === "blocked") {
    return {
      ...state,
      phase: { kind: "prove", claimant: phase.blocker, card: phase.card, challenger, stage: "block", action: phase.action },
      log: note(state.log, `${name(challenger)} challenges the block`),
    };
  }
  return state;
}

/**
 * The challenge is settled. `honest` says whether the claimant was telling the
 * truth -- shown by producing the card, or for an embezzlement by the
 * database confirming there is no Duke in their hand. Whoever was wrong gives
 * a card up; what happens after depends on what was being challenged.
 */
export function settleChallenge(state: CoupState, honest: boolean, name: (c: string) => string): CoupState {
  const phase = state.phase;
  if (phase.kind !== "prove") return state;
  const { claimant, challenger, stage, action } = phase;

  if (honest) {
    return {
      ...state,
      phase: {
        kind: "lose",
        who: challenger,
        // The claim stands: an action goes ahead, a block holds.
        then: stage === "action" ? { kind: "resolve", action } : { kind: "next" },
      },
      log: note(state.log, `${name(claimant)} was telling the truth; ${name(challenger)} pays`),
    };
  }
  return {
    ...state,
    phase: {
      kind: "lose",
      who: claimant,
      // Caught out: an action dies with the lie, a block falls and the action goes ahead.
      then: stage === "action" ? { kind: "next" } : { kind: "resolve", action },
    },
    log: note(state.log, `${name(claimant)} was bluffing`),
  };
}

/**
 * A card has been given up. `handLeft` is how many the loser still holds,
 * which the pile sizes say and this module cannot see.
 */
export function afterLoss(
  state: CoupState,
  who: string,
  card: Card,
  alive: string[],
  name: (c: string) => string,
): { state: CoupState; draw?: { who: string; count: number } } {
  if (state.phase.kind !== "lose") return { state };
  const then = state.phase.then;
  const players = { ...state.players, [who]: { ...state.players[who], lost: [...state.players[who].lost, card] } };
  const next = { ...state, players, log: note(state.log, `${name(who)} lost the ${card}`) };

  if (then.kind === "resolve") {
    // The target may have been knocked out already.
    if (then.action.target && !alive.includes(then.action.target) && then.action.kind !== "exchange") {
      return { state: advance(next, alive) };
    }
    return resolve(next, then.action, alive, name);
  }
  return { state: advance(next, alive) };
}

/** A guess at the target's card, answered by the database. */
export function afterGuess(
  state: CoupState,
  guessed: Card,
  hit: boolean,
  alive: string[],
  name: (c: string) => string,
): CoupState {
  if (state.phase.kind !== "guess") return state;
  const target = state.phase.action.target as string;
  if (hit) {
    return {
      ...state,
      phase: { kind: "lose", who: target, forced: guessed, then: { kind: "next" } },
      log: note(state.log, `${name(state.phase.action.by)} named the ${guessed}, and was right`),
    };
  }
  return advance(
    { ...state, log: note(state.log, `${name(state.phase.action.by)} named the ${guessed}, and missed`) },
    alive,
  );
}

export const ACTION_LABEL: Record<ActionKind, string> = {
  income: "income",
  foreign_aid: "foreign aid",
  coup: `coup (${COUP_COST})`,
  tax: "tax",
  assassinate: `assassinate (${ASSASSIN_COST})`,
  steal: "steal",
  exchange: "exchange",
  examine: "examine",
  convert: "convert",
  embezzle: "embezzle",
};
