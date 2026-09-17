import test from "node:test";
import assert from "node:assert/strict";

import { relayer } from "../src/lib/items.ts";
import type { AnyItem } from "../src/lib/types.ts";

const stack = (zs: number[]): AnyItem[] =>
  zs.map((z, i) => ({ id: `i${i}`, z }) as AnyItem);

test("bringing to the front puts it above everything", () => {
  const items = stack([1, 5, 3]);
  assert.deepEqual(relayer(items, "i0", "front"), [{ id: "i0", z: 6 }]);
});

test("sending to the back puts it below everything", () => {
  const items = stack([1, 5, 3]);
  assert.deepEqual(relayer(items, "i1", "back"), [{ id: "i1", z: 0 }]);
});

test("already on top, asking again writes nothing", () => {
  const items = stack([1, 5, 3]);
  assert.deepEqual(relayer(items, "i1", "front"), [], "no pointless write");
  assert.deepEqual(relayer(items, "i0", "back"), []);
});

test("stepping one place trades with the neighbour, keeping the run in order", () => {
  const items = stack([1, 2, 3]);

  // i0 forward swaps with i1, so the order becomes i1, i0, i2.
  assert.deepEqual(relayer(items, "i0", "forward"), [
    { id: "i0", z: 2 },
    { id: "i1", z: 1 },
  ]);

  // i2 backward swaps with i1.
  assert.deepEqual(relayer(items, "i2", "backward"), [
    { id: "i2", z: 2 },
    { id: "i1", z: 3 },
  ]);
});

test("a step past a far neighbour lands on that neighbour, not one above it", () => {
  // The gap between 1 and 90 must not become 91: forward means one place.
  const items = stack([1, 90]);
  assert.deepEqual(relayer(items, "i0", "forward"), [
    { id: "i0", z: 90 },
    { id: "i1", z: 1 },
  ]);
});

test("nothing above means forward does nothing", () => {
  const items = stack([4]);
  assert.deepEqual(relayer(items, "i0", "forward"), []);
  assert.deepEqual(relayer(items, "i0", "backward"), []);
});

test("items tied on the same layer are nudged apart rather than swapped", () => {
  const items = stack([2, 2]);
  assert.deepEqual(relayer(items, "i0", "forward"), [{ id: "i0", z: 3 }]);
  assert.deepEqual(relayer(items, "i1", "backward"), [{ id: "i1", z: 1 }]);
});

test("an item that is not there is left alone", () => {
  assert.deepEqual(relayer(stack([1]), "nope", "front"), []);
});
