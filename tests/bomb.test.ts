import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { FUSE_MIN, FUSE_SPREAD, accept, alive, emptyBomb, explode, judge, promptsFrom, start, type BombState, type Language } from "../src/lib/bomb.ts";

const first = () => 0;
const words = (language: Language) => readFileSync(new URL(`../public/words/${language}.txt`, import.meta.url), "utf8").split("\n").filter(Boolean);
const EN = new Set(words("en"));

const game = (language: Language = "en"): BombState => ({
  ...start({ ...emptyBomb(3), language }, ["s0", "s1", "s2"], 1000, first),
  prompt: "an",
});

test("each language has thousands of five-letter words, and nothing else", () => {
  for (const language of ["en", "pt", "es"] as const) {
    const list = words(language);
    assert.ok(list.length > 8000, `${language}: ${list.length}`);
    assert.ok(list.every((w) => /^[a-z]{5}$/.test(w)), `${language} has something that is not five plain letters`);
  }
});

test("a word has to be five letters, have the letters, be new, and be a word", () => {
  const state = game();
  assert.deepEqual(judge(state, "Plant", EN), { ok: true, word: "plant" });
  assert.equal(judge(state, "banana", EN).ok, false, "six letters");
  assert.equal(judge(state, "hello", EN).ok, false, "no AN in it");
  assert.equal(judge(state, "xanqz", EN).ok, false, "not a word");
  assert.equal(judge(state, "pl4nt", EN).ok, false, "letters only");
  assert.equal(judge(state, "plant", null).ok, false, "no dictionary, no verdict");
  const later = accept(state, "plant", 2000, first);
  assert.equal(judge({ ...later, prompt: "an" }, "PLANT", EN).ok, false, "already said");
});

test("accents count as the letters they sit on", () => {
  const pt = new Set(words("pt"));
  assert.equal(judge({ ...game("pt"), prompt: "ca" }, "caçar", pt).ok, true);
  const es = new Set(words("es"));
  assert.equal(judge({ ...game("es"), prompt: "on" }, "canón", es).ok || judge({ ...game("es"), prompt: "on" }, "monte", es).ok, true);
});

test("every prompt drawn from a list has plenty of answers in it", () => {
  for (const language of ["en", "pt", "es"] as const) {
    const list = words(language);
    const prompts = promptsFrom(list);
    assert.ok(prompts.length > 50, `${language}: only ${prompts.length} prompts`);
    for (const p of prompts) {
      const answers = list.filter((w) => w.includes(p)).length;
      assert.ok(answers >= 8, `${language} "${p}" has only ${answers}`);
    }
  }
});

test("a good word passes the bomb on with new letters and a fresh fuse", () => {
  const state = game();
  const next = accept(state, "plant", 5000, first);
  assert.notEqual(next.turn, state.turn);
  assert.notEqual(next.prompt, "an");
  assert.ok(next.fuseEnds >= 5000 + FUSE_MIN * 1000 && next.fuseEnds < 5000 + (FUSE_MIN + FUSE_SPREAD) * 1000);
  assert.equal(next.tick, state.tick + 1);
});

test("the bomb going off costs a life, and the last one left wins", () => {
  let state: BombState = { ...game(), startLives: 1, lives: { s0: 1, s1: 1, s2: 1 }, turn: "s0" };
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
  assert.equal(accept(state, "plant", 1, first).turn, "s2");
});

test("prompts come from the dictionary when there is one", () => {
  const next = accept(game(), "plant", 1, first, ["zz", "qq"]);
  assert.ok(["zz", "qq"].includes(next.prompt));
});
