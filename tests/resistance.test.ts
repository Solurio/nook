import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_REJECTIONS,
  MAX_SEATS,
  MIN_SEATS,
  MISSIONS,
  dealSpies,
  missionSucceeded,
  needsTwoFails,
  spyCount,
  teamSize,
  verdict,
  voteCarries,
  voteIsIn,
} from "../src/lib/resistance.ts";

const chairs = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

test("the spies are a minority at every table size", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const spies = spyCount(players);
    assert.ok(spies * 2 < players, `${players} players had ${spies} spies`);
  }
  assert.equal(spyCount(5), 2);
  assert.equal(spyCount(6), 2);
  assert.equal(spyCount(7), 3);
  assert.equal(spyCount(9), 3);
  assert.equal(spyCount(10), 4);
});

test("a mission never needs more people than there are", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    for (let mission = 0; mission < MISSIONS; mission += 1) {
      const size = teamSize(players, mission);
      assert.ok(size >= 2 && size <= players, `${players}p mission ${mission + 1} sends ${size}`);
    }
  }
  assert.deepEqual(
    Array.from({ length: MISSIONS }, (_, m) => teamSize(5, m)),
    [2, 3, 2, 3, 3],
  );
  assert.deepEqual(
    Array.from({ length: MISSIONS }, (_, m) => teamSize(10, m)),
    [3, 4, 4, 5, 5],
  );
});

test("the fourth mission takes two saboteurs at a big table", () => {
  assert.equal(needsTwoFails(5, 3), false);
  assert.equal(needsTwoFails(6, 3), false);
  assert.equal(needsTwoFails(7, 3), true);
  assert.equal(needsTwoFails(10, 3), true);
  assert.equal(needsTwoFails(10, 2), false, "only the fourth");

  assert.equal(missionSucceeded(5, 3, 1), false, "one is enough at five players");
  assert.equal(missionSucceeded(7, 3, 1), true, "one is not enough at seven");
  assert.equal(missionSucceeded(7, 3, 2), false);
  assert.equal(missionSucceeded(7, 0, 1), false, "any other mission falls to one");
});

test("the spies dealt are the right number and all different people", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const seats = chairs(players);
    const spies = dealSpies(seats);
    assert.equal(spies.length, spyCount(players));
    assert.equal(new Set(spies).size, spies.length);
    for (const spy of spies) assert.ok(seats.includes(spy));
  }
});

test("it is not the same people every game", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) seen.add(dealSpies(chairs(5)).join(","));
  assert.ok(seen.size > 1, "the deal never moved");
});

test("three missions settles it either way", () => {
  assert.equal(verdict([], 0), null);
  assert.equal(verdict([true, false, true], 0), null);
  assert.equal(verdict([true, true, true], 0), "resistance");
  assert.equal(verdict([false, false, false], 0), "spies");
  assert.equal(verdict([true, false, true, false, true], 0), "resistance");
});

test("a table that agrees on nobody hands it to the spies", () => {
  assert.equal(verdict([], MAX_REJECTIONS - 1), null);
  assert.equal(verdict([], MAX_REJECTIONS), "spies");
});

test("it takes a majority to send a team out", () => {
  const five = chairs(5);
  const all = (yes: number) =>
    Object.fromEntries(five.map((chair, i) => [chair, i < yes])) as Record<string, boolean>;

  assert.equal(voteCarries(all(3), five), true);
  assert.equal(voteCarries(all(2), five), false);

  const six = chairs(6);
  const split = Object.fromEntries(six.map((chair, i) => [chair, i < 3]));
  assert.equal(voteCarries(split, six), false, "a dead heat is a refusal");
});

test("the vote waits for everyone, including the people who abstained by not voting", () => {
  const five = chairs(5);
  assert.equal(voteIsIn({ s0: true, s1: false }, five), false);
  assert.equal(
    voteIsIn({ s0: true, s1: false, s2: true, s3: true, s4: false }, five),
    true,
  );
});
