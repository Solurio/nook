import test from "node:test";
import assert from "node:assert/strict";

import { FUSE_MIN, FUSE_SPREAD, PROMPTS, accept, alive, emptyBomb, explode, judge, start, type BombState } from "../src/lib/bomb.ts";

const first = () => 0;
const game = (language: BombState["language"] = "en"): BombState => ({
  ...start({ ...emptyBomb(3), language }, ["s0", "s1", "s2"], 1000, first),
  prompt: "an",
});

test("every language has prompts, and none is empty", () => {
  for (const list of Object.values(PROMPTS)) {
    assert.ok(list.length >= 40);
    for (const p of list) assert.ok(p.length >= 2, p);
  }
});

test("a word has to have the letters, be letters, and be new", () => {
  const state = game();
  assert.deepEqual(judge(state, "Banana"), { ok: true, word: "banana" });
  assert.equal(judge(state, "an").ok, false, "too short");
  assert.equal(judge(state, "b4nana").ok, false);
  assert.equal(judge(state, "hello").ok, false, "no AN in it");
  const later = accept(state, "banana", 2000, first);
  assert.equal(judge({ ...later, prompt: "an" }, "BANANA").ok, false, "already said");
});

test("accents count as the letters they sit on", () => {
  const state = { ...game("pt"), prompt: "cao" };
  assert.equal(judge(state, "canção").ok, true);
  assert.equal(judge({ ...game("es"), prompt: "on" }, "canción").ok, true);
});

test("a good word passes the bomb on with new letters and a fresh fuse", () => {
  const state = game();
  const next = accept(state, "banana", 5000, first);
  assert.notEqual(next.turn, state.turn);
  assert.notEqual(next.prompt, "an");
  assert.ok(next.fuseEnds >= 5000 + FUSE_MIN * 1000 && next.fuseEnds < 5000 + (FUSE_MIN + FUSE_SPREAD) * 1000);
  assert.equal(next.tick, state.tick + 1);
});

test("the bomb going off costs a life, and the last one left wins", () => {
  let state = { ...game(), startLives: 1 };
  state = { ...state, lives: { s0: 1, s1: 1, s2: 1 }, turn: "s0" };
  state = explode(state, 3000, first);
  assert.equal(state.lives.s0, 0);
  assert.equal(state.turn, "s1");
  assert.deepEqual(alive(state), ["s1", "s2"]);
  state = explode(state, 4000, first);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "s2");
  assert.equal(state.wins.s2, 1);
});

test("the dead are skipped when the bomb moves on", () => {
  const state = { ...game(), lives: { s0: 2, s1: 0, s2: 2 }, turn: "s0" };
  assert.equal(accept(state, "banana", 1, first).turn, "s2");
});
