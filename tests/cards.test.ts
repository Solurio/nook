import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDeck,
  shuffle,
  deal,
  readCard,
  cardLabel,
  isJoker,
  teamOf,
  seatIds,
  fullDeckConfig,
  fortyCardConfig,
} from "../src/lib/cards.ts";

test("a full deck is fifty two cards, all different", () => {
  const deck = buildDeck(fullDeckConfig());
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
});

test("dropping ranks shrinks the deck to match", () => {
  const deck = buildDeck(fortyCardConfig());
  assert.equal(deck.length, 40, "truco's forty");
  assert.equal(deck.some((c) => c.startsWith("8")), false);
  assert.equal(deck.some((c) => c.startsWith("9")), false);
  assert.equal(deck.some((c) => c.startsWith("10")), false);
  assert.equal(deck.filter((c) => c === "AS").length, 1);
});

test("jokers and extra copies are included when asked for", () => {
  const withJokers = buildDeck({ ...fullDeckConfig(), jokers: 2 });
  assert.equal(withJokers.length, 54);
  assert.equal(withJokers.filter(isJoker).length, 2);

  const double = buildDeck({ ...fullDeckConfig(), copies: 2 });
  assert.equal(double.length, 104);
  assert.equal(double.filter((c) => c === "AS").length, 2, "two of each");
});

test("a card reads back as its rank and suit", () => {
  assert.deepEqual(readCard("AS"), { rank: "A", suit: "S" });
  assert.deepEqual(readCard("10H"), { rank: "10", suit: "H" }, "two-character rank");
  assert.equal(readCard("JK1"), null);
  assert.equal(cardLabel("QD"), "Q of diamonds");
  assert.equal(cardLabel("JK2"), "joker");
});

test("shuffling keeps every card and only moves them", () => {
  const deck = buildDeck(fullDeckConfig());
  const mixed = shuffle(deck);
  assert.equal(mixed.length, deck.length);
  assert.deepEqual([...mixed].sort(), [...deck].sort(), "same cards");
  assert.deepEqual(deck, buildDeck(fullDeckConfig()), "the original is untouched");
});

test("a pinned shuffle is reproducible", () => {
  const deck = buildDeck(fullDeckConfig());
  const fixed = () => 0.42;
  assert.deepEqual(shuffle(deck, fixed), shuffle(deck, fixed));
});

test("dealing goes one card at a time round the table", () => {
  const deck = ["AS", "2S", "3S", "4S", "5S", "6S", "7S"];
  const { hands, rest } = deal(deck, ["s0", "s1", "s2"], 2);

  assert.deepEqual(hands.s0, ["AS", "4S"], "first and fourth, not the first two");
  assert.deepEqual(hands.s1, ["2S", "5S"]);
  assert.deepEqual(hands.s2, ["3S", "6S"]);
  assert.deepEqual(rest, ["7S"], "what is left stays in the deck");
});

test("dealing more than there is stops rather than inventing cards", () => {
  const { hands, rest } = deal(["AS", "2S"], ["s0", "s1"], 5);
  assert.deepEqual(hands.s0, ["AS"]);
  assert.deepEqual(hands.s1, ["2S"]);
  assert.deepEqual(rest, []);
});

test("partners sit across from each other", () => {
  // Four chairs, two teams: 0,1,0,1 so partners face each other.
  assert.deepEqual([0, 1, 2, 3].map((i) => teamOf(i, 2)), [0, 1, 0, 1]);
  // Six chairs, three teams.
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => teamOf(i, 3)), [0, 1, 2, 0, 1, 2]);
  // Everyone for themselves.
  assert.equal(teamOf(0, 0), null);
});

test("seat ids are made to fit the table", () => {
  assert.deepEqual(seatIds(3), ["s0", "s1", "s2"]);
  assert.equal(seatIds(99).length, 8, "capped");
  assert.equal(seatIds(0).length, 1, "never empty");
});
