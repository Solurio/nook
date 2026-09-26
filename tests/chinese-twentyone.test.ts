import { test } from "node:test";
import assert from "node:assert/strict";
import { HOLES, PLAYING, cornerOf, home, hole, move, opposite, pointOf, reach, setUp, stuck, type Corner } from "../src/lib/chinese.ts";
import { afterHit, afterStand, canDouble, emptyTwentyOne, newRound, settle, total, upKey, type TwentyOneState } from "../src/lib/twentyone.ts";

// ---------------------------------------------------------------------------
// Chinese checkers
// ---------------------------------------------------------------------------

test("the star has 121 holes and six points of ten", () => {
  assert.equal(HOLES.length, 121);
  for (const c of ["c0", "c1", "c2", "c3", "c4", "c5"] as Corner[]) assert.equal(pointOf(c).length, 10, c);
  assert.equal(HOLES.filter((h) => cornerOf(h) === null).length, 61);
});

test("three players take every other point, facing empty ones", () => {
  const s = setUp(3);
  assert.equal(Object.keys(s.board).length, 30);
  for (const c of PLAYING[3]) assert.ok(!PLAYING[3].includes(opposite(c)));
});

test("a marble steps next door, or hops over another and on", () => {
  const board: Record<string, Corner> = { [hole(0, 0)]: "c0", [hole(1, 0)]: "c3", [hole(3, 0)]: "c3" };
  const ways = reach(board, hole(0, 0));
  assert.ok(ways.has(hole(0, 1)), "a step");
  assert.deepEqual(ways.get(hole(2, 0)), [hole(2, 0)], "a hop");
  assert.deepEqual(ways.get(hole(4, 0)), [hole(2, 0), hole(4, 0)], "and a second hop from there");
  assert.ok(!ways.has(hole(1, 0)), "never onto a marble");
});

test("a move passes the turn round, and filling the far point wins", () => {
  const s = setUp(2);
  const from = pointOf("c0").find((h) => reach(s.board, h).size > 0)!;
  const [to] = [...reach(s.board, from).keys()];
  const next = move(s, from, to);
  assert.equal(next.turn, "c3");
  assert.equal(move(next, from, to), next, "a marble that is not theirs does not move");

  const board: Record<string, Corner> = {};
  const far = pointOf(opposite("c0"));
  far.slice(0, 9).forEach((h) => (board[h] = "c0"));
  const last = far[9];
  const [q, r] = last.split(",").map(Number);
  const beside = [hole(q, r - 1), hole(q + 1, r - 1), hole(q - 1, r)].find((h) => HOLES.includes(h) && !board[h])!;
  board[beside] = "c0";
  const won = move({ ...setUp(2), board, turn: "c0" }, beside, last);
  assert.ok(home(won.board, "c0"));
  assert.equal(won.winner, "c0");
});

test("a player with nothing to move is stuck", () => {
  const s = { ...setUp(2), board: {} as Record<string, Corner> };
  assert.ok(stuck(s));
});

// ---------------------------------------------------------------------------
// Twenty-one
// ---------------------------------------------------------------------------

const name = (s: string) => s;

test("aces count eleven until that would bust", () => {
  assert.equal(total(["AS", "KD"]), 21);
  assert.equal(total(["AS", "AH", "9C"]), 21);
  assert.equal(total(["AS", "KD", "5H"]), 16);
  assert.equal(total(["10S", "QD", "2H"]), 22);
});

function table(up: Record<string, string>, extra: Partial<TwentyOneState> = {}): TwentyOneState {
  const base = newRound(emptyTwentyOne(), name);
  return { ...base, shown: { a: 1, b: 1 }, revealed: Object.fromEntries(Object.entries(up).map(([k, v]) => [k, [v]])), ...extra };
}

test("going over on the cards showing ends the round at once", () => {
  const s = table({ [upKey("b", 0)]: "KD", [upKey("b", 1)]: "QS", [upKey("b", 2)]: "5H", [upKey("a", 0)]: "3C" }, { turn: "b", shown: { a: 1, b: 2 } });
  const next = afterHit(s, "b", name);
  assert.equal(next.phase, "showdown");
});

test("standing passes the go, and both standing turns the cards over", () => {
  const s = table({ [upKey("a", 0)]: "3C", [upKey("b", 0)]: "4C" }, { turn: "b" });
  const one = afterStand(s, "b", name);
  assert.equal(one.turn, "a");
  const both = afterStand(one, "a", name);
  assert.equal(both.phase, "showdown");
});

test("the closer hand takes the pot; 21 in two beats 21 in three", () => {
  const s = table(
    { [upKey("a", 0)]: "KD", "hole:a": "AS", [upKey("b", 0)]: "7C", [upKey("b", 1)]: "7D", "hole:b": "7H" },
    { phase: "showdown", shown: { a: 1, b: 2 }, stake: 2 },
  );
  const done = settle(s, name);
  assert.equal(done.result?.winner, "a");
  assert.equal(done.chips.a, 22);
  assert.equal(done.chips.b, 18);
});

test("a hidden bust loses, both bust is a push, and running out ends the match", () => {
  const hiddenBust = table({ [upKey("a", 0)]: "KD", [upKey("a", 1)]: "5D", "hole:a": "QS", [upKey("b", 0)]: "2C", "hole:b": "3C" }, { phase: "showdown", shown: { a: 2, b: 1 } });
  assert.equal(settle(hiddenBust, name).result?.winner, "b");
  const push = settle(table({ [upKey("a", 0)]: "KD", "hole:a": "QS", [upKey("b", 0)]: "KC", "hole:b": "QC" }, { phase: "showdown" }), name);
  assert.equal(push.result?.winner, null, "20 each is nobody's");
  assert.deepEqual(push.chips, { a: 20, b: 20 });
  const broke = settle(table({ [upKey("a", 0)]: "KD", "hole:a": "9S", [upKey("b", 0)]: "2C", "hole:b": "3C" }, { phase: "showdown", chips: { a: 5, b: 1 } }), name);
  assert.equal(broke.matchWinner, "a");
});

test("doubling needs the chips to cover it, and only once", () => {
  const s = table({ [upKey("a", 0)]: "3C", [upKey("b", 0)]: "4C" }, { turn: "a" });
  assert.ok(canDouble(s, "a"));
  assert.ok(!canDouble({ ...s, doubled: "b" }, "a"));
  assert.ok(!canDouble({ ...s, chips: { a: 1, b: 20 } }, "a"));
});
