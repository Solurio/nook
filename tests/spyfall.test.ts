import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SECONDS,
  MAX_SEATS,
  MIN_SEATS,
  PLACES,
  clock,
  deal,
  remaining,
} from "../src/lib/spyfall.ts";

const chairs = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

test("every place has a name and enough jobs to go round", () => {
  for (const pack of ["en", "pt"] as const) {
    assert.ok(PLACES[pack].length >= 12, `${pack} is a thin list`);
    for (const place of PLACES[pack]) {
      assert.ok(place.name.length > 0);
      assert.ok(place.roles.length >= 6, `${place.name} has too few jobs`);
      assert.equal(new Set(place.roles).size, place.roles.length, `${place.name} repeats a job`);
    }
    const names = PLACES[pack].map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${pack} lists a place twice`);
  }
});

test("one person is told nothing and everybody else has a job", () => {
  for (let players = MIN_SEATS; players <= MAX_SEATS; players += 1) {
    const seats = chairs(players);
    const round = deal(seats, "en");

    assert.ok(seats.includes(round.spy));
    assert.equal(round.roles[round.spy], undefined, "the spy holds no job");
    for (const chair of seats) {
      if (chair === round.spy) continue;
      assert.ok(round.roles[chair], `${chair} was told nothing`);
    }
    assert.equal(Object.keys(round.roles).length, players - 1);
  }
});

test("the place is one from the pack that was asked for", () => {
  const round = deal(chairs(6), "pt");
  assert.ok(round.location >= 0 && round.location < PLACES.pt.length);
  const place = PLACES.pt[round.location];
  for (const chair of Object.keys(round.roles)) {
    assert.ok(place.roles.includes(round.roles[chair]), `${round.roles[chair]} is not from here`);
  }
});

test("a table bigger than the place doubles a job rather than leaving someone blank", () => {
  // Every place has seven jobs, so twelve players means five of them repeat.
  const round = deal(chairs(12), "en");
  const given = Object.values(round.roles);
  assert.equal(given.length, 11);
  assert.ok(given.every((role) => role.length > 0));
});

test("the spy is not always the first chair", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i += 1) seen.add(deal(chairs(5), "en").spy);
  assert.ok(seen.size > 1, "the same person kept getting it");
});

test("the clock starts full and runs down", () => {
  assert.equal(remaining(null, DEFAULT_SECONDS, 1_000), DEFAULT_SECONDS);
  assert.equal(remaining(1_000, 480, 1_000), 480);
  assert.equal(remaining(1_000, 480, 61_000), 420, "a minute gone");
  assert.equal(remaining(1_000, 480, 9_999_999), 0, "never runs past zero");
});

test("stopping the clock hands back exactly what was left", () => {
  // Start with 480, run it for 37 seconds, stop: the banked number is what the
  // face was showing, not a rounded minute.
  const left = remaining(1_000, 480, 38_000);
  assert.equal(left, 443);
  assert.equal(remaining(null, left, 999_999), 443, "a stopped clock stays put");
});

test("the clock reads the way a clock reads", () => {
  assert.equal(clock(480), "8:00");
  assert.equal(clock(65), "1:05");
  assert.equal(clock(9), "0:09");
  assert.equal(clock(0), "0:00");
});
