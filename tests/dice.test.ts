import test from "node:test";
import assert from "node:assert/strict";

import {
  DiceError,
  MAX_DICE,
  averageDie,
  emptyDice,
  expected,
  normalise,
  parse,
  range,
  roll,
  rollInto,
  type DiceNode,
} from "../src/lib/dice.ts";

const node = (text: string): DiceNode => {
  const parsed = parse(text);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  return parsed.node;
};

/** Rolls the given faces in order, each time a die is asked for. */
const loaded = (...faces: number[]) => {
  let i = 0;
  return (max: number) => {
    const face = faces[i++ % faces.length];
    assert.ok(face >= 1 && face <= max || max === 3, `face ${face} on a d${max}`);
    return max === 3 ? face + 1 : face - 1;
  };
};

test("the symbols people actually type all mean the same thing", () => {
  assert.equal(normalise("2D6 × 3"), "2d6*3");
  assert.equal(normalise("10 ÷ 2"), "10/2");
  assert.equal(normalise("2x3"), "2*3");
  assert.equal(normalise("d6x2"), "d6*2");
  assert.equal(normalise("(1d4)x2"), "(1d4)*2");
});

test("plain dice, and the maths around them", () => {
  assert.equal(roll(node("2d6+3"), loaded(4, 5)).total, 12);
  assert.equal(roll(node("d20"), loaded(17)).total, 17);
  assert.equal(roll(node("3d6*2"), loaded(1, 2, 3)).total, 12);
  assert.equal(roll(node("2d6-1d4"), loaded(6, 6, 3)).total, 9);
  assert.equal(roll(node("-d4"), loaded(3)).total, -3);
});

test("multiplication before addition, brackets before both", () => {
  assert.equal(roll(node("2+3*4")).total, 14);
  assert.equal(roll(node("(2+3)*4")).total, 20);
  assert.equal(roll(node("10-2-3")).total, 5, "left to right");
});

test("division rounds down, as a rulebook means it", () => {
  assert.equal(roll(node("7/2")).total, 3);
  assert.equal(roll(node("(1d8+2)/2"), loaded(5)).total, 3);
  assert.throws(() => roll(node("5/(d4-d4)"), loaded(2, 2)), DiceError);
});

test("keeping and dropping", () => {
  const outcome = roll(node("4d6kh3"), loaded(2, 6, 1, 5));
  assert.equal(outcome.total, 13);
  assert.deepEqual(outcome.groups[0].dice.map((d) => d.kept), [true, true, false, true]);
  assert.equal(roll(node("2d20kl1"), loaded(15, 4)).total, 4);
  assert.equal(roll(node("2d20k1"), loaded(15, 4)).total, 15, "k is keep highest");
  assert.equal(roll(node("4d6dl1"), loaded(2, 6, 1, 5)).total, 13, "drop lowest is keep the rest");
  assert.equal(roll(node("3d6dh1"), loaded(2, 6, 1)).total, 3);
});

test("ties keep the earlier die, so the tray is not ambiguous", () => {
  const outcome = roll(node("3d6kh1"), loaded(4, 4, 2));
  assert.deepEqual(outcome.groups[0].dice.map((d) => d.kept), [true, false, false]);
});

test("an exploding die rolls again on its top face", () => {
  const outcome = roll(node("1d6!"), loaded(6, 6, 2));
  assert.equal(outcome.total, 14);
  assert.deepEqual(outcome.groups[0].dice[0].chain, [6, 6, 2]);
});

test("fudge dice run from minus one to plus one", () => {
  for (let i = 0; i < 200; i += 1) {
    const total = roll(node("4dF")).total;
    assert.ok(total >= -4 && total <= 4);
  }
});

test("percentile is a hundred sides", () => {
  const n = node("d%");
  assert.equal(n.kind === "dice" && n.sides, 100);
});

test("every die lands on a face it has", () => {
  const sides = [2, 4, 6, 8, 10, 12, 20, 100];
  for (const s of sides) {
    for (let i = 0; i < 300; i += 1) {
      const value = roll(node(`1d${s}`)).total;
      assert.ok(value >= 1 && value <= s, `d${s} rolled ${value}`);
    }
  }
});

test("mistakes are explained rather than rolled", () => {
  for (const bad of ["", "2d", "d1", "0d6", "2d6+", "(2d6", "4d6kh5", "3d6dl3", "hello", "2d6 3"]) {
    const parsed = parse(bad);
    assert.equal(parsed.ok, false, `"${bad}" parsed`);
  }
  assert.equal(parse(`${MAX_DICE + 1}d6`).ok, false);
  assert.equal(parse("60d6+60d6").ok, false, "the limit is across the whole roll");
  assert.equal(parse("d1001").ok, false);
});

test("the range of a roll", () => {
  assert.deepEqual(range(node("2d6+3")), [5, 15]);
  assert.deepEqual(range(node("4d6kh3")), [3, 18]);
  assert.deepEqual(range(node("d6-d6")), [-5, 5]);
  assert.deepEqual(range(node("4dF")), [-4, 4]);
  assert.equal(range(node("d6!"))[1], Infinity);
});

test("what a roll comes to on average", () => {
  assert.equal(expected(node("2d6")), 7);
  assert.equal(expected(node("d20+5")), 15.5);
  assert.equal(expected(node("4dF")), 0);
  assert.equal(expected(node("2d6*2")), 14);
  // Four dice keep three: 12.24, worked out exactly.
  assert.ok(Math.abs(expected(node("4d6kh3")) - 12.2446) < 0.001);
  // Advantage on a d20 is 13.825.
  assert.ok(Math.abs(expected(node("2d20kh1")) - 13.825) < 0.001);
  // Estimated where it cannot be counted out, but the same every time.
  const a = expected(node("(2d6+1)/2"));
  assert.equal(a, expected(node("(2d6+1)/2")));
  assert.ok(Math.abs(a - 3.75) < 0.2, `got ${a}`);
});

test("a roll goes on the top of the history, which stays short", () => {
  let state = emptyDice();
  for (let i = 0; i < 40; i += 1) state = rollInto(state, "1d6", { name: "ana" }, `r${i}`, i);
  assert.equal(state.history.length, 30);
  assert.equal(state.history[0].id, "r39");
  assert.throws(() => rollInto(state, "2d", { name: "ana" }, "x", 0), DiceError);
});

test("the average die counts only the dice that were kept", () => {
  const outcome = roll(node("4d6kh3"), loaded(2, 6, 1, 5));
  assert.ok(Math.abs((averageDie(outcome.groups) ?? 0) - 13 / 3) < 1e-9);
  assert.equal(averageDie([]), null);
});
