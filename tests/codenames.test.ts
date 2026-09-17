import test from "node:test";
import assert from "node:assert/strict";

import {
  newSetup,
  outcome,
  remaining,
  guessResult,
  PACKS,
  GRID,
  type Slot,
  type Team,
} from "../src/lib/codenames.ts";

test("both word packs are big enough to keep games fresh", () => {
  for (const [name, words] of Object.entries(PACKS)) {
    assert.ok(words.length >= GRID * 3, `${name} pack is thin: ${words.length}`);
    assert.equal(new Set(words).size, words.length, `${name} pack repeats a word`);
  }
});

test("a setup deals twenty five words with the right key behind them", () => {
  const setup = newSetup("en");

  assert.equal(setup.words.length, GRID);
  assert.equal(new Set(setup.words).size, GRID, "no word appears twice on the table");
  assert.equal(setup.key.length, GRID);

  const count = (slot: Slot) => setup.key.filter((s) => s === slot).length;
  const second: Team = setup.first === "red" ? "blue" : "red";

  assert.equal(count(setup.first), 9, "the side that starts gets the extra card");
  assert.equal(count(second), 8);
  assert.equal(count("neutral"), 7);
  assert.equal(count("assassin"), 1);
});

test("the key is not laid out the same way every time", () => {
  const shapes = new Set<string>();
  for (let i = 0; i < 20; i += 1) shapes.add(newSetup("pt").key.join(""));
  assert.ok(shapes.size > 1, "the key never moved");
});

test("the portuguese pack is used when asked for", () => {
  const setup = newSetup("pt");
  for (const word of setup.words) {
    assert.ok(PACKS.pt.includes(word), `${word} is not from the portuguese pack`);
  }
});

test("turning your own word over lets you keep going", () => {
  assert.equal(guessResult("red", "red"), "continue");
  assert.equal(guessResult("blue", "red"), "handover", "the other team's word ends your turn");
  assert.equal(guessResult("neutral", "red"), "handover");
  assert.equal(guessResult("assassin", "red"), "lost");
});

test("clearing your words wins it", () => {
  const key: Slot[] = ["red", "red", "blue", "neutral", "assassin"];
  const revealed = [true, true, false, false, false];

  assert.equal(remaining(key, revealed, "red"), 0);
  assert.equal(remaining(key, revealed, "blue"), 1);
  assert.deepEqual(outcome(key, revealed, "red"), {
    kind: "won",
    winner: "red",
    reason: "cleared",
  });
});

test("the assassin hands it straight to the other side", () => {
  const key: Slot[] = ["red", "red", "blue", "neutral", "assassin"];
  const revealed = [false, false, false, false, true];

  assert.deepEqual(outcome(key, revealed, "red"), {
    kind: "won",
    winner: "blue",
    reason: "assassin",
  });
  assert.deepEqual(outcome(key, revealed, "blue"), {
    kind: "won",
    winner: "red",
    reason: "assassin",
  });
});

test("a fresh board is still in play", () => {
  const setup = newSetup("en");
  const revealed = Array(GRID).fill(false);
  assert.deepEqual(outcome(setup.key, revealed, setup.first), { kind: "playing" });
});
