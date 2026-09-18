// Dice notation, the way people type it at a table: 2d6+3, 4d6kh3, d20*2,
// (1d8+2)/2, 3dF, 1d6! for exploding. Parsed into a small tree, rolled, and
// reported die by die, because "you rolled 14" is less fun than seeing the
// three sixes that made it.
//
//   NdM        N dice of M sides. N defaults to 1; M may be % (a hundred) or F
//              (fudge: minus one, blank, plus one).
//   khN / klN  keep the highest / lowest N. kN is khN.
//   dhN / dlN  drop the highest / lowest N.
//   !          explode: a die that rolls its highest rolls again and adds on.
//   + - * /    as usual, with * and / first. x and the symbols × and ÷ work
//              too. Division rounds down, the way tabletop rules mean it.

export type Sides = number | "F";

export type DiceNode =
  | { kind: "num"; value: number }
  | {
      kind: "dice";
      count: number;
      sides: Sides;
      /** How many to keep, and from which end. */
      keep?: { high: boolean; n: number };
      explode?: boolean;
      text: string;
    }
  | { kind: "neg"; of: DiceNode }
  | { kind: "op"; op: "+" | "-" | "*" | "/"; left: DiceNode; right: DiceNode };

export interface DieResult {
  value: number;
  /** Every roll that went into it, when it exploded. */
  chain?: number[];
  kept: boolean;
}

export interface GroupResult {
  text: string;
  sides: Sides;
  dice: DieResult[];
  sum: number;
}

export interface Outcome {
  total: number;
  groups: GroupResult[];
}

export const MAX_DICE = 100;
export const MAX_SIDES = 1000;
export const MAX_LENGTH = 80;
/** A die that keeps rolling its top face stops after this many rolls. */
export const MAX_CHAIN = 10;

export class DiceError extends Error {}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    // Spaces go, except between two numbers: "2d6 3" is a typo, not a d63.
    .replace(/(?<!\d)\s+|\s+(?!\d)/g, "")
    .replace(/\s+/g, " ")
    // An x between two things is a multiplication: 2x3, (1d6)x2, d6x2.
    .replace(/(?<=[\d)%f])x(?=[\d(d])/g, "*");
}

export type Parsed = { ok: true; node: DiceNode; dice: number } | { ok: false; error: string };

export function parse(input: string): Parsed {
  const text = normalise(input);
  if (!text) return { ok: false, error: "type something like 2d6+3" };
  if (text.length > MAX_LENGTH) return { ok: false, error: "that is a lot of maths for one roll" };

  let at = 0;
  let dice = 0;
  const peek = () => text[at];
  const fail = (message: string): never => {
    throw new DiceError(message);
  };
  const number = (): number | null => {
    const match = /^\d+/.exec(text.slice(at));
    if (!match) return null;
    at += match[0].length;
    return Number(match[0]);
  };

  const atom = (): DiceNode => {
    if (peek() === "(") {
      at += 1;
      const inner = expr();
      if (peek() !== ")") fail("a bracket is left open");
      at += 1;
      return inner;
    }
    const start = at;
    const count = number();
    if (peek() !== "d") {
      if (count === null) fail(peek() ? `not sure what "${peek()}" means here` : "that ends too soon");
      return { kind: "num", value: count as number };
    }
    at += 1;
    let sides: Sides;
    if (peek() === "%") {
      at += 1;
      sides = 100;
    } else if (peek() === "f") {
      at += 1;
      sides = "F";
    } else {
      const n = number();
      if (n === null) fail("a d needs a number of sides after it, like d6");
      sides = n as number;
    }
    const n = count ?? 1;
    if (n < 1) fail("roll at least one die");
    if (typeof sides === "number" && sides < 2) fail("a die needs two sides at least");
    if (typeof sides === "number" && sides > MAX_SIDES) fail(`dice stop at d${MAX_SIDES}`);
    dice += n;
    if (dice > MAX_DICE) fail(`at most ${MAX_DICE} dice in one go`);

    let keep: { high: boolean; n: number } | undefined;
    const rule = /^(kh|kl|dh|dl|k)/.exec(text.slice(at));
    if (rule) {
      at += rule[0].length;
      const how = number();
      if (how === null) fail(`${rule[0]} needs a number after it`);
      const k = how as number;
      if (rule[0] === "dh" || rule[0] === "dl") {
        if (k >= n) fail("that drops every die");
        keep = { high: rule[0] === "dl", n: n - k };
      } else {
        if (k < 1 || k > n) fail(`keep between 1 and ${n}`);
        keep = { high: rule[0] !== "kl", n: k };
      }
    }
    let explode = false;
    if (peek() === "!") {
      at += 1;
      explode = true;
      if (sides === "F") fail("fudge dice do not explode");
    }
    return { kind: "dice", count: n, sides, keep, explode, text: text.slice(start, at) };
  };

  const unary = (): DiceNode => {
    if (peek() === "-") {
      at += 1;
      return { kind: "neg", of: unary() };
    }
    if (peek() === "+") {
      at += 1;
      return unary();
    }
    return atom();
  };

  const term = (): DiceNode => {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const op = peek() as "*" | "/";
      at += 1;
      left = { kind: "op", op, left, right: unary() };
    }
    return left;
  };

  function expr(): DiceNode {
    let left = term();
    while (peek() === "+" || peek() === "-") {
      const op = peek() as "+" | "-";
      at += 1;
      left = { kind: "op", op, left, right: term() };
    }
    return left;
  }

  try {
    const node = expr();
    if (at < text.length) fail(`not sure what "${text.slice(at)}" means`);
    return { ok: true, node, dice };
  } catch (error) {
    if (error instanceof DiceError) return { ok: false, error: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Rolling
// ---------------------------------------------------------------------------

/** 0 <= n < max, from the browser's proper random source where there is one. */
export function randomBelow(max: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    // Rejection sampling, so a d6 is not a hair more likely to land low.
    const limit = Math.floor(0x100000000 / max) * max;
    const box = new Uint32Array(1);
    for (;;) {
      crypto.getRandomValues(box);
      if (box[0] < limit) return box[0] % max;
    }
  }
  return Math.floor(Math.random() * max);
}

export type Random = (max: number) => number;

function face(sides: Sides, random: Random): number {
  return sides === "F" ? random(3) - 1 : random(sides) + 1;
}

function rollGroup(node: Extract<DiceNode, { kind: "dice" }>, random: Random): GroupResult {
  const dice: DieResult[] = [];
  for (let i = 0; i < node.count; i += 1) {
    const first = face(node.sides, random);
    if (!node.explode || node.sides === "F") {
      dice.push({ value: first, kept: true });
      continue;
    }
    const chain = [first];
    while (chain.at(-1) === node.sides && chain.length < MAX_CHAIN) chain.push(face(node.sides, random));
    dice.push({ value: chain.reduce((a, b) => a + b, 0), kept: true, ...(chain.length > 1 ? { chain } : {}) });
  }
  if (node.keep) {
    const order = dice
      .map((die, index) => ({ value: die.value, index }))
      .sort((a, b) => (node.keep?.high ? b.value - a.value : a.value - b.value) || a.index - b.index);
    const keep = new Set(order.slice(0, node.keep.n).map((d) => d.index));
    dice.forEach((die, index) => (die.kept = keep.has(index)));
  }
  const sum = dice.reduce((total, die) => total + (die.kept ? die.value : 0), 0);
  return { text: node.text, sides: node.sides, dice, sum };
}

export function roll(node: DiceNode, random: Random = randomBelow): Outcome {
  const groups: GroupResult[] = [];
  const walk = (at: DiceNode): number => {
    switch (at.kind) {
      case "num":
        return at.value;
      case "dice": {
        const group = rollGroup(at, random);
        groups.push(group);
        return group.sum;
      }
      case "neg":
        return -walk(at.of);
      case "op": {
        const left = walk(at.left);
        const right = walk(at.right);
        if (at.op === "+") return left + right;
        if (at.op === "-") return left - right;
        if (at.op === "*") return left * right;
        if (right === 0) throw new DiceError("that came out as a division by zero");
        return Math.floor(left / right);
      }
    }
  };
  const total = walk(node);
  return { total, groups };
}

// ---------------------------------------------------------------------------
// What to expect
// ---------------------------------------------------------------------------

/** The smallest and largest a roll can come to. Infinity when dice explode. */
export function range(node: DiceNode): [number, number] {
  switch (node.kind) {
    case "num":
      return [node.value, node.value];
    case "dice": {
      const kept = node.keep?.n ?? node.count;
      if (node.sides === "F") return [-kept, kept];
      return [kept, node.explode ? Infinity : kept * node.sides];
    }
    case "neg": {
      const [lo, hi] = range(node.of);
      return [-hi, -lo];
    }
    case "op": {
      const [a, b] = range(node.left);
      const [c, d] = range(node.right);
      if (node.op === "+") return [a + c, b + d];
      if (node.op === "-") return [a - d, b - c];
      const corners =
        node.op === "*"
          ? [a * c, a * d, b * c, b * d]
          : c <= 0 && d >= 0
            ? [NaN]
            : [a / c, a / d, b / c, b / d].map(Math.floor);
      const finite = corners.map((x) => (Number.isNaN(x) ? 0 : x));
      if (corners.some(Number.isNaN)) return [-Infinity, Infinity];
      return [Math.min(...finite), Math.max(...finite)];
    }
  }
}

/** A seeded generator, so an estimate reads the same every time it is drawn. */
function seeded(seed: number): Random {
  let s = seed >>> 0;
  return (max) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const containsDivision = (node: DiceNode): boolean =>
  node.kind === "op" ? node.op === "/" || containsDivision(node.left) || containsDivision(node.right) : node.kind === "neg" ? containsDivision(node.of) : false;

/** Average of keeping some of a handful of dice: counted out exactly when that is cheap. */
function keptMean(node: Extract<DiceNode, { kind: "dice" }>): number {
  const sides = node.sides === "F" ? 3 : node.sides;
  const offset = node.sides === "F" ? -2 : 0;
  if (!node.keep) {
    if (node.sides === "F") return 0;
    // An exploding die averages a little more: each top face buys another roll.
    const one = node.explode ? ((sides + 1) / 2) * (sides / (sides - 1)) : (sides + 1) / 2;
    return one * node.count;
  }
  if (node.explode || sides ** node.count > 60000) return estimate(node, 4000);
  let total = 0;
  const faces = new Array<number>(node.count).fill(1);
  const outcomes = sides ** node.count;
  for (let i = 0; i < outcomes; i += 1) {
    const sorted = [...faces].sort((a, b) => (node.keep?.high ? b - a : a - b));
    for (let k = 0; k < node.keep.n; k += 1) total += sorted[k] + offset;
    for (let d = 0; d < node.count; d += 1) {
      faces[d] += 1;
      if (faces[d] <= sides) break;
      faces[d] = 1;
    }
  }
  return total / outcomes;
}

function estimate(node: DiceNode, samples: number): number {
  const random = seeded(hash(JSON.stringify(node)));
  let total = 0;
  let counted = 0;
  for (let i = 0; i < samples; i += 1) {
    try {
      total += roll(node, random).total;
      counted += 1;
    } catch {
      // A division by zero in one sample says nothing about the rest.
    }
  }
  return counted ? total / counted : 0;
}

/** The average a roll comes to, over a great many of them. */
export function expected(node: DiceNode): number {
  if (containsDivision(node)) return estimate(node, 3000);
  const walk = (at: DiceNode): number => {
    switch (at.kind) {
      case "num":
        return at.value;
      case "dice":
        return keptMean(at);
      case "neg":
        return -walk(at.of);
      case "op": {
        const left = walk(at.left);
        const right = walk(at.right);
        // Every group of dice is rolled on its own, so the average of a
        // product is the product of the averages.
        return at.op === "+" ? left + right : at.op === "-" ? left - right : left * right;
      }
    }
  };
  return walk(node);
}

// ---------------------------------------------------------------------------
// The tray, as the room keeps it
// ---------------------------------------------------------------------------

export interface DiceRoll {
  id: string;
  by: string;
  tint?: string;
  expr: string;
  /** Set when the roll came from a saved combo. */
  label?: string;
  total: number;
  groups: GroupResult[];
  at: number;
}

export interface DiceCombo {
  name: string;
  expr: string;
}

export interface DiceState {
  expr: string;
  combos: DiceCombo[];
  history: DiceRoll[];
}

export const HISTORY = 30;
export const MAX_COMBOS = 12;

export const STARTER_COMBOS: DiceCombo[] = [
  { name: "d20", expr: "1d20" },
  { name: "2d6", expr: "2d6" },
  { name: "advantage", expr: "2d20kh1" },
  { name: "disadvantage", expr: "2d20kl1" },
  { name: "stat", expr: "4d6kh3" },
  { name: "d100", expr: "1d%" },
];

export function emptyDice(): DiceState {
  return { expr: "2d6", combos: STARTER_COMBOS.map((c) => ({ ...c })), history: [] };
}

/** Rolls and records it. Throws DiceError when the notation is wrong or the maths is. */
export function rollInto(
  state: DiceState,
  expr: string,
  who: { name: string; tint?: string },
  id: string,
  now: number,
  label?: string,
  random?: Random,
): DiceState {
  const parsed = parse(expr);
  if (!parsed.ok) throw new DiceError(parsed.error);
  const outcome = roll(parsed.node, random);
  const entry: DiceRoll = {
    id,
    by: who.name,
    ...(who.tint ? { tint: who.tint } : {}),
    expr: normalise(expr),
    ...(label ? { label } : {}),
    total: outcome.total,
    groups: outcome.groups,
    at: now,
  };
  return { ...state, expr, history: [entry, ...state.history].slice(0, HISTORY) };
}

/** The average of the dice that counted, which is what "how did I roll" usually means. */
export function averageDie(groups: GroupResult[]): number | null {
  const kept = groups.flatMap((g) => g.dice.filter((d) => d.kept).map((d) => d.value));
  if (kept.length === 0) return null;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** A die at its highest face, for the tray to make a fuss of. */
export const isTop = (sides: Sides, value: number) => sides !== "F" && value >= sides;
export const isBottom = (sides: Sides, value: number) => (sides === "F" ? value === -1 : value === 1);
