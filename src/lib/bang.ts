// BANG! The Dice Game. Five dice instead of a deck: arrows, dynamite, two
// kinds of bull's eye, beer and the Gatling gun. You roll all five, keep what
// you like and roll the rest again, twice at most; then every die you are left
// with does its thing. Life is counted in bullets, the Sheriff starts with two
// extra, and nine arrows sit in the middle of the table -- take the last one
// and the Indians attack everyone.
//
// What is secret is the roles. The Sheriff shows his; everyone else's is a
// pile only its owner can read, with a sealed copy nobody can read but anyone
// can turn over -- so a role comes out the moment its player dies, whether or
// not their phone is still there. The dice are public: everybody watches them
// land.

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

export type Face = "arrow" | "dynamite" | "one" | "two" | "beer" | "gatling";

export const FACES: Face[] = ["arrow", "dynamite", "one", "two", "beer", "gatling"];
export const DICE = 5;
export const ARROWS = 9;

export const FACE_NAME: Record<Face, string> = {
  arrow: "Indian arrow",
  dynamite: "Dynamite",
  one: "Bull's eye 1",
  two: "Bull's eye 2",
  beer: "Beer",
  gatling: "Gatling",
};

export const FACE_TEXT: Record<Face, string> = {
  arrow: "take an arrow, straight away. Take the last one and the Indians attack.",
  dynamite: "can't be rolled again. Three of them and your turn ends, with a life lost.",
  one: "shoot the player next to you, left or right.",
  two: "shoot a player exactly two places away. With three or fewer left, it is a 1.",
  beer: "any player gets a life back, yourself included.",
  gatling: "three of them: everyone else loses a life, and you drop your arrows.",
};

// ---------------------------------------------------------------------------
// Roles and characters
// ---------------------------------------------------------------------------

export type Role = "sheriff" | "deputy" | "outlaw" | "renegade";

export const ROLE_NAME: Record<Role, string> = { sheriff: "Sheriff", deputy: "Deputy", outlaw: "Outlaw", renegade: "Renegade" };
export const ROLE_GOAL: Record<Role, string> = {
  sheriff: "eliminate every Outlaw and Renegade.",
  deputy: "protect the Sheriff: eliminate every Outlaw and Renegade.",
  outlaw: "eliminate the Sheriff.",
  renegade: "be the last one standing.",
};

/** In a game of three, everyone knows everyone's role, and each has one target. */
export const THREE_TARGET: Partial<Record<Role, Role>> = { deputy: "renegade", renegade: "outlaw", outlaw: "deputy" };

export const MIN_SEATS = 3;
export const MAX_SEATS = 8;

export function rolesFor(players: number): Role[] {
  const n = Math.max(MIN_SEATS, Math.min(MAX_SEATS, players));
  if (n === 3) return ["deputy", "outlaw", "renegade"];
  const out: Role[] = ["sheriff", "renegade", "outlaw", "outlaw"];
  if (n >= 5) out.push("deputy");
  if (n >= 6) out.push("outlaw");
  if (n >= 7) out.push("deputy");
  if (n >= 8) out.push("renegade");
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
  bart: { name: "Bart Cassidy", life: 8, text: "may take an arrow instead of losing a life (not to Indians or Dynamite, and never the last arrow)." },
  blackjack: { name: "Black Jack", life: 8, text: "may roll Dynamite again (not once there are three)." },
  calamity: { name: "Calamity Janet", life: 8, text: "can use a 1 as a 2, and a 2 as a 1." },
  gringo: { name: "El Gringo", life: 7, text: "whoever makes him lose life takes an arrow (not for Indians or Dynamite)." },
  jesse: { name: "Jesse Jones", life: 9, text: "with four lives or fewer, a Beer on himself gives two." },
  jourdonnais: { name: "Jourdonnais", life: 7, text: "never loses more than one life to the Indians." },
  kit: { name: "Kit Carlson", life: 7, text: "for each Gatling rolled, may take an arrow off any player." },
  lucky: { name: "Lucky Duke", life: 8, text: "may roll once more: four rolls in all." },
  paul: { name: "Paul Regret", life: 9, text: "never loses life to the Gatling gun." },
  pedro: { name: "Pedro Ramirez", life: 8, text: "each time he loses a life, he may drop one of his arrows." },
  rose: { name: "Rose Doolan", life: 9, text: "shoots one place further: a 1 reaches two away, a 2 reaches three." },
  sid: { name: "Sid Ketchum", life: 8, text: "at the start of his turn, any player he chooses gets a life back." },
  slab: { name: "Slab the Killer", life: 8, text: "once a turn, can spend a Beer to make a 1 or a 2 take two lives." },
  suzy: { name: "Suzy Lafayette", life: 8, text: "gets two lives back if she ends her turn without a 1 or a 2." },
  vulture: { name: "Vulture Sam", life: 9, text: "gets two lives back whenever another player is eliminated." },
  willy: { name: "Willy the Kid", life: 8, text: "only needs two Gatlings to fire the Gatling gun." },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as Character[];

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const ROLES_PILE = "roles";
export const SEALED_PILE = "roles-sealed";
export const roleSlot = (chair: string) => `role:${chair}`;
/** A copy of the role nobody can read and anybody can turn over, for when its player dies. */
export const sealedSlot = (chair: string) => `sealed:${chair}`;

export interface Player {
  character: Character;
  life: number;
  max: number;
  arrows: number;
  /** Public once they are the Sheriff, dead, or in a game of three. */
  role?: Role;
  dead?: boolean;
  /** Who finished them off, if a player did. */
  killedBy?: string | null;
  /** Bart Cassidy: take arrows rather than wounds, when he can. */
  bartArrows?: boolean;
}

export interface Roll {
  /** Counts every roll in the game, so every screen animates each one once. */
  n: number;
  /** Which dice were thrown this time. */
  thrown: number[];
}

export interface BangState {
  version: 2;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  phase: "idle" | "play" | "over";
  players: Record<string, Player>;
  order: string[];
  turn: string;
  /** Arrows left in the middle. */
  arrows: number;
  dice: Face[];
  /** Rolls made this turn: the first, then the re-rolls. */
  rolls: number;
  roll: Roll | null;
  /** Where the turn is: Sid's gift, rolling, or choosing who the dice hit. */
  step: "sid" | "roll" | "resolve";
  /** Three dynamite: the rolling is over. */
  exploded: boolean;
  /** Roles of the dead waiting to be turned over. */
  unmask: string[];
  /** The turn is done, and only waiting on those roles to pass on. */
  waiting?: boolean;
  /** A game of three: roles face up, each after one target. */
  three: boolean;
  /** In a game of three, once a target falls to the wrong hand it is last one standing. */
  freeForAll?: boolean;
  winner?: string;
  wins: Record<string, number>;
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
    version: 2,
    seats: {},
    holders: {},
    seatCount,
    phase: "idle",
    players: {},
    order: [],
    turn: "s0",
    arrows: ARROWS,
    dice: [],
    rolls: 0,
    roll: null,
    step: "roll",
    exploded: false,
    unmask: [],
    three: false,
    wins: {},
    log: [],
    round: 0,
  };
}

type Random = (max: number) => number;
type Name = (c: string) => string;

const note = (log: string[], line: string) => [...log.slice(-30), line];

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const alive = (state: BangState) => state.order.filter((c) => state.players[c] && !state.players[c].dead);
const is = (state: BangState, chair: string, character: Character) => state.players[chair]?.character === character;

function beginTurn(state: BangState, chair: string, name: Name): BangState {
  return {
    ...state,
    turn: chair,
    dice: [],
    rolls: 0,
    exploded: false,
    step: is(state, chair, "sid") ? "sid" : "roll",
    log: note(state.log, `${name(chair)}'s turn`),
  };
}

/**
 * A new game. At four or more the Sheriff is picked in the open -- everyone is
 * about to know anyway -- and the other roles are dealt by the database, which
 * nobody sees. At three the roles are dealt face up.
 */
export function startGame(
  state: BangState,
  chairs: string[],
  random: Random,
  name: Name = (c) => c,
): { state: BangState; sheriff: string | null; hidden: Role[] } {
  const three = chairs.length === 3;
  const characters = shuffle(CHARACTER_IDS, random).slice(0, chairs.length);
  const faceUp = three ? shuffle(rolesFor(3), random) : [];
  const sheriff = three ? null : chairs[random(chairs.length)];
  const players: Record<string, Player> = {};
  chairs.forEach((chair, i) => {
    const character = characters[i];
    const role: Role | undefined = three ? faceUp[i] : chair === sheriff ? "sheriff" : undefined;
    const max = CHARACTERS[character].life + (role === "sheriff" ? 2 : 0);
    players[chair] = {
      character,
      life: max,
      max,
      arrows: 0,
      ...(role ? { role } : {}),
      ...(character === "bart" ? { bartArrows: true } : {}),
    };
  });
  // At three the Deputy goes first; otherwise the Sheriff does.
  const first = three ? chairs[faceUp.indexOf("deputy")] : (sheriff as string);
  const next: BangState = {
    ...state,
    phase: "play",
    players,
    order: chairs,
    turn: first,
    arrows: ARROWS,
    dice: [],
    rolls: 0,
    roll: state.roll,
    step: "roll",
    exploded: false,
    unmask: [],
    three,
    freeForAll: false,
    winner: undefined,
    round: state.round + 1,
    log: [three ? "three players: every role is face up" : `${name(first)} wears the star`],
  };
  return {
    state: beginTurn(next, first, name),
    sheriff,
    hidden: three ? [] : rolesFor(chairs.length).filter((r) => r !== "sheriff"),
  };
}

/** Rolls allowed this turn, the first included. */
export const maxRolls = (state: BangState) => (is(state, state.turn, "lucky") ? 4 : 3);

export const count = (dice: Face[], face: Face) => dice.filter((d) => d === face).length;

/** Whether a die can be thrown again. */
export function canReroll(state: BangState, i: number): boolean {
  if (state.step !== "roll" || state.exploded || state.rolls === 0 || state.rolls >= maxRolls(state)) return false;
  if (state.dice[i] === "dynamite") return is(state, state.turn, "blackjack") && count(state.dice, "dynamite") < 3;
  return true;
}

// ---------------------------------------------------------------------------
// Wounds, arrows and the Indians
// ---------------------------------------------------------------------------

type Cause = "shot" | "gatling" | "indians" | "dynamite";

/**
 * Someone loses `amount` lives. Characters bend this: Bart may take arrows
 * instead, El Gringo hands whoever hurt him an arrow, Pedro drops an arrow
 * for every life lost.
 */
export function wound(state: BangState, who: string, amount: number, by: string | null, cause: Cause, name: Name): BangState {
  let next = state;
  let p = next.players[who];
  if (!p || p.dead || amount <= 0) return next;

  let lost = amount;
  // Bart Cassidy turns wounds into arrows while there is more than one arrow left.
  if (p.character === "bart" && p.bartArrows && (cause === "shot" || cause === "gatling")) {
    while (lost > 0 && next.arrows > 1) {
      next = { ...next, arrows: next.arrows - 1, players: { ...next.players, [who]: { ...next.players[who], arrows: next.players[who].arrows + 1 } } };
      lost -= 1;
    }
    if (lost < amount) next = { ...next, log: note(next.log, `${name(who)} takes ${amount - lost === 1 ? "an arrow" : `${amount - lost} arrows`} instead`) };
  }
  if (lost <= 0) return next;

  p = next.players[who];
  const life = Math.max(0, p.life - lost);
  // Pedro Ramirez drops an arrow for every life lost.
  const arrowsBack = p.character === "pedro" ? Math.min(p.arrows, lost) : 0;
  next = {
    ...next,
    arrows: next.arrows + arrowsBack,
    players: { ...next.players, [who]: { ...p, life, arrows: p.arrows - arrowsBack } },
    log: note(next.log, `${name(who)} loses ${lost === 1 ? "a life" : `${lost} lives`}`),
  };

  // El Gringo: whoever hurt him takes an arrow -- which can set the Indians off.
  if (p.character === "gringo" && by && by !== who && (cause === "shot" || cause === "gatling") && !next.players[by]?.dead) {
    next = takeArrows(next, by, 1, name);
  }

  if (life <= 0) next = eliminate(next, who, by, name);
  return next;
}

/** Out of the game: arrows back in the middle, and Vulture Sam feeds. */
function eliminate(state: BangState, who: string, by: string | null, name: Name): BangState {
  const p = state.players[who];
  if (p.dead) return state;
  const players = { ...state.players, [who]: { ...p, dead: true, life: 0, arrows: 0, killedBy: by } };
  for (const c of state.order) {
    const other = players[c];
    if (c !== who && !other.dead && other.character === "vulture") players[c] = { ...other, life: Math.min(other.max, other.life + 2) };
  }
  const next: BangState = {
    ...state,
    arrows: state.arrows + p.arrows,
    players,
    // The role has to be turned over -- unless everyone already knows it.
    unmask: p.role ? state.unmask : [...state.unmask, who],
    log: note(state.log, `${name(who)} is out`),
  };
  return checkFreeForAll(next);
}

/** Taking arrows from the middle, one at a time; the last one brings the Indians. */
export function takeArrows(state: BangState, who: string, n: number, name: Name): BangState {
  let next = state;
  for (let i = 0; i < n; i += 1) {
    if (next.players[who]?.dead) break;
    next = { ...next, arrows: next.arrows - 1, players: { ...next.players, [who]: { ...next.players[who], arrows: next.players[who].arrows + 1 } } };
    if (next.arrows <= 0) next = indians(next, name);
  }
  return next;
}

/** The Indians attack: a life for every arrow held, then all the arrows go back. */
export function indians(state: BangState, name: Name): BangState {
  const hits = state.order.map((c) => [c, state.players[c].arrows] as const);
  // Everyone gives their arrows back first, so a wound can't hand out new ones.
  let next: BangState = {
    ...state,
    arrows: ARROWS,
    players: Object.fromEntries(Object.entries(state.players).map(([c, p]) => [c, { ...p, arrows: 0 }])),
    log: note(state.log, "the Indians attack!"),
  };
  for (const [c, arrows] of hits) {
    if (arrows <= 0 || next.players[c].dead) continue;
    const damage = next.players[c].character === "jourdonnais" ? 1 : arrows;
    next = wound(next, c, damage, null, "indians", name);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/**
 * Throws the chosen dice -- all five on the first roll. Arrows are dealt with
 * as they land; three dynamite and the rolling is over.
 */
export function roll(state: BangState, which: number[], random: Random, name: Name): BangState {
  if (state.phase !== "play" || state.step !== "roll") return state;
  const first = state.rolls === 0;
  const thrown = first ? [0, 1, 2, 3, 4] : [...new Set(which)].filter((i) => canReroll(state, i));
  if (!first && thrown.length === 0) return state;
  const dice = first ? Array<Face>(DICE).fill("beer") : [...state.dice];
  for (const i of thrown) dice[i] = FACES[random(FACES.length)];
  const n = (state.roll?.n ?? 0) + 1;
  let next: BangState = { ...state, dice, rolls: state.rolls + 1, roll: { n, thrown } };

  const arrows = thrown.filter((i) => dice[i] === "arrow").length;
  if (arrows) {
    next = { ...next, log: note(next.log, `${name(state.turn)} rolls ${arrows === 1 ? "an arrow" : `${arrows} arrows`}`) };
    next = takeArrows(next, state.turn, arrows, name);
  }

  if (count(dice, "dynamite") >= 3) next = { ...next, exploded: true, step: "resolve", log: note(next.log, "three dynamite -- it goes off!") };
  else if (next.rolls >= maxRolls(next)) next = { ...next, step: "resolve" };

  // Killed by the Indians on your own roll: the turn is over.
  if (next.players[state.turn]?.dead) return settle(next, name);
  return over(next) ?? next;
}

/** The game ends the moment someone has won, whoever's turn it is. */
function over(state: BangState): BangState | null {
  if (state.unmask.length) return null;
  const verdict = winnerOf(state);
  if (!verdict) return null;
  return {
    ...state,
    phase: "over",
    waiting: false,
    winner: verdict,
    wins: { ...state.wins, [verdict]: (state.wins[verdict] ?? 0) + 1 },
    log: note(state.log, "the game is over"),
  };
}

/** Done rolling; on to deciding who the dice hit. */
export const stopRolling = (state: BangState): BangState => (state.rolls > 0 && state.step === "roll" ? { ...state, step: "resolve" } : state);

// ---------------------------------------------------------------------------
// Resolving the dice
// ---------------------------------------------------------------------------

/** Seats from one player to another, round the table the short way, the dead left out. */
export function seatsBetween(state: BangState, from: string, to: string): number {
  const ring = alive(state);
  const a = ring.indexOf(from);
  const b = ring.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 0;
  const around = Math.abs(a - b);
  return Math.min(around, ring.length - around);
}

/** Who a bull's eye can hit, for whoever rolled it. */
export function targetsFor(state: BangState, shooter: string, face: "one" | "two"): string[] {
  const ring = alive(state).filter((c) => c !== shooter);
  const few = alive(state).length <= 3;
  const allowed = new Set<number>();
  allowed.add(face === "two" && !few ? 2 : 1);
  // Calamity Janet uses either as the other.
  if (is(state, shooter, "calamity")) allowed.add(face === "one" && !few ? 2 : 1);
  // Rose Doolan reaches one place further.
  if (is(state, shooter, "rose")) for (const d of [...allowed]) allowed.add(d + 1);
  return ring.filter((c) => allowed.has(seatsBetween(state, shooter, c)));
}

export const gatlingNeeds = (state: BangState) => (is(state, state.turn, "willy") ? 2 : 3);

/** The choices a turn's dice call for. */
export interface Plan {
  /** Die index to target, for every 1 and 2. */
  shots: Record<number, string>;
  /** Die index to target, for every beer. */
  beers: Record<number, string>;
  /** Slab the Killer: the beer die spent, and the shot die it doubles. */
  slab?: { beer: number; shot: number } | null;
  /** Kit Carlson: whose arrow each Gatling takes away. */
  kit?: string[];
}

/** Sid Ketchum gives someone a life, then rolls. */
export function sidGives(state: BangState, to: string, name: Name): BangState {
  if (state.step !== "sid") return state;
  const p = state.players[to];
  if (!p || p.dead) return state;
  return {
    ...state,
    step: "roll",
    players: { ...state.players, [to]: { ...p, life: Math.min(p.max, p.life + 1) } },
    log: note(state.log, `${name(state.turn)} gives ${to === state.turn ? "himself" : name(to)} a life`),
  };
}

/** Dice that still need someone chosen before they can be settled. */
export function unchosen(state: BangState, plan: Plan): number[] {
  const out: number[] = [];
  state.dice.forEach((face, i) => {
    if ((face === "one" || face === "two") && targetsFor(state, state.turn, face).length && !plan.shots[i]) out.push(i);
    if (face === "beer" && !(plan.slab && plan.slab.beer === i) && !plan.beers[i]) out.push(i);
  });
  return out;
}

/**
 * Every die does its thing, in the rulebook's order: dynamite, then the bull's
 * eyes all at once, then the beer, then the Gatling. Then the turn passes.
 */
export function resolve(state: BangState, plan: Plan, name: Name): BangState {
  if (state.phase !== "play" || state.step !== "resolve" || state.waiting) return state;
  const me = state.turn;
  const dice = state.dice;
  let next: BangState = state;

  if (state.exploded) next = wound(next, me, 1, null, "dynamite", name);

  // Bull's eyes, all together.
  const hits: Record<string, number> = {};
  const slab = plan.slab && is(state, me, "slab") && dice[plan.slab.beer] === "beer" ? plan.slab : null;
  dice.forEach((face, i) => {
    if (face !== "one" && face !== "two") return;
    const target = plan.shots[i];
    if (!target || !targetsFor(state, me, face).includes(target)) return;
    hits[target] = (hits[target] ?? 0) + (slab && slab.shot === i ? 2 : 1);
  });
  for (const [target, amount] of Object.entries(hits)) {
    if (next.players[me]?.dead) break;
    next = { ...next, log: note(next.log, `${name(me)} shoots ${name(target)}`) };
    next = wound(next, target, amount, me, "shot", name);
  }

  // Beer.
  dice.forEach((face, i) => {
    if (face !== "beer" || (slab && slab.beer === i)) return;
    const to = plan.beers[i];
    const p = to ? next.players[to] : null;
    if (!to || !p || p.dead) return;
    const gain = to === me && p.character === "jesse" && p.life <= 4 ? 2 : 1;
    next = { ...next, players: { ...next.players, [to]: { ...p, life: Math.min(p.max, p.life + gain) } } };
  });

  // The Gatling gun.
  const gatlings = count(dice, "gatling");
  if (gatlings >= gatlingNeeds(state) && !next.players[me]?.dead) {
    const mine = next.players[me].arrows;
    next = {
      ...next,
      arrows: next.arrows + mine,
      players: { ...next.players, [me]: { ...next.players[me], arrows: 0 } },
      log: note(next.log, `${name(me)} fires the Gatling`),
    };
    for (const c of alive(next)) {
      if (c === me || next.players[c].character === "paul") continue;
      next = wound(next, c, 1, me, "gatling", name);
    }
  }
  // Kit Carlson: an arrow away for every Gatling rolled.
  if (is(state, me, "kit")) {
    for (const from of (plan.kit ?? []).slice(0, gatlings)) {
      const p = next.players[from];
      if (!p || p.arrows <= 0) continue;
      next = { ...next, arrows: next.arrows + 1, players: { ...next.players, [from]: { ...p, arrows: p.arrows - 1 } } };
    }
  }

  // Suzy Lafayette: no bull's eyes at all and she gets two lives.
  if (is(state, me, "suzy") && count(dice, "one") + count(dice, "two") === 0 && !next.players[me]?.dead) {
    const p = next.players[me];
    next = { ...next, players: { ...next.players, [me]: { ...p, life: Math.min(p.max, p.life + 2) } } };
  }

  return settle(next, name);
}

/** After the dice: is anyone the winner? If not, the next player's turn. */
export function settle(state: BangState, name: Name): BangState {
  // Roles still to be turned over: wait for them before deciding anything.
  if (state.unmask.length) return { ...state, step: "resolve", waiting: true };
  const done = over(state);
  if (done) return done;
  const ring = state.order;
  const at = ring.indexOf(state.turn);
  for (let step = 1; step <= ring.length; step += 1) {
    const c = ring[(at + step) % ring.length];
    if (!state.players[c]?.dead) return beginTurn({ ...state, waiting: false }, c, name);
  }
  return state;
}

/** The dead's roles have been turned over; carry on. */
export function unmasked(state: BangState, roles: Record<string, Role>, name: Name): BangState {
  const players = { ...state.players };
  for (const [c, role] of Object.entries(roles)) players[c] = { ...players[c], role };
  const lines = Object.entries(roles).map(([c, r]) => `${name(c)} was ${r === "outlaw" ? "an" : "the"} ${ROLE_NAME[r]}`);
  const next: BangState = { ...state, players, unmask: state.unmask.filter((c) => !roles[c]), log: lines.reduce(note, state.log) };
  if (next.unmask.length) return next;
  // A turn that was over only waiting for these moves on; one still going
  // carries on -- unless somebody has just won.
  if (next.waiting) return settle(next, name);
  return over(next) ?? next;
}

/**
 * Who has won, if anyone. With the Sheriff down, a Renegade wins only as the
 * last one alive; otherwise the Outlaws do -- even if they are all dead. With
 * every Outlaw and Renegade down, the law wins.
 */
export function winnerOf(state: BangState): string | null {
  if (state.three) return winnerOfThree(state);
  if (state.unmask.length) return null;
  const roles = rolesFor(state.order.length);
  const deadRoles = state.order.filter((c) => state.players[c]?.dead).map((c) => state.players[c].role);
  const n = (r: Role, list: Array<Role | undefined>) => list.filter((x) => x === r).length;
  if (deadRoles.includes("sheriff")) {
    const standing = alive(state);
    // Whatever roles are not among the dead are the ones still standing.
    const left = [...roles];
    for (const r of deadRoles) {
      const at = left.indexOf(r as Role);
      if (at >= 0) left.splice(at, 1);
    }
    return standing.length === 1 && left.length === 1 && left[0] === "renegade" ? "renegade" : "outlaws";
  }
  if (n("outlaw", deadRoles) === n("outlaw", roles) && n("renegade", deadRoles) === n("renegade", roles)) return "sheriff";
  return null;
}

/** Three players: you win by taking out your own target yourself; otherwise it is last one standing. */
function winnerOfThree(state: BangState): string | null {
  const standing = alive(state);
  if (standing.length === 1) return standing[0];
  if (standing.length === 0) return state.turn;
  if (state.freeForAll) return null;
  for (const c of state.order) {
    const p = state.players[c];
    if (!p.dead || !p.killedBy) continue;
    const killer = state.players[p.killedBy];
    if (killer?.role && THREE_TARGET[killer.role] === p.role) return p.killedBy;
  }
  return null;
}

/** In a game of three, a target taken by the wrong hand turns it into last one standing. */
function checkFreeForAll(state: BangState): BangState {
  if (!state.three || state.freeForAll) return state;
  const wrongHand = state.order.some((c) => {
    const p = state.players[c];
    if (!p.dead) return false;
    const killer = p.killedBy ? state.players[p.killedBy] : null;
    return !killer?.role || THREE_TARGET[killer.role] !== p.role;
  });
  return wrongHand ? { ...state, freeForAll: true } : state;
}

/** How the winner is announced. */
export function winnerText(state: BangState, name: Name): string {
  const w = state.winner;
  if (!w) return "";
  if (w === "sheriff") return "the Sheriff and the Deputies win";
  if (w === "outlaws") return "the Outlaws win";
  if (w === "renegade") return "the Renegade wins";
  return `${name(w)} wins`;
}
