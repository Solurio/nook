import { test } from "node:test";
import assert from "node:assert/strict";
import { keepItemFlags } from "../src/lib/items.ts";

test("a game's save keeps the item pinned and tied, unless it says otherwise", () => {
  const live = { game: "war", state: { a: 1 }, pinned: true, group: "g1" };
  assert.deepEqual(keepItemFlags(live, { game: "war", state: { a: 2 } }), { game: "war", state: { a: 2 }, pinned: true, group: "g1" });
  assert.deepEqual(keepItemFlags(live, { ...live, pinned: false }), { ...live, pinned: false });
  assert.deepEqual(keepItemFlags(live, { game: "war", state: {}, group: null }), { game: "war", state: {}, pinned: true });
  assert.deepEqual(keepItemFlags(undefined, { body: "x" }), { body: "x" });
});
