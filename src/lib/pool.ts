// Pool, played properly.
//
// The table is a nine-footer in centimetres: 254 by 127, balls 5.7 across.
// Everything below works in those units and in seconds, so the numbers that
// matter -- how far a ball rolls, how a cushion answers, what a screw shot
// does -- are the ones a real table has.
//
// A ball on cloth is not a point that slows down. It slides at first, the
// cloth dragging at the bottom of it until the ball is rolling instead, which
// is why a stun shot stops dead and a follow carries on. So each ball carries
// its spin as well as its speed, and the two argue with each other through the
// contact patch until they agree. Side spin lives on afterwards and shows up
// off a cushion and in the throw it puts on the next ball.
//
// The whole thing is worked out the same way on every screen: a shot is an
// angle, a weight and where the tip struck, and running it twice gives the
// same table twice. Nobody has to send positions while the balls are moving.

export const TABLE = { w: 254, h: 127 };
/** Ball radius. */
export const R = 2.85;

const G = 981;
/** Cloth, while a ball is still sliding across it. */
const SLIDE = 0.2;
/** Cloth, once it is rolling. */
const ROLL = 0.012;
/** How fast spin about the upright axis dies away. */
const SPIN_DRAG = 0.022;
/** How much a cushion gives back. */
const CUSHION = 0.86;
/** How much two balls give back. */
const BOUNCE = 0.95;
/** Friction between two balls, which is what throws a cut shot off line. */
const THROW = 0.06;
/** Slower than this, and it has stopped. */
const STILL = 1.2;

export interface Ball {
  /** 0 is the cue ball; 1 to 15 are the object balls. */
  n: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Spin: wx and wy roll it along, wz is side. */
  wx: number;
  wy: number;
  wz: number;
  /** Off the table, in a pocket. */
  out?: boolean;
}

export interface Pocket {
  x: number;
  y: number;
  r: number;
}

/** Four corners and two in the middle of the long rails, as a table has. */
export const POCKETS: Pocket[] = [
  { x: 0, y: 0, r: 6.4 },
  { x: TABLE.w / 2, y: -0.6, r: 6.0 },
  { x: TABLE.w, y: 0, r: 6.4 },
  { x: 0, y: TABLE.h, r: 6.4 },
  { x: TABLE.w / 2, y: TABLE.h + 0.6, r: 6.0 },
  { x: TABLE.w, y: TABLE.h, r: 6.4 },
];

export const HEAD = TABLE.w * 0.25;
export const FOOT = TABLE.w * 0.75;

export type Kind = "eight" | "nine" | "free";
export type Group = "solids" | "stripes";

export const GROUP_OF = (n: number): Group | null => (n >= 1 && n <= 7 ? "solids" : n >= 9 && n <= 15 ? "stripes" : null);

export interface Shot {
  id: string;
  /** Radians, anticlockwise from the long rail. */
  angle: number;
  /** 0 to 1 of the hardest the cue goes. */
  power: number;
  /** Where the tip struck, in ball radii from the middle: sideways and up. */
  side: number;
  top: number;
  /** Where the cue ball was; it may have been in hand. */
  cue: { x: number; y: number };
  by?: string;
}

export interface ShotResult {
  balls: Ball[];
  /** In the order they went down. */
  potted: number[];
  /** The first ball the cue ball touched, if it touched one. */
  firstHit: number | null;
  /** Cushions struck after that first contact, which is what makes a shot legal. */
  railsAfter: number;
  /** The cue ball went down, or left the table. */
  scratch: boolean;
}

const ball = (n: number, x: number, y: number): Ball => ({ n, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 });

/** The fifteen in a triangle, eight in the middle, a stripe and a solid in the back corners. */
const EIGHT_RACK = [1, 9, 2, 10, 8, 3, 4, 13, 14, 5, 7, 11, 6, 12, 15];
/** Nine in a diamond, the one at the front and the nine in the middle. */
const NINE_RACK = [1, 2, 3, 4, 9, 5, 6, 7, 8];

/** A fresh table: the cue ball on the head spot, the rest racked on the foot spot. */
export function rack(kind: Kind): Ball[] {
  const balls: Ball[] = [ball(0, HEAD, TABLE.h / 2)];
  if (kind === "free") {
    // Nothing racked: the table is yours to set out.
    for (let i = 0; i < 9; i += 1) {
      balls.push(ball(i + 1, FOOT - 24 + (i % 3) * 24, TABLE.h / 2 - 24 + Math.floor(i / 3) * 24));
    }
    return balls;
  }
  const order = kind === "nine" ? NINE_RACK : EIGHT_RACK;
  const rows = kind === "nine" ? [1, 2, 3, 2, 1] : [1, 2, 3, 4, 5];
  const gap = R * 2 + 0.02;
  let at = 0;
  rows.forEach((count, row) => {
    for (let i = 0; i < count; i += 1) {
      const x = FOOT + row * gap * Math.sin(Math.PI / 3);
      const y = TABLE.h / 2 + (i - (count - 1) / 2) * gap;
      balls.push(ball(order[at], x, y));
      at += 1;
    }
  });
  return balls;
}

/** The cue ball as it leaves the tip: how fast, and spinning how. */
export function strike(shot: Shot): { vx: number; vy: number; wx: number; wy: number; wz: number } {
  const side = Math.max(-0.5, Math.min(0.5, shot.side));
  const top = Math.max(-0.5, Math.min(0.5, shot.top));
  const speed = Math.max(0, Math.min(1, shot.power)) * 620;
  // Side spin pushes the cue ball a whisker off the line it was aimed along.
  const angle = shot.angle - side * 0.03;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  // Struck above the middle it rolls at once; below, it comes back.
  const f = 2.5 * top;
  return {
    vx,
    vy,
    wx: (-vy / R) * f,
    wy: (vx / R) * f,
    wz: (-side * speed * 2.5) / R,
  };
}

const speedOf = (b: Ball) => Math.hypot(b.vx, b.vy);

/** Whether anything is still moving. */
export function moving(balls: Ball[]): boolean {
  return balls.some((b) => !b.out && (speedOf(b) > STILL || Math.abs(b.wz) > 4));
}

interface Events {
  potted: number[];
  firstHit: number | null;
  railsAfter: number;
  hits: number;
}

/** One slice of time: the cloth, the cushions, and whatever runs into what. */
function advance(balls: Ball[], dt: number, events: Events) {
  for (const b of balls) {
    if (b.out) continue;

    // What the bottom of the ball is doing against the cloth.
    const ux = b.vx - R * b.wy;
    const uy = b.vy + R * b.wx;
    const slip = Math.hypot(ux, uy);

    if (slip > 0.6) {
      const nx = ux / slip;
      const ny = uy / slip;
      b.vx -= SLIDE * G * nx * dt;
      b.vy -= SLIDE * G * ny * dt;
      const k = ((5 * SLIDE * G) / (2 * R)) * dt;
      b.wx += k * -ny;
      b.wy += k * nx;
    } else {
      // Rolling: the cloth only has to slow it down, and the spin follows.
      const v = speedOf(b);
      if (v > 0) {
        const drop = Math.min(v, ROLL * G * dt);
        b.vx -= (b.vx / v) * drop;
        b.vy -= (b.vy / v) * drop;
      }
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
    }

    // Side spin dies on its own.
    const spin = ((5 * SPIN_DRAG * G) / (2 * R)) * dt;
    b.wz -= Math.sign(b.wz) * Math.min(Math.abs(b.wz), spin);

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (speedOf(b) < STILL * 0.35 && Math.hypot(b.wx, b.wy) < 1) {
      b.vx = 0;
      b.vy = 0;
    }
  }

  // Pockets, before the cushions: a ball over a pocket is down, not bounced.
  for (const b of balls) {
    if (b.out) continue;
    for (const p of POCKETS) {
      if (Math.hypot(b.x - p.x, b.y - p.y) < p.r) {
        b.out = true;
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
        events.potted.push(b.n);
        break;
      }
    }
  }

  // Cushions.
  for (const b of balls) {
    if (b.out) continue;
    let hit = false;
    if (b.x < R) {
      b.x = R;
      b.vx = -b.vx * CUSHION;
      b.vy += b.wz * R * 0.05;
      hit = true;
    } else if (b.x > TABLE.w - R) {
      b.x = TABLE.w - R;
      b.vx = -b.vx * CUSHION;
      b.vy -= b.wz * R * 0.05;
      hit = true;
    }
    if (b.y < R) {
      b.y = R;
      b.vy = -b.vy * CUSHION;
      b.vx -= b.wz * R * 0.05;
      hit = true;
    } else if (b.y > TABLE.h - R) {
      b.y = TABLE.h - R;
      b.vy = -b.vy * CUSHION;
      b.vx += b.wz * R * 0.05;
      hit = true;
    }
    if (hit) {
      // A cushion takes most of the side off and leaves the ball rolling.
      b.wz *= 0.6;
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
      if (events.firstHit !== null) events.railsAfter += 1;
    }
  }

  // Ball against ball.
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (a.out) continue;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (b.out) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d >= R * 2) continue;
      const nx = dx / d;
      const ny = dy / d;
      // Pull them apart first, so they cannot sit inside one another.
      const overlap = (R * 2 - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const along = rvx * nx + rvy * ny;
      if (along > 0) continue;

      if (a.n === 0 && events.firstHit === null) events.firstHit = b.n;
      else if (b.n === 0 && events.firstHit === null) events.firstHit = a.n;
      events.hits += 1;

      const push = (-(1 + BOUNCE) * along) / 2;
      a.vx -= push * nx;
      a.vy -= push * ny;
      b.vx += push * nx;
      b.vy += push * ny;

      // The two surfaces rub as they pass: side spin throws the object ball
      // off the line of centres, which is what makes English worth having.
      const tx = -ny;
      const ty = nx;
      const surface = rvx * tx + rvy * ty + (a.wz + b.wz) * R;
      const rub = Math.max(-Math.abs(push) * THROW, Math.min(Math.abs(push) * THROW, -surface * 0.5));
      a.vx -= rub * tx;
      a.vy -= rub * ty;
      b.vx += rub * tx;
      b.vy += rub * ty;
      a.wz *= 0.8;
      b.wz *= 0.8;
    }
  }
}

const copy = (balls: Ball[]): Ball[] => balls.map((b) => ({ ...b }));

/**
 * A shot, played out to the last roll. Returns where everything came to rest,
 * what went down and the things the rules care about, plus a frame every
 * sixtieth of a second so a screen can watch it happen.
 */
export function play(balls: Ball[], shot: Shot): { frames: number[][]; result: ShotResult } {
  const live = copy(balls);
  const cue = live.find((b) => b.n === 0);
  if (cue) {
    cue.out = false;
    cue.x = shot.cue.x;
    cue.y = shot.cue.y;
    const hit = strike(shot);
    Object.assign(cue, hit);
  }

  const events: Events = { potted: [], firstHit: null, railsAfter: 0, hits: 0 };
  const dt = 1 / 480;
  const frames: number[][] = [];
  let since = 0;
  const snap = () => frames.push(live.flatMap((b) => (b.out ? [-1, -1] : [b.x, b.y])));
  snap();

  for (let t = 0; t < 30 && moving(live); t += dt) {
    advance(live, dt, events);
    since += dt;
    if (since >= 1 / 60) {
      since = 0;
      snap();
    }
  }
  for (const b of live) {
    b.vx = 0;
    b.vy = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
  }
  snap();

  return {
    frames,
    result: {
      balls: live,
      potted: events.potted,
      firstHit: events.firstHit,
      railsAfter: events.railsAfter,
      scratch: events.potted.includes(0),
    },
  };
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

export interface PoolState {
  version: 1;
  kind: Kind;
  seats: Record<string, string | null>;
  holders?: Record<string, string | null>;
  seatCount: number;
  /** 0 is everyone for themselves; 2 puts alternate chairs on the same side. */
  teams: number;
  balls: Ball[];
  /** Whose go it is. */
  turn: string;
  /** The last shot taken, so every screen can watch it. */
  shot?: Shot;
  /** The shot whose outcome is already written down here. */
  settled?: string;
  /** Which side has which balls, once eight-ball has settled it. */
  groups?: Record<string, Group>;
  ballInHand?: boolean;
  /** Ball in hand behind the head string, as it is after a foul on the break. */
  behindLine?: boolean;
  broken?: boolean;
  say?: string;
  winner?: string | null;
  /** The table is being set out by hand. */
  arranging?: boolean;
}

export const chairsFor = (count: number): string[] =>
  Array.from({ length: Math.max(2, Math.min(8, count)) }, (_, i) => `p${i}`);

/** Which side a chair plays for: its own, or the team it shares. */
export function sideOf(state: PoolState, chair: string): string {
  const chairs = chairsFor(state.seatCount);
  const at = chairs.indexOf(chair);
  if (at < 0) return chair;
  return state.teams >= 2 ? `t${at % state.teams}` : chair;
}

export function emptyPool(kind: Kind = "eight"): PoolState {
  return {
    version: 1,
    kind,
    seats: {},
    holders: {},
    seatCount: 2,
    teams: 0,
    balls: rack(kind),
    turn: "p0",
    ballInHand: true,
    behindLine: true,
    broken: false,
    say: "break them",
  };
}

/**
 * The chair after this one, going round the table. Chairs nobody is sitting in
 * are skipped, so four chairs with two people in them still take turn about --
 * unless the whole table is empty, which is one device being passed round.
 */
export function nextChair(state: PoolState, chair: string): string {
  const chairs = chairsFor(state.seatCount);
  const taken = chairs.filter((c) => state.seats[c]);
  const ring = taken.length > 0 ? taken : chairs;
  const at = ring.indexOf(chair);
  return at < 0 ? ring[0] : ring[(at + 1) % ring.length];
}

/** Whoever should be shooting: the chair whose go it is, if anyone is in it. */
export function playable(state: PoolState): string {
  const chairs = chairsFor(state.seatCount);
  const taken = chairs.filter((c) => state.seats[c]);
  if (taken.length === 0 || state.seats[state.turn]) return state.turn;
  return taken[0];
}

/** What is left of a side's own balls. */
export function left(balls: Ball[], group: Group | undefined): number {
  if (!group) return 0;
  return balls.filter((b) => !b.out && GROUP_OF(b.n) === group).length;
}

/** The lowest numbered ball still up, which is the one nine-ball must be hit first. */
export function lowest(balls: Ball[]): number | null {
  const up = balls.filter((b) => !b.out && b.n > 0).map((b) => b.n);
  return up.length ? Math.min(...up) : null;
}

/** Somewhere to put a ball that has to come back: the foot spot, or near it. */
export function spotFor(balls: Ball[], x = FOOT, y = TABLE.h / 2): { x: number; y: number } {
  for (let step = 0; step < 60; step += 1) {
    const at = { x: Math.min(TABLE.w - R, x + step * R), y };
    if (!balls.some((b) => !b.out && Math.hypot(b.x - at.x, b.y - at.y) < R * 2.05)) return at;
  }
  return { x, y };
}

/**
 * What a shot did to the game. Everything a table argues about lives here:
 * whether the shot was fair, whose balls are whose, who carries on.
 */
export function judge(state: PoolState, shot: Shot, result: ShotResult): PoolState {
  const balls = result.balls.map((b) => ({ ...b }));
  const side = sideOf(state, state.turn);
  const groups = { ...(state.groups ?? {}) };
  const potted = result.potted.filter((n) => n !== 0);
  const next: PoolState = { ...state, balls, shot, broken: true };

  if (state.kind === "free") {
    // No rules at all: the cue ball comes back if it goes down, and the go
    // passes on so a table full of people gets a turn each.
    if (result.scratch) {
      const cue = balls.find((b) => b.n === 0);
      if (cue) {
        const at = spotFor(balls, HEAD, TABLE.h / 2);
        Object.assign(cue, { out: false, x: at.x, y: at.y });
      }
    }
    next.turn = potted.length > 0 ? state.turn : nextChair(state, state.turn);
    next.say = potted.length > 0 ? "and again" : "";
    return next;
  }

  const wanted = state.kind === "nine" ? lowest(state.balls) : null;
  const mine = groups[side];
  let foul = false;
  let say = "";

  // Once a side has cleared its own, the eight is the ball it must hit.
  const owed = state.kind === "eight" && mine ? left(state.balls, mine) : 0;
  const must = state.kind === "nine" ? wanted : state.kind === "eight" && mine ? (owed > 0 ? null : 8) : null;

  if (result.firstHit === null) {
    foul = true;
    say = "nothing was hit";
  } else if (result.scratch) {
    foul = true;
    say = "in off";
  } else if (must !== null && result.firstHit !== must) {
    foul = true;
    say = must === 8 ? "the eight had to be hit first" : `the ${must} had to be hit first`;
  } else if (state.kind === "eight" && mine && owed > 0 && GROUP_OF(result.firstHit) !== mine) {
    foul = true;
    say = `${mine} first`;
  } else if (potted.length === 0 && result.railsAfter === 0) {
    foul = true;
    say = "no ball reached a cushion";
  }

  // The table is open until somebody pots one of their own fairly.
  if (state.kind === "eight" && !mine && !foul && potted.length > 0) {
    const first = potted.find((n) => GROUP_OF(n) !== null);
    const group = first ? GROUP_OF(first) : null;
    if (group) {
      groups[side] = group;
      const other = sideOf(state, nextChair(state, state.turn));
      groups[other] = group === "solids" ? "stripes" : "solids";
      next.groups = groups;
      say = `${group} it is`;
    }
  }

  const eightDown = result.potted.includes(8);
  const nineDown = result.potted.includes(9);

  if (state.kind === "eight" && eightDown) {
    const won = !foul && left(state.balls, groups[side] ?? mine) === 0;
    next.winner = won ? side : sideOf(state, nextChair(state, state.turn));
    next.say = won ? "that is the game" : "the eight went down early";
    next.shot = shot;
    return next;
  }
  if (state.kind === "nine" && nineDown) {
    next.winner = foul ? sideOf(state, nextChair(state, state.turn)) : side;
    next.say = foul ? "the nine went down on a foul" : "that is the game";
    return next;
  }

  if (foul) {
    next.turn = nextChair(state, state.turn);
    next.ballInHand = true;
    next.behindLine = false;
    next.say = `foul: ${say}`;
    if (result.scratch) {
      const cue = balls.find((b) => b.n === 0);
      if (cue) {
        const at = spotFor(balls, HEAD, TABLE.h / 2);
        Object.assign(cue, { out: false, x: at.x, y: at.y });
      }
    }
    return next;
  }

  const ownPot =
    state.kind === "nine"
      ? potted.length > 0
      : potted.some((n) => GROUP_OF(n) === (groups[side] ?? mine)) || (!mine && potted.length > 0);

  next.ballInHand = false;
  next.behindLine = false;
  if (ownPot) {
    next.turn = state.turn;
    next.say = say || "and again";
  } else {
    next.turn = nextChair(state, state.turn);
    next.say = say;
  }
  return next;
}

/** A ball put somewhere by hand: on the table, clear of the rest. */
export function place(balls: Ball[], n: number, x: number, y: number, behindLine = false): Ball[] {
  const limit = behindLine ? Math.min(HEAD, TABLE.w - R) : TABLE.w - R;
  const at = {
    x: Math.max(R, Math.min(limit, x)),
    y: Math.max(R, Math.min(TABLE.h - R, y)),
  };
  return balls.map((b) => (b.n === n ? { ...b, ...at, out: false, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 } : b));
}

/** Whether a ball could sit there, or would be inside another. */
export function fits(balls: Ball[], n: number, x: number, y: number): boolean {
  return !balls.some((b) => !b.out && b.n !== n && Math.hypot(b.x - x, b.y - y) < R * 2);
}

/** The state of a game saved before, brought up to date. */
export function upgradePool(state: unknown): PoolState {
  const s = (state ?? {}) as Partial<PoolState>;
  if (s.version === 1 && Array.isArray(s.balls)) return s as PoolState;
  return emptyPool();
}

/**
 * What the cue ball would meet first along a line: the ball it would touch,
 * or the cushion. Used to draw the aiming line and the ghost ball on it, the
 * way a player sights along the cue.
 */
export function sight(
  balls: Ball[],
  from: { x: number; y: number },
  angle: number,
): { x: number; y: number; hit: Ball | null } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  let hit: Ball | null = null;

  for (const b of balls) {
    if (b.out || b.n === 0) continue;
    const ox = b.x - from.x;
    const oy = b.y - from.y;
    const along = ox * dx + oy * dy;
    if (along <= 0) continue;
    const across = Math.abs(ox * dy - oy * dx);
    if (across > R * 2) continue;
    const back = Math.sqrt(Math.max(0, (R * 2) ** 2 - across * across));
    const at = along - back;
    if (at >= 0 && at < best) {
      best = at;
      hit = b;
    }
  }

  // The cushions, if nothing is in the way first.
  const limits: number[] = [];
  if (dx > 1e-6) limits.push((TABLE.w - R - from.x) / dx);
  if (dx < -1e-6) limits.push((R - from.x) / dx);
  if (dy > 1e-6) limits.push((TABLE.h - R - from.y) / dy);
  if (dy < -1e-6) limits.push((R - from.y) / dy);
  const rail = limits.length ? Math.max(0, Math.min(...limits)) : 0;
  const at = Math.min(best, rail);
  return { x: from.x + dx * at, y: from.y + dy * at, hit: at === best ? hit : null };
}
