import test from "node:test";
import assert from "node:assert/strict";

import { EMOJI_GROUPS, allEmoji, emojiIn, fold, searchEmoji } from "../src/lib/emoji.ts";

test("the whole list parses, and every row has a character and a name", () => {
  const all = allEmoji();
  assert.ok(all.length > 1500, `only ${all.length} emoji came through`);

  for (const emoji of all) {
    assert.ok(emoji.char.length > 0, "an empty character got in");
    assert.ok(emoji.name.length > 0, `${emoji.char} has no name`);
    assert.ok(!emoji.char.includes(" "), `${emoji.name} kept a space in its character`);
    assert.ok(EMOJI_GROUPS.includes(emoji.group));
  }
});

test("nothing is listed twice", () => {
  const chars = allEmoji().map((emoji) => emoji.char);
  assert.equal(new Set(chars).size, chars.length);
});

test("every group has something in it", () => {
  for (const group of EMOJI_GROUPS) {
    assert.ok(emojiIn(group).length > 20, `${group} is nearly empty`);
  }
});

test("searching finds the obvious thing first", () => {
  assert.equal(searchEmoji("grinning face")[0].char, "😀");
  assert.equal(searchEmoji("rocket")[0].char, "🚀");
  assert.equal(searchEmoji("pizza")[0].char, "🍕");
});

test("a whole word beats the start of a longer one", () => {
  // "fire" also starts firecracker, fire engine and fire extinguisher.
  assert.equal(searchEmoji("fire")[0].char, "🔥");
});

test("it answers to Portuguese", () => {
  const pt: Array<[string, string]> = [
    ["fogo", "🔥"],
    ["coracao", "❤️"],
    ["festa", "🎉"],
    ["joinha", "👍"],
    ["palmas", "👏"],
    ["risada", "😂"],
    ["brasil", "🇧🇷"],
  ];
  for (const [term, char] of pt) {
    const found = searchEmoji(term);
    assert.ok(
      found.some((emoji) => emoji.char === char),
      `"${term}" did not turn up ${char}`,
    );
  }
});

test("accents are optional either way", () => {
  assert.equal(fold("coração"), "coracao");
  assert.deepEqual(
    searchEmoji("coração").map((e) => e.char),
    searchEmoji("coracao").map((e) => e.char),
  );
});

test("an empty search matches nothing rather than everything", () => {
  assert.deepEqual(searchEmoji(""), []);
  assert.deepEqual(searchEmoji("   "), []);
});

test("nonsense comes back empty instead of throwing", () => {
  assert.deepEqual(searchEmoji("qqqzzzxx"), []);
});

test("the limit is honoured", () => {
  // "face" matches well over a hundred of them.
  assert.equal(searchEmoji("face", 10).length, 10);
  assert.ok(searchEmoji("face").length > 10);
});
