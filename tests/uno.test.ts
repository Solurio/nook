import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  DRAW_PILE,
  afterDraw,
  afterPass,
  afterPlay,
  chairsFor,
  emptyUno,
  fullDeck,
  handSlot,
  matches,
  openWith,
  parse,
  playable,
  reshuffle,
  seatAfter,
  tally,
  type UnoState,
} from "../src/lib/uno.ts";

const name = (chair: string) => chair;

function table(overrides: Partial<UnoState> = {}): UnoState {
  return { ...emptyUno(4), discard: ["R5"], color: "R", turn: "s0", dealer: "s3", round: 1, ...overrides };
}

// ---------------------------------------------------------------------------
// The deck
// ---------------------------------------------------------------------------

test("a deck is a hundred and eight cards", () => {
  const deck = fullDeck();
  assert.equal(deck.length, 108);
  assert.equal(deck.filter((c) => c === "W").length, 4);
  assert.equal(deck.filter((c) => c === "W4").length, 4);
  assert.equal(deck.filter((c) => c === "R0").length, 1, "one zero per colour");
  assert.equal(deck.filter((c) => c === "G7").length, 2, "two of every other number");
  assert.equal(deck.filter((c) => c === "BS").length, 2);
  assert.equal(deck.filter((c) => c === "Y+").length, 2);
});

test("a card reads as its colour and its value", () => {
  assert.deepEqual(parse("R5"), { color: "R", value: "5" });
  assert.deepEqual(parse("G+"), { color: "G", value: "+" });
  assert.deepEqual(parse("W4"), { color: null, value: "W4" });
});

// ---------------------------------------------------------------------------
// What may be played
// ---------------------------------------------------------------------------

test("a card matches on colour or on value", () => {
  assert.ok(matches("R9", "R5", "R"), "same colour");
  assert.ok(matches("B5", "R5", "R"), "same number");
  assert.ok(matches("BS", "RS", "R"), "same action");
  assert.ok(!matches("B9", "R5", "R"));
});

test("a wild goes on anything", () => {
  assert.ok(matches("W", "R5", "R"));
  assert.ok(matches("W4", "G2", "G"));
});

test("after a wild, only the colour it called counts", () => {
  assert.ok(matches("B1", "W", "B"));
  assert.ok(!matches("R1", "W", "B"));
});

test("a wild draw four is only allowed with nothing of the colour in play", () => {
  assert.deepEqual(playable(["W4", "R2", "B9"], "R5", "R"), ["R2"]);
  assert.deepEqual(playable(["W4", "B9"], "R5", "R"), ["W4"]);
  assert.deepEqual(playable(["W4", "B5"], "R5", "R"), ["W4", "B5"], "a number match is not the colour");
});

// ---------------------------------------------------------------------------
// Turns and effects
// ---------------------------------------------------------------------------

test("play passes to the left", () => {
  const chairs = chairsFor(4);
  const { state } = afterPlay(table(), chairs, "R7", null, 5, name);
  assert.equal(state.turn, "s1");
  assert.deepEqual(state.discard, ["R7", "R5"]);
});

test("a skip jumps the next player", () => {
  const { state } = afterPlay(table(), chairsFor(4), "RS", null, 5, name);
  assert.equal(state.turn, "s2");
});

test("a reverse turns play round", () => {
  const { state } = afterPlay(table({ turn: "s1" }), chairsFor(4), "RR", null, 5, name);
  assert.equal(state.direction, -1);
  assert.equal(state.turn, "s0");
});

test("with two players a reverse is a skip", () => {
  const { state } = afterPlay(table(), chairsFor(2), "RR", null, 5, name);
  assert.equal(state.direction, 1);
  assert.equal(state.turn, "s0");
});

test("a draw two makes the next player draw two and miss their go", () => {
  const { state, penalty } = afterPlay(table(), chairsFor(4), "R+", null, 5, name);
  assert.deepEqual(penalty, { chair: "s1", count: 2 });
  assert.equal(state.turn, "s2");
});

test("a wild draw four calls a colour and costs the next player four", () => {
  const { state, penalty } = afterPlay(table(), chairsFor(4), "W4", "G", 5, name);
  assert.equal(state.color, "G");
  assert.deepEqual(penalty, { chair: "s1", count: 4 });
  assert.equal(state.turn, "s2");
});

test("penalties follow the direction of play", () => {
  const { penalty } = afterPlay(table({ direction: -1 }), chairsFor(4), "R+", null, 5, name);
  assert.deepEqual(penalty, { chair: "s3", count: 2 });
});

test("drawing leaves the turn with you until you play or pass", () => {
  const drew = afterDraw(table());
  assert.equal(drew.drew, "s0");
  assert.equal(drew.turn, "s0");
  const passed = afterPass(drew, chairsFor(4), name);
  assert.equal(passed.turn, "s1");
  assert.equal(passed.drew, null);
});

test("going down to one card without calling it leaves you open to a catch", () => {
  const { state } = afterPlay(table(), chairsFor(4), "R7", null, 1, name);
  assert.equal(state.exposed, "s0");
  const safe = afterPlay(table({ called: { s0: true } }), chairsFor(4), "R7", null, 1, name);
  assert.equal(safe.state.exposed, null);
});

test("an empty hand wins the round, and the turn stays put", () => {
  const { state } = afterPlay(table({ round: 3 }), chairsFor(4), "R7", null, 0, name);
  assert.equal(state.results["3"], "s0");
  assert.equal(state.turn, "s0");
});

test("seats wrap round the table both ways", () => {
  const chairs = chairsFor(3);
  assert.equal(seatAfter(chairs, "s2", 1), "s0");
  assert.equal(seatAfter(chairs, "s0", -1), "s2");
  assert.equal(seatAfter(chairs, "s0", 1, 2), "s2");
});

// ---------------------------------------------------------------------------
// Opening a round
// ---------------------------------------------------------------------------

test("the player after the dealer goes first", () => {
  const opened = openWith(table({ dealer: "s1", discard: [] }), chairsFor(4), "B3");
  assert.notEqual(opened, "again");
  if (opened === "again") return;
  assert.equal(opened.state.turn, "s2");
  assert.equal(opened.state.color, "B");
});

test("a wild draw four cannot open a round", () => {
  assert.equal(openWith(table({ discard: [] }), chairsFor(4), "W4"), "again");
});

test("opening on a wild leaves the first player to call the colour", () => {
  const opened = openWith(table({ dealer: "s0", discard: [] }), chairsFor(4), "W");
  if (opened === "again") return assert.fail();
  assert.equal(opened.state.color, null);
  assert.equal(opened.state.turn, "s1");
});

test("opening on a skip skips the first player", () => {
  const opened = openWith(table({ dealer: "s0", discard: [] }), chairsFor(4), "GS");
  if (opened === "again") return assert.fail();
  assert.equal(opened.state.turn, "s2");
});

test("opening on a reverse gives the dealer the first go, going the other way", () => {
  const opened = openWith(table({ dealer: "s2", discard: [] }), chairsFor(4), "YR");
  if (opened === "again") return assert.fail();
  assert.equal(opened.state.turn, "s2");
  assert.equal(opened.state.direction, -1);
});

test("opening on a draw two costs the first player two and their go", () => {
  const opened = openWith(table({ dealer: "s0", discard: [] }), chairsFor(4), "R+");
  if (opened === "again") return assert.fail();
  assert.deepEqual(opened.penalty, { chair: "s1", count: 2 });
  assert.equal(opened.state.turn, "s2");
});

test("the discard pile, bar its top card, goes back to make a new draw pile", () => {
  const { state, back } = reshuffle(table({ discard: ["G2", "W", "R5", "R+"] }));
  assert.deepEqual(state.discard, ["G2"]);
  assert.deepEqual(back, ["W", "R5", "R+"]);
});

test("round wins are counted per chair", () => {
  assert.deepEqual(tally({ "1": "s0", "2": "s2", "3": "s0" }), { s0: 2, s2: 1 });
});

// ---------------------------------------------------------------------------
// Against the database
// ---------------------------------------------------------------------------

let db: PGlite;
let alice: string;
let bob: string;

before(async () => {
  db = await freshDatabase();
  alice = await newUser(db);
  bob = await newUser(db);
});

async function rpc(user: string, fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  const params = names.map((n) =>
    n !== "p_slots" && typeof args[n] === "object" && args[n] !== null ? JSON.stringify(args[n]) : args[n],
  );
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ out: unknown }>(
      `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as out`,
      params,
    ),
  );
  return rows[0]?.out;
}

async function handOf(user: string, itemId: string, chair: string) {
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ cards: string[] }>("select cards from public.secrets where item_id = $1 and slot = $2", [
      itemId,
      handSlot(chair),
    ]),
  );
  return rows[0]?.cards;
}

test("a draw two lands in the next hand without the player who threw it seeing what", async () => {
  const { itemId } = await tableFor(db, alice, "uno");
  await rpc(alice, "pile_setup", {
    p_item: itemId,
    p_piles: [{ slot: DRAW_PILE, cards: fullDeck(), shuffle: true }],
  });
  await rpc(alice, "pile_deal", {
    p_item: itemId,
    p_from: DRAW_PILE,
    p_targets: [
      { slot: handSlot("s0"), owner: alice, count: 7 },
      { slot: handSlot("s1"), owner: bob, count: 7 },
    ],
  });

  assert.equal(await handOf(alice, itemId, "s1"), undefined, "Alice cannot read Bob's hand");

  const moved = await rpc(alice, "pile_move", {
    p_item: itemId,
    p_from: DRAW_PILE,
    p_to: handSlot("s1"),
    p_count: 2,
  });
  assert.equal(moved, null, "the cards went to Bob; Alice is told nothing");
  assert.equal((await handOf(bob, itemId, "s1"))?.length, 9);
});
