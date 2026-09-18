import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  ASSASSIN_COST,
  COUP_COST,
  COURT,
  FORCED_COUP,
  MAX_SEATS,
  PRESETS,
  advance,
  afterGuess,
  afterLoss,
  block,
  blockers,
  challenge,
  characters,
  copiesFor,
  deckFor,
  deckSize,
  declare,
  emptyCoup,
  handSlot,
  shownSlot,
  legalActions,
  pass,
  settleChallenge,
  startRound,
  targetsFor,
  type CoupState,
} from "../src/lib/coup.ts";

const name = (c: string) => c;
const chairs4 = ["s0", "s1", "s2", "s3"];

function table(preset: keyof typeof PRESETS = "standard", count = 4): CoupState {
  const chairs = chairs4.slice(0, count);
  return startRound(emptyCoup(count, preset), chairs, "s0");
}

// ---------------------------------------------------------------------------
// The box
// ---------------------------------------------------------------------------

test("the box grows with the table", () => {
  assert.equal(deckSize(4), 15);
  assert.equal(deckSize(7), 20);
  assert.equal(deckSize(9), 25);
  assert.equal(deckSize(12), 30);
  for (let n = 2; n <= MAX_SEATS; n += 1) {
    assert.equal(deckFor(PRESETS.standard, n).length, deckSize(n));
    assert.ok(deckSize(n) > n * 2, `${n} players leave nothing to draw`);
  }
});

test("the inquisitor takes the ambassador's place", () => {
  assert.ok(characters(PRESETS.standard).includes("ambassador"));
  const expanded = characters(PRESETS.expanded);
  assert.ok(expanded.includes("inquisitor"));
  assert.ok(!expanded.includes("ambassador"));
  assert.equal(deckFor(PRESETS.expanded, 4).filter((c) => c === "inquisitor").length, copiesFor(4));
});

// ---------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------

test("everyone starts with two coins", () => {
  const state = table();
  for (const chair of chairs4) assert.equal(state.players[chair].coins, 2);
  assert.equal(state.turn, "s0");
  assert.deepEqual(state.phase, { kind: "act" });
});

test("at a table of two, whoever goes first starts with one", () => {
  const state = table("duel", 2);
  assert.equal(state.players.s0.coins, 1);
  assert.equal(state.players.s1.coins, 2);
  assert.equal(state.rules.guess, true);
});

test("with the reformation, sides alternate round the table", () => {
  const state = table("expanded");
  assert.deepEqual(
    chairs4.map((c) => state.players[c].allegiance),
    ["loyalist", "reformist", "loyalist", "reformist"],
  );
});

// ---------------------------------------------------------------------------
// What you may do
// ---------------------------------------------------------------------------

test("ten coins and the only move is a coup", () => {
  const state = table();
  state.players.s0.coins = FORCED_COUP;
  assert.deepEqual(legalActions(state, "s0", chairs4), ["coup"]);
});

test("coups and assassinations wait for the coins", () => {
  const state = table();
  assert.ok(!legalActions(state, "s0", chairs4).includes("coup"));
  assert.ok(!legalActions(state, "s0", chairs4).includes("assassinate"));
  state.players.s0.coins = ASSASSIN_COST;
  assert.ok(legalActions(state, "s0", chairs4).includes("assassinate"));
  state.players.s0.coins = COUP_COST;
  assert.ok(legalActions(state, "s0", chairs4).includes("coup"));
});

test("examining needs the inquisitor; converting and embezzling need the reformation", () => {
  const standard = legalActions(table(), "s0", chairs4);
  assert.ok(!standard.includes("examine"));
  assert.ok(!standard.includes("convert"));
  const expanded = table("expanded");
  assert.ok(legalActions(expanded, "s0", chairs4).includes("examine"));
  assert.ok(legalActions(expanded, "s0", chairs4).includes("convert"));
  assert.ok(!legalActions(expanded, "s0", chairs4).includes("embezzle"), "nothing in the treasury yet");
  assert.ok(legalActions({ ...expanded, treasury: 3 }, "s0", chairs4).includes("embezzle"));
});

test("with the reformation you cannot aim at your own side", () => {
  const state = table("expanded");
  state.players.s0.coins = 7;
  assert.deepEqual(targetsFor(state, "coup", "s0", chairs4), ["s1", "s3"]);
  // Everyone on one side: anything goes again.
  for (const c of chairs4) state.players[c].allegiance = "loyalist";
  assert.deepEqual(targetsFor(state, "coup", "s0", chairs4), ["s1", "s2", "s3"]);
});

test("nor block your own side's foreign aid", () => {
  const state = table("expanded");
  const who = blockers(state, { kind: "foreign_aid", by: "s0" }, chairs4);
  assert.deepEqual(who.chairs, ["s1", "s3"]);
});

// ---------------------------------------------------------------------------
// Playing it out
// ---------------------------------------------------------------------------

test("income simply happens", () => {
  const { state } = declare(table(), { kind: "income", by: "s0" }, chairs4, name);
  assert.equal(state.players.s0.coins, 3);
  assert.equal(state.turn, "s1");
});

test("a coup is paid for up front and costs the target a card", () => {
  const start = table();
  start.players.s0.coins = 7;
  const { state } = declare(start, { kind: "coup", by: "s0", target: "s2" }, chairs4, name);
  assert.equal(state.players.s0.coins, 0);
  assert.deepEqual(state.phase, { kind: "lose", who: "s2", then: { kind: "next" } });
});

test("with guessing on, a coup asks the attacker to name a card", () => {
  const start = table("duel", 2);
  start.players.s0.coins = 7;
  const { state } = declare(start, { kind: "coup", by: "s0", target: "s1" }, ["s0", "s1"], name);
  assert.equal(state.phase.kind, "guess");
  const hit = afterGuess(state, "duke", true, ["s0", "s1"], name);
  assert.deepEqual(hit.phase, { kind: "lose", who: "s1", forced: "duke", then: { kind: "next" } });
  const miss = afterGuess(state, "duke", false, ["s0", "s1"], name);
  assert.equal(miss.turn, "s1", "a miss spends the go for nothing");
});

test("a claim that nobody challenges goes through", () => {
  const declared = declare(table(), { kind: "tax", by: "s0" }, chairs4, name).state;
  assert.equal(declared.phase.kind, "respond");
  let state = declared;
  for (const c of ["s1", "s2", "s3"]) state = pass(state, c, chairs4, name).state;
  assert.equal(state.players.s0.coins, 5);
  assert.equal(state.turn, "s1");
});

test("an honest claim, challenged: the challenger pays and it goes ahead", () => {
  const declared = declare(table(), { kind: "tax", by: "s0" }, chairs4, name).state;
  const proving = challenge(declared, "s2", name);
  assert.equal(proving.phase.kind, "prove");
  const settled = settleChallenge(proving, true, name);
  assert.deepEqual(settled.phase, {
    kind: "lose",
    who: "s2",
    then: { kind: "resolve", action: { kind: "tax", by: "s0" } },
  });
  const after = afterLoss(settled, "s2", "captain", chairs4, name).state;
  assert.equal(after.players.s0.coins, 5, "the tax went through");
  assert.deepEqual(after.players.s2.lost, ["captain"]);
});

test("a bluff, challenged: the bluffer pays and the action dies", () => {
  const declared = declare(table(), { kind: "tax", by: "s0" }, chairs4, name).state;
  const settled = settleChallenge(challenge(declared, "s2", name), false, name);
  assert.deepEqual(settled.phase, { kind: "lose", who: "s0", then: { kind: "next" } });
  const after = afterLoss(settled, "s0", "contessa", chairs4, name).state;
  assert.equal(after.players.s0.coins, 2, "no tax for a liar");
  assert.equal(after.turn, "s1");
});

test("a block that holds stops the action", () => {
  const declared = declare(table(), { kind: "foreign_aid", by: "s0" }, chairs4, name).state;
  let state = block(declared, "s1", "duke", name);
  for (const c of ["s0", "s2", "s3"]) state = pass(state, c, chairs4, name).state;
  assert.equal(state.players.s0.coins, 2);
  assert.equal(state.turn, "s1");
});

test("a bluffed block, challenged, falls -- and the action goes ahead", () => {
  const declared = declare(table(), { kind: "foreign_aid", by: "s0" }, chairs4, name).state;
  const blocked = block(declared, "s1", "duke", name);
  const settled = settleChallenge(challenge(blocked, "s0", name), false, name);
  assert.deepEqual(settled.phase, {
    kind: "lose",
    who: "s1",
    then: { kind: "resolve", action: { kind: "foreign_aid", by: "s0" } },
  });
  const after = afterLoss(settled, "s1", "captain", chairs4, name).state;
  assert.equal(after.players.s0.coins, 4);
});

test("challenging an assassin and being wrong can cost you both cards", () => {
  const start = table();
  start.players.s0.coins = 3;
  const declared = declare(start, { kind: "assassinate", by: "s0", target: "s1" }, chairs4, name).state;
  const settled = settleChallenge(challenge(declared, "s1", name), true, name);
  const first = afterLoss(settled, "s1", "duke", chairs4, name).state;
  assert.deepEqual(first.phase, { kind: "lose", who: "s1", then: { kind: "next" } }, "and then the assassination lands");
});

test("an exchange draws from the court and sends as many back", () => {
  const declared = declare(table(), { kind: "exchange", by: "s0" }, chairs4, name).state;
  let state = declared;
  let draw: { who: string; count: number } | undefined;
  for (const c of ["s1", "s2", "s3"]) ({ state, draw } = pass(state, c, chairs4, name));
  assert.deepEqual(draw, { who: "s0", count: 2 });
  assert.deepEqual(state.phase, { kind: "exchange", who: "s0", drawn: 2, pending: true });
});

test("the inquisitor exchanges one card rather than two", () => {
  let state = declare(table("expanded"), { kind: "exchange", by: "s0" }, chairs4, name).state;
  let draw: { who: string; count: number } | undefined;
  for (const c of ["s1", "s2", "s3"]) ({ state, draw } = pass(state, c, chairs4, name));
  assert.deepEqual(draw, { who: "s0", count: 1 });
});

test("converting costs a coin for yourself, two for someone else, into the treasury", () => {
  const start = table("expanded");
  const self = declare(start, { kind: "convert", by: "s0" }, chairs4, name).state;
  assert.equal(self.players.s0.allegiance, "reformist");
  assert.equal(self.players.s0.coins, 1);
  assert.equal(self.treasury, 1);
  const other = declare(start, { kind: "convert", by: "s0" }, chairs4, name, "s1").state;
  assert.equal(other.players.s1.allegiance, "loyalist");
  assert.equal(other.players.s0.coins, 0);
  assert.equal(other.treasury, 2);
});

test("embezzling takes the whole treasury, if nobody calls it", () => {
  let state = declare({ ...table("expanded"), treasury: 4 }, { kind: "embezzle", by: "s0" }, chairs4, name).state;
  assert.equal(state.phase.kind, "respond");
  for (const c of ["s1", "s2", "s3"]) state = pass(state, c, chairs4, name).state;
  assert.equal(state.players.s0.coins, 6);
  assert.equal(state.treasury, 0);
});

test("the turn skips anyone knocked out, including the player whose go it was", () => {
  const state = table();
  assert.equal(advance({ ...state, turn: "s1" }, ["s0", "s2", "s3"]).turn, "s2", "s1 is out on their own go");
  assert.equal(advance({ ...state, turn: "s3" }, ["s0", "s3"]).turn, "s0");
});

test("the last one standing wins", () => {
  const over = advance(table(), ["s2"]);
  assert.deepEqual(over.phase, { kind: "over", winner: "s2" });
  assert.equal(over.wins.s2, 1);
});

// ---------------------------------------------------------------------------
// Against the database
// ---------------------------------------------------------------------------

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("proof is the database's to give: you can only show a card you hold", async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  const { itemId } = await tableFor(db, a, "coup");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  await run(a, "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([
      { slot: COURT, cards: deckFor(PRESETS.standard, 2), shuffle: true },
      { slot: handSlot("s0"), owner: a, cards: ["duke", "captain"] },
      { slot: handSlot("s1"), owner: b, cards: ["contessa", "assassin"] },
    ]),
  ]);

  // Claimed the duke, and has it: showing it works.
  await run(a, "select public.pile_take(p_item => $1, p_from => $2, p_cards => $3::jsonb, p_public => $4::jsonb)", [
    itemId,
    handSlot("s0"),
    JSON.stringify(["duke"]),
    JSON.stringify({ game: "coup", state: {} }),
  ]);
  // Claimed the duke, and does not have it: the database will not let them show one.
  await assert.rejects(
    run(b, "select public.pile_take(p_item => $1, p_from => $2, p_cards => $3::jsonb, p_public => $4::jsonb)", [
      itemId,
      handSlot("s1"),
      JSON.stringify(["duke"]),
      JSON.stringify({ game: "coup", state: {} }),
    ]),
  );
  // And embezzling -- claiming no duke -- is checked the same way, in front of everyone.
  const { rows } = await run(a, "select public.pile_test(p_item => $1, p_slot => $2, p_card => $3::jsonb) as out", [
    itemId,
    handSlot("s1"),
    JSON.stringify("duke"),
  ]);
  assert.equal((rows[0] as { out: boolean }).out, false);
});

test("the inquisitor sees the card they were shown, and nobody else does", async () => {
  const [a, b, c] = [await newUser(db), await newUser(db), await newUser(db)];
  const { itemId } = await tableFor(db, a, "coup");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const read = async (user: string) => {
    const { rows } = await run(user, "select slot, cards from public.secrets where item_id = $1", [itemId]);
    return Object.fromEntries((rows as Array<{ slot: string; cards: unknown[] }>).map((r) => [r.slot, r.cards]));
  };
  await run(a, "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([
      { slot: COURT, cards: deckFor(PRESETS.expanded, 3), shuffle: true },
      { slot: handSlot("s0"), owner: a, cards: ["inquisitor", "duke"] },
      { slot: handSlot("s1"), owner: b, cards: ["captain", "contessa"] },
      { slot: handSlot("s2"), owner: c, cards: ["assassin", "duke"] },
    ]),
  ]);

  // Only the target can pick what to show, and only from their own hand.
  await assert.rejects(
    run(a, "select public.pile_show(p_item => $1, p_from => $2, p_cards => $3::jsonb, p_viewer => $4, p_to => $5)", [
      itemId, handSlot("s1"), JSON.stringify(["captain"]), a, shownSlot("s0"),
    ]),
  );
  await run(b, "select public.pile_show(p_item => $1, p_from => $2, p_cards => $3::jsonb, p_viewer => $4, p_to => $5)", [
    itemId, handSlot("s1"), JSON.stringify(["contessa"]), a, shownSlot("s0"),
  ]);
  assert.deepEqual((await read(a))[shownSlot("s0")], ["contessa"]);
  assert.equal((await read(c))[shownSlot("s0")], undefined, "a bystander saw it");
  assert.deepEqual((await read(b))[handSlot("s1")], ["captain", "contessa"], "showing is not giving");

  // The inquisitor puts it out of sight again; then the target swaps it.
  await run(a, "select public.pile_drop(p_item => $1, p_slots => $2)", [itemId, [shownSlot("s0")]]);
  assert.equal((await read(a))[shownSlot("s0")], undefined);
  await run(b, "select public.pile_move(p_item => $1, p_from => $2, p_to => $3, p_cards => $4::jsonb)", [
    itemId, handSlot("s1"), COURT, JSON.stringify(["contessa"]),
  ]);
  await run(b, "select public.pile_draw(p_item => $1, p_from => $2, p_to => $3, p_count => 1)", [itemId, COURT, handSlot("s1")]);
  assert.equal(((await read(b))[handSlot("s1")] as unknown[]).length, 2);
});
