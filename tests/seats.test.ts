import test from "node:test";
import assert from "node:assert/strict";

import { takeSeat, seatOf, isOpenTable, canPlay, turnHint } from "../src/lib/seats.ts";

type Two = "blue" | "red";
const empty = (): Record<Two, string | null> => ({ blue: null, red: null });

test("sitting down claims a chair, and only an empty one", () => {
  const seats = takeSeat(empty(), "blue", "ana");
  assert.deepEqual(seats, { blue: "ana", red: null });

  // Someone else's chair does not budge.
  assert.deepEqual(takeSeat(seats, "blue", "bea"), seats);
});

test("clicking your own chair stands you back up", () => {
  const seated = takeSeat(empty(), "red", "ana");
  assert.deepEqual(takeSeat(seated, "red", "ana"), { blue: null, red: null });
});

test("a person cannot hold two chairs at once", () => {
  const first = takeSeat(empty(), "blue", "ana");
  const moved = takeSeat(first, "red", "ana");
  assert.deepEqual(moved, { blue: null, red: "ana" }, "the old chair is freed");
  assert.equal(seatOf(moved, "ana"), "red");
  assert.equal(seatOf(moved, "bea"), null);
});

test("an empty table lets whoever holds the device play both sides", () => {
  const seats = empty();
  assert.equal(isOpenTable(seats), true);
  assert.equal(canPlay(seats, "blue", "ana"), true);
  assert.equal(canPlay(seats, "red", "ana"), true, "same person, other side");
});

test("once someone sits, turns belong to the chairs", () => {
  const seats = takeSeat(empty(), "blue", "ana");
  assert.equal(isOpenTable(seats), false);
  assert.equal(canPlay(seats, "blue", "ana"), true);
  assert.equal(canPlay(seats, "red", "ana"), false, "not ana's side");
  assert.equal(canPlay(seats, "red", "bea"), false, "bea has not sat down");
});

test("the hint says what to do with the device", () => {
  const label = (s: Two) => s;
  assert.match(turnHint(empty(), "blue", "ana", label), /pass it over/);

  const seated = takeSeat(empty(), "blue", "ana");
  assert.equal(turnHint(seated, "blue", "ana", label), "your go");
  assert.equal(turnHint(seated, "blue", "bea", label), "ana is thinking");
  assert.match(turnHint(seated, "red", "ana", label), /chair is open/);
});
