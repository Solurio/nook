import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SLICES,
  addSlice,
  arcs,
  chance,
  editSlice,
  emptyWheel,
  inPlay,
  pick,
  putBack,
  removeSlice,
  settle,
  spin,
  under,
  type WheelState,
} from "../src/lib/wheel.ts";
import { emptyCoin, faceLabel, flip, streak } from "../src/lib/coin.ts";

const weighted = (): WheelState => {
  let state = emptyWheel();
  state = { ...state, slices: [] };
  state = addSlice(state, "a", "pizza");
  state = addSlice(state, "b", "sushi");
  state = editSlice(state, "b", { weight: 3 });
  return state;
};

test("a slice is drawn as big as its chance", () => {
  const [a, b] = arcs(weighted().slices);
  assert.equal(a.end - a.start, 90);
  assert.equal(b.end - b.start, 270);
  assert.equal(chance(weighted().slices, "b"), 0.75);
});

test("the pick follows the weights exactly", () => {
  const counts = { a: 0, b: 0 };
  // Every ticket in the hat once: one for pizza, three for sushi.
  for (let ticket = 0; ticket < 4; ticket += 1) {
    const slice = pick(weighted().slices, () => ticket);
    counts[slice?.id as "a" | "b"] += 1;
  }
  assert.deepEqual(counts, { a: 1, b: 3 });
});

test("the wheel stops with the pointer on the slice it picked", () => {
  let state = weighted();
  for (let i = 0; i < 300; i += 1) {
    const before = state.angle;
    state = spin(state, "ana", `s${i}`, i);
    assert.ok(state.angle > before + 4 * 360 - 1, "it went round a few times");
    assert.equal(under(state.slices, state.angle)?.id, state.spin?.slice, `spin ${i} landed wrong`);
  }
});

test("over many spins the heavy slice comes up about as often as it should", () => {
  let state = weighted();
  let sushi = 0;
  for (let i = 0; i < 4000; i += 1) {
    state = spin(state, "ana", `s${i}`, i);
    if (state.spin?.slice === "b") sushi += 1;
  }
  assert.ok(Math.abs(sushi / 4000 - 0.75) < 0.04, `sushi came up ${sushi / 40}%`);
});

test("winners can sit out, but the wheel is never left empty", () => {
  let state = { ...weighted(), removeWinners: true };
  state = settle(spin(state, "ana", "s1", 1, (max) => (max === 4 ? 0 : 0)));
  assert.equal(inPlay(state.slices).length, 1);
  state = settle(spin(state, "ana", "s2", 2));
  assert.equal(inPlay(state.slices).length, 1, "the last slice stays");
  assert.equal(inPlay(putBack(state).slices).length, 2);
});

test("editing keeps weights and labels in bounds", () => {
  let state = weighted();
  state = editSlice(state, "a", { weight: 0 });
  assert.equal(state.slices[0].weight, 1);
  state = editSlice(state, "a", { weight: 1000 });
  assert.equal(state.slices[0].weight, 99);
  state = editSlice(state, "a", { label: "x".repeat(80) });
  assert.equal(state.slices[0].label.length, 24);
  assert.equal(removeSlice(removeSlice(state, "a"), "b").slices.length, 1, "one slice always stays");
  let full = weighted();
  for (let i = 0; i < 40; i += 1) full = addSlice(full, `n${i}`);
  assert.equal(full.slices.length, MAX_SLICES);
});

test("a coin comes down on one side or the other, and remembers the run", () => {
  let coin = emptyCoin();
  coin = flip(coin, "ana", "f1", 1, () => 0);
  coin = flip(coin, "ana", "f2", 2, () => 0);
  coin = flip(coin, "bo", "f3", 3, (max) => (max === 2 ? 1 : 0));
  assert.deepEqual(coin.tally, { heads: 2, tails: 1 });
  assert.deepEqual(streak(coin.flips), { side: "tails", length: 1 });
  assert.deepEqual(streak(coin.flips.slice(1)), { side: "heads", length: 2 });
  assert.equal(streak([]), null);
});

test("a coin is roughly fair", () => {
  let coin = emptyCoin();
  for (let i = 0; i < 4000; i += 1) coin = flip(coin, "ana", `f${i}`, i);
  assert.ok(Math.abs(coin.tally.heads / 4000 - 0.5) < 0.04);
  assert.equal(coin.flips.length, 24);
});

test("a face says what it was given, or what side it is", () => {
  assert.equal(faceLabel("  yes  ", "heads"), "yes");
  assert.equal(faceLabel("", "tails"), "tails");
  assert.equal(faceLabel("a very long name", "heads").length, 10);
});
