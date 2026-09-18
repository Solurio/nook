import test from "node:test";
import assert from "node:assert/strict";
import { handsOwed, ownedSignature, ownedSlots, type PileMeta } from "../src/lib/piles.ts";

const meta: PileMeta = {
  "hand:s0": { owner: "dealer", size: 7, at: 1, sealed: false },
  "hand:s1": { owner: "dealer", size: 7, at: 1, sealed: false },
  "hand:s2": { owner: "bob", size: 7, at: 1, sealed: false },
  boneyard: { owner: null, size: 7, at: 1, sealed: false },
};

test("a hand dealt to an empty chair is owed to whoever sits in it", () => {
  assert.deepEqual(handsOwed(meta, "dealer", { s0: null, s1: "carol", s2: "bob" }), [["hand:s1", "carol"]]);
});

test("nothing is owed while the chair is empty, or when it is your own", () => {
  assert.deepEqual(handsOwed(meta, "dealer", { s0: "dealer", s1: null }), []);
});

test("a device only hands over what it owns", () => {
  assert.deepEqual(handsOwed(meta, "bob", { s0: "carol", s1: "carol", s2: "bob" }), []);
});

test("only hands are handed over, never a deck", () => {
  assert.deepEqual(handsOwed({ deck: { owner: "me", size: 3, at: 0, sealed: false } }, "me", { deck: "x" }), []);
});

test("which piles are mine, and when to read them again", () => {
  assert.deepEqual(ownedSlots(meta, "dealer"), ["hand:s0", "hand:s1"]);
  const before = ownedSignature(meta, "dealer");
  const after = ownedSignature({ ...meta, "hand:s0": { ...meta["hand:s0"], size: 8, at: 2 } }, "dealer");
  assert.notEqual(before, after);
  assert.equal(ownedSignature(meta, "carol"), "", "nothing of carol's, nothing to read");
});
