import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_COUNT, MAX_LINES, drop, give, put, readBag, rename, setCount, total } from "../src/lib/inventory.ts";

test("the same thing twice is one line with a bigger number", () => {
  let bag = put([], "Rope", 1, "a");
  bag = put(bag, "  rope ", 2, "b");
  bag = put(bag, "Torch", 3, "c");
  assert.deepEqual(bag, [
    { id: "a", name: "Rope", count: 3 },
    { id: "c", name: "Torch", count: 3 },
  ]);
  assert.equal(total(bag), 6);
  assert.deepEqual(put(bag, "   ", 1), bag, "nothing by no name");
});

test("counts stay sensible, and none left takes the line away", () => {
  let bag = put([], "gold", 5, "g");
  bag = setCount(bag, "g", MAX_COUNT + 50);
  assert.equal(bag[0].count, MAX_COUNT);
  bag = setCount(bag, "g", 0);
  assert.deepEqual(bag, []);
});

test("renaming onto something already carried merges the two", () => {
  let bag = put(put([], "potion", 2, "p"), "elixir", 1, "e");
  bag = rename(bag, "e", "Potion");
  assert.deepEqual(bag, [{ id: "p", name: "potion", count: 3 }]);
  assert.deepEqual(rename(bag, "p", ""), bag, "a blank name is ignored");
});

test("giving moves some across, and never more than there is", () => {
  const from = put([], "arrow", 3, "a");
  const once = give(from, [], "a", 2);
  assert.deepEqual(once.from, [{ id: "a", name: "arrow", count: 1 }]);
  assert.equal(once.to[0].name, "arrow");
  assert.equal(once.to[0].count, 2);
  const all = give(once.from, once.to, "a", 10);
  assert.deepEqual(all.from, []);
  assert.equal(all.to[0].count, 3);
  assert.deepEqual(drop(all.to, all.to[0].id), []);
});

test("a saved bag is read back carefully", () => {
  const raw = [{ id: "a", name: "ok", count: 2 }, { id: "b", name: "", count: 1 }, { nope: true }, { id: "c", name: "neg", count: -3 }, "junk"];
  assert.deepEqual(readBag(raw), [{ id: "a", name: "ok", count: 2 }]);
  assert.deepEqual(readBag(undefined), []);
  const many = Array.from({ length: MAX_LINES + 5 }, (_, i) => ({ id: `${i}`, name: `x${i}`, count: 1 }));
  assert.equal(readBag(many).length, MAX_LINES);
});
