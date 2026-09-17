import test from "node:test";
import assert from "node:assert/strict";

import {
  fullDeck,
  newGame,
  legalActions,
  challengeable,
  blockers,
  loseInfluence,
  resolve,
  judge,
  advance,
  isOut,
  alive,
  needsTarget,
  CARDS,
  COPIES,
  MAX_SEATS,
  copiesFor,
  deckSize,
  withSeats,
  COUP_COST,
  FORCED_COUP,
  type CoupState,
  type Card,
} from "../src/lib/coup.ts";

/** A table of `n` players with fixed hands, so the tests are not at the mercy of a shuffle. */
function table(hands: Card[][], coins: number[] = []): CoupState {
  return {
    players: hands.map((cards, i) => ({
      seat: `s${i}`,
      coins: coins[i] ?? 2,
      cards: [...cards],
      lost: [],
    })),
    deck: fullDeck(),
    turn: 0,
    phase: { kind: "act" },
    log: [],
  };
}

test("the deck is three of each of the five cards", () => {
  const deck = fullDeck();
  assert.equal(deck.length, CARDS.length * COPIES);
  for (const card of CARDS) {
    assert.equal(deck.filter((c) => c === card).length, COPIES, `${card} count`);
  }
});

test("a fresh game deals two cards and two coins each", () => {
  const state = newGame(["s0", "s1", "s2"]);
  assert.equal(state.players.length, 3);
  for (const player of state.players) {
    assert.equal(player.cards.length, 2);
    assert.equal(player.coins, 2);
    assert.equal(player.lost.length, 0);
  }
  // Six cards went out, so nine are left.
  assert.equal(state.deck.length, fullDeck().length - 6);
});

test("what you can declare depends on what you can pay for", () => {
  const poor = table([["duke", "captain"], ["contessa", "assassin"]], [0, 3]);
  const actions = legalActions(poor, 0);

  assert.ok(actions.includes("income"));
  assert.ok(actions.includes("foreign_aid"));
  assert.ok(actions.includes("tax"));
  assert.ok(actions.includes("exchange"));
  assert.equal(actions.includes("coup"), false, "seven coins short");
  assert.equal(actions.includes("assassinate"), false, "three coins short");
  assert.ok(actions.includes("steal"), "the other player has coins worth taking");

  const rich = table([["duke", "captain"], ["contessa", "assassin"]], [COUP_COST, 0]);
  const richActions = legalActions(rich, 0);
  assert.ok(richActions.includes("coup"));
  assert.ok(richActions.includes("assassinate"));
  assert.equal(richActions.includes("steal"), false, "nobody has anything to steal");
});

test("ten coins leaves you no choice but a coup", () => {
  const state = table([["duke", "captain"], ["contessa", "assassin"]], [FORCED_COUP, 5]);
  assert.deepEqual(legalActions(state, 0), ["coup"]);
});

test("only the claims can be doubted", () => {
  assert.equal(challengeable("tax"), true);
  assert.equal(challengeable("assassinate"), true);
  assert.equal(challengeable("steal"), true);
  assert.equal(challengeable("exchange"), true);

  assert.equal(challengeable("income"), false, "nobody claims anything to take income");
  assert.equal(challengeable("foreign_aid"), false);
  assert.equal(challengeable("coup"), false, "a coup is simply paid for");
});

test("who may block, and with what", () => {
  const state = table([["duke"], ["captain"], ["contessa"]]);

  // Foreign aid is everyone's business.
  const aid = blockers({ kind: "foreign_aid", by: 0 }, state);
  assert.deepEqual(aid.cards, ["duke"]);
  assert.deepEqual(aid.seats.sort(), [1, 2]);

  // A steal is only the target's to stop, with either card.
  const steal = blockers({ kind: "steal", by: 0, target: 2 }, state);
  assert.deepEqual(steal.seats, [2]);
  assert.deepEqual(steal.cards.sort(), ["ambassador", "captain"]);

  // An assassination is stopped by the contessa, by the target alone.
  const hit = blockers({ kind: "assassinate", by: 0, target: 1 }, state);
  assert.deepEqual(hit.seats, [1]);
  assert.deepEqual(hit.cards, ["contessa"]);

  // A coup cannot be stopped at all.
  assert.deepEqual(blockers({ kind: "coup", by: 0, target: 1 }, state).seats, []);
});

test("targets are needed only where someone is on the receiving end", () => {
  assert.equal(needsTarget("coup"), true);
  assert.equal(needsTarget("assassinate"), true);
  assert.equal(needsTarget("steal"), true);
  assert.equal(needsTarget("tax"), false);
  assert.equal(needsTarget("income"), false);
});

test("income and tax pay out, and the turn moves on", () => {
  const state = table([["duke", "captain"], ["contessa", "assassin"]], [2, 2]);

  const after = resolve(state, { kind: "income", by: 0 });
  assert.equal(after.players[0].coins, 3);
  assert.equal(after.turn, 1, "play passes on");

  const taxed = resolve(state, { kind: "tax", by: 0 });
  assert.equal(taxed.players[0].coins, 5, "a duke takes three");
});

test("stealing takes two, or whatever is left", () => {
  const rich = table([["captain"], ["duke"]], [0, 5]);
  const after = resolve(rich, { kind: "steal", by: 0, target: 1 });
  assert.equal(after.players[0].coins, 2);
  assert.equal(after.players[1].coins, 3);

  const nearlyBroke = table([["captain"], ["duke"]], [0, 1]);
  const scraped = resolve(nearlyBroke, { kind: "steal", by: 0, target: 1 });
  assert.equal(scraped.players[0].coins, 1, "only what they had");
  assert.equal(scraped.players[1].coins, 0);
});

test("a coup sends the target to choose a card to give up", () => {
  const state = table([["duke", "captain"], ["contessa", "assassin"]], [COUP_COST, 2]);
  const after = resolve(state, { kind: "coup", by: 0, target: 1 });
  assert.deepEqual(after.phase, { kind: "discard", who: 1, next: "turn" });
});

test("losing influence turns a card face up, and two of them puts you out", () => {
  const state = table([["duke", "captain"], ["contessa", "assassin"]]);

  const once = loseInfluence(state, 0, 0);
  assert.equal(once.players[0].cards.length, 1);
  assert.deepEqual(once.players[0].lost, ["duke"]);
  assert.equal(isOut(once.players[0]), false, "still holding one");

  const twice = loseInfluence(once, 0, 0);
  assert.equal(twice.players[0].cards.length, 0);
  assert.equal(isOut(twice.players[0]), true);
  assert.deepEqual(alive(twice), [1]);
});

test("a caught bluff costs the bluffer a card", () => {
  const state = table([["captain", "contessa"], ["duke", "assassin"]]);
  const { state: after, honest } = judge(state, 0, "duke", 1);

  assert.equal(honest, false, "player 0 has no duke");
  assert.deepEqual(after.phase, { kind: "discard", who: 0, next: "turn" });
});

test("an honest claim is shown, swapped for a fresh card, and the doubter pays", () => {
  const state = table([["duke", "contessa"], ["captain", "assassin"]]);
  const before = state.deck.length;
  const { state: after, honest } = judge(state, 0, "duke", 1);

  assert.equal(honest, true);
  assert.equal(after.players[0].cards.length, 2, "still holding two");
  assert.equal(after.players[0].lost.length, 0, "an honest claim costs nothing");
  assert.equal(after.deck.length, before, "one card back, one card out");
});

test("play skips anyone already knocked out", () => {
  const state = table([["duke"], ["captain"], ["contessa"]]);
  const out = loseInfluence(state, 1, 0);
  assert.equal(isOut(out.players[1]), true);

  const moved = advance({ ...out, turn: 0 });
  assert.equal(moved.turn, 2, "player 1 is out of it");
});

test("the last one holding a card wins", () => {
  const state = table([["duke"], ["captain"]]);
  const out = loseInfluence(state, 1, 0);
  assert.deepEqual(advance(out).phase, { kind: "over", winner: 0 });
});

test("the box grows with the table", () => {
  // Three of each covers the base game; past six players the deck would be
  // almost entirely in people's hands with nothing left to draw.
  assert.equal(deckSize(2), 15);
  assert.equal(deckSize(4), 15);
  assert.equal(deckSize(6), 15);
  assert.equal(deckSize(7), 20);
  assert.equal(deckSize(8), 20);
  assert.equal(deckSize(9), 25);
  assert.equal(deckSize(10), 25);
  assert.equal(deckSize(11), 30);
  assert.equal(deckSize(12), 30);
});

test("every character is dealt in equally, whatever the size", () => {
  for (const players of [4, 7, 9, 12]) {
    const deck = fullDeck(copiesFor(players));
    assert.equal(deck.length, deckSize(players));
    for (const card of CARDS) {
      assert.equal(
        deck.filter((c) => c === card).length,
        copiesFor(players),
        `${card} at ${players} players`,
      );
    }
  }
});

test("there is always something left to draw from", () => {
  for (let players = 2; players <= MAX_SEATS; players += 1) {
    const seats = Array.from({ length: players }, (_, i) => `s${i}`);
    const game = newGame(seats);
    assert.equal(game.players.length, players);
    assert.ok(
      game.deck.length > 0,
      `${players} players left nothing in the middle`,
    );
    assert.equal(game.deck.length + players * 2, deckSize(players));
  }
});

test("pulling up a chair keeps the people already sitting", () => {
  const start = newGame(["ana", "s1", "bia"]);
  const bigger = withSeats(start, 5);

  assert.equal(bigger.players.length, 5);
  assert.equal(bigger.players[0].seat, "ana");
  assert.equal(bigger.players[2].seat, "bia");
  assert.equal(bigger.players[3].seat, "s3", "a new chair is nobody's yet");
  assert.equal(bigger.deck.length + 10, deckSize(5));
});

test("the table cannot be pushed past its limits", () => {
  const start = newGame(["ana", "bia"]);
  assert.equal(withSeats(start, 1).players.length, 2);
  assert.equal(withSeats(start, 40).players.length, MAX_SEATS);
});

test("COPIES still describes the base box", () => {
  assert.equal(COPIES, copiesFor(4));
  assert.equal(fullDeck().length, 15);
});
