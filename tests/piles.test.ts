import test from "node:test";
import assert from "node:assert/strict";
import { handsOwed, keepTableState, ownedSignature, ownedSlots, type PileMeta } from "../src/lib/piles.ts";

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

test("a deck is never handed over, however it is named", () => {
  assert.deepEqual(handsOwed({ deck: { owner: "me", size: 3, at: 0, sealed: false } }, "me", { deck: "x" }), []);
  assert.deepEqual(handsOwed({ "stack:abc123": { owner: "me", size: 1, at: 0, sealed: false } }, "me", { s0: "x" }), []);
});

test("a role card or a vote goes with the chair, like a hand", () => {
  const roles = {
    "role:s1": { owner: "dealer", size: 1, at: 0, sealed: false },
    "vote:s1": { owner: "dealer", size: 0, at: 0, sealed: true },
  };
  assert.deepEqual(handsOwed(roles, "dealer", { s1: "carol" }), [
    ["role:s1", "carol"],
    ["vote:s1", "carol"],
  ]);
});

test("which piles are mine, and when to read them again", () => {
  assert.deepEqual(ownedSlots(meta, "dealer"), ["hand:s0", "hand:s1"]);
  const before = ownedSignature(meta, "dealer");
  const after = ownedSignature({ ...meta, "hand:s0": { ...meta["hand:s0"], size: 8, at: 2 } }, "dealer");
  assert.notEqual(before, after);
  assert.equal(ownedSignature(meta, "carol"), "", "nothing of carol's, nothing to read");
});

test("a save shows with the database's piles and reveals, as the database will keep them", () => {
  const live = { turn: "s0", piles: { draw: { size: 3 } }, revealed: { draw: [1] }, tested: [{ found: false }] };
  assert.deepEqual(keepTableState(live, { turn: "s1", revealed: { draw: [99] } }), {
    turn: "s1",
    piles: { draw: { size: 3 } },
    revealed: { draw: [1] },
    tested: [{ found: false }],
  });
  assert.deepEqual(keepTableState({ turn: "s0" }, { turn: "s1", revealed: { draw: [99] } }), { turn: "s1" }, "nothing to forge from");
  assert.deepEqual(keepTableState({ revealed: true }, { round: 2 }), { round: 2 }, "an old boolean can go");
});
