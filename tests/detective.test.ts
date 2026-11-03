// Detective's answering happens in the database (0012_detective.sql): the
// envelope is a pile nobody may read, and when a suggestion is made the
// database goes round the hands itself, so nobody can pretend not to hold a
// card.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";

let db: PGlite;
const users: string[] = [];
const chairs = ["c0", "c1", "c2"];
const deck = {
  suspects: ["a", "b", "c", "d"],
  weapons: ["x", "y", "z", "q"],
  rooms: ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"],
};

before(async () => {
  db = await freshDatabase();
  for (let i = 0; i < chairs.length; i += 1) users.push(await newUser(db));
});

const call = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query<{ out: unknown }>(sql, params));
const userOf = (chair: string) => users[chairs.indexOf(chair)];

async function deal(seated = chairs) {
  const { itemId } = await tableFor(db, users[0], "detective");
  await call(users[0], "select public.detective_deal($1, $2, $3, $4::jsonb)", [itemId, seated, seated.map(userOf), JSON.stringify(deck)]);
  return itemId;
}

type Case = {
  phase: string;
  turn: string;
  at: Record<string, number>;
  out: string[];
  pending: { from: string; by: string } | null;
  history: Array<{ from: string; by: string | null; passed: string[]; cards: string[] }>;
  winner: string | null;
  answer: string[] | null;
};

async function cs(itemId: string) {
  const { rows } = await db.query<{ cs: Case }>("select data #> '{state,cs}' as cs from public.items where id = $1", [itemId]);
  return rows[0].cs;
}

/** Sets the hands, the envelope and whose turn it is, straight in the tables, to test against known cards. */
async function rig(itemId: string, envelope: string[], hands: Record<string, string[]>, patch: Record<string, unknown> = {}) {
  await db.query("update public.secrets set cards = $2::jsonb where item_id = $1 and slot = 'envelope'", [itemId, JSON.stringify(envelope)]);
  for (const [chair, cards] of Object.entries(hands)) {
    await db.query("update public.secrets set cards = $3::jsonb where item_id = $1 and slot = $2", [itemId, `hand:${chair}`, JSON.stringify(cards)]);
  }
  await db.query("update public.items set data = jsonb_set(data, '{state,cs}', (data #> '{state,cs}') || $2::jsonb) where id = $1", [
    itemId,
    JSON.stringify({ turn: "c0", ...patch }),
  ]);
}

const move = (chair: string, itemId: string, room: number) => call(userOf(chair), "select public.detective_move($1, $2, $3)", [itemId, chair, room]);
const suggest = (chair: string, itemId: string, suspect: string, weapon: string) =>
  call(userOf(chair), "select public.detective_suggest($1, $2, $3, $4) as out", [itemId, chair, suspect, weapon]);
const accuse = (chair: string, itemId: string, suspect: string, weapon: string, room: string) =>
  call(userOf(chair), "select public.detective_accuse($1, $2, $3, $4, $5) as out", [itemId, chair, suspect, weapon, room]);

test("the envelope holds one of each, nobody can read it, and every other card is dealt once", async () => {
  const itemId = await deal();
  const { rows } = await db.query<{ slot: string; cards: string[] }>("select slot, cards from public.secrets where item_id = $1", [itemId]);
  const envelope = rows.find((r) => r.slot === "envelope")!.cards;
  assert.deepEqual(envelope.map((c) => c[0]).sort(), ["r", "s", "w"]);
  const dealt = rows.filter((r) => r.slot.startsWith("hand:")).flatMap((r) => r.cards);
  assert.equal(new Set([...dealt, ...envelope]).size, 17);
  assert.equal(dealt.length + envelope.length, 17);

  for (const user of users) {
    const mine = await call(user, "select slot from public.secrets where item_id = $1", [itemId]);
    const slots = mine.rows.map((r) => (r as unknown as { slot: string }).slot).sort();
    assert.ok(!slots.includes("envelope"), "nobody reads the envelope");
    assert.equal(slots.filter((s) => s.startsWith("hand:")).length, 1, "only your own hand");
  }
});

test("you move on your own turn, one room at a time, or across a corner passage", async () => {
  const itemId = await deal();
  await rig(itemId, ["s:a", "w:x", "r:r0"], {});
  await assert.rejects(move("c1", itemId, 1), "not c1's turn");
  await assert.rejects(move("c0", itemId, 0), "the middle does not reach a corner");
  await move("c0", itemId, 1);
  await assert.rejects(move("c0", itemId, 2), "one move a turn");

  const other = await deal();
  await rig(other, ["s:a", "w:x", "r:r0"], {}, { at: { c0: 0, c1: 4, c2: 4 } });
  await move("c0", other, 8);
  assert.equal((await cs(other)).at.c0, 8);
});

test("a suggestion is answered by the first hand round the table that can, and only the asker sees the card", async () => {
  const itemId = await deal();
  await rig(itemId, ["s:a", "w:x", "r:r0"], { c0: ["s:d"], c1: ["s:c", "r:r5"], c2: ["w:y", "r:r2"] });
  await assert.rejects(suggest("c0", itemId, "b", "y"), "move first");
  await move("c0", itemId, 1);
  const { rows } = await suggest("c0", itemId, "b", "y");
  assert.deepEqual(rows[0].out, { by: "c2", card: "w:y" });

  const state = await cs(itemId);
  assert.deepEqual(state.history.at(-1)?.passed, ["c1"], "the table sees who could not answer");
  assert.equal(state.history.at(-1)?.by, "c2");

  const seen = await call(users[0], "select cards from public.secrets where item_id = $1 and slot = 'seen:c0'", [itemId]);
  assert.deepEqual((seen.rows[0] as unknown as { cards: Array<{ card: string; by: string }> }).cards.map((s) => [s.card, s.by]), [["w:y", "c2"]]);
  const peek = await call(users[1], "select cards from public.secrets where item_id = $1 and slot = 'seen:c0'", [itemId]);
  assert.equal(peek.rows.length, 0, "nobody else reads it");
  await assert.rejects(suggest("c0", itemId, "c", "z"), "a second suggestion in the same turn");
});

test("holding two of the three, the one answering chooses, and nobody else can answer for them", async () => {
  const itemId = await deal();
  await rig(itemId, ["s:a", "w:x", "r:r0"], { c0: ["s:d"], c1: ["s:b", "w:y"], c2: ["r:r1"] });
  await move("c0", itemId, 1);
  const { rows } = await suggest("c0", itemId, "b", "y");
  assert.deepEqual(rows[0].out, { by: "c1", waiting: true });
  await assert.rejects(call(users[0], "select public.detective_end($1, 'c0')", [itemId]), "the turn waits for the answer");
  await assert.rejects(call(users[2], "select public.detective_show($1, 'c1', 's:b')", [itemId]), "not c2's hand");
  await assert.rejects(call(users[1], "select public.detective_show($1, 'c1', 'r:r1')", [itemId]), "a card not asked about");
  await call(users[1], "select public.detective_show($1, 'c1', 's:b')", [itemId]);
  const state = await cs(itemId);
  assert.equal(state.pending, null);
  assert.equal(state.history.at(-1)?.by, "c1");
  await call(users[0], "select public.detective_end($1, 'c0')", [itemId]);
  assert.equal((await cs(itemId)).turn, "c1");
});

test("nobody holding any of them is said out loud", async () => {
  const itemId = await deal();
  await rig(itemId, ["s:a", "w:x", "r:r1"], { c0: ["s:b"], c1: ["s:c"], c2: ["w:z"] });
  await move("c0", itemId, 1);
  const { rows } = await suggest("c0", itemId, "a", "x");
  assert.deepEqual(rows[0].out, { by: null });
  assert.deepEqual((await cs(itemId)).history.at(-1)?.passed, ["c1", "c2"]);
});

test("a wrong accusation puts you out and tells only you the answer; a right one closes the case", async () => {
  const itemId = await deal();
  await rig(itemId, ["s:a", "w:x", "r:r0"], {});
  const wrong = await accuse("c0", itemId, "b", "y", "r1");
  assert.deepEqual(wrong.rows[0].out, { right: false, answer: ["s:a", "w:x", "r:r0"] });
  let state = await cs(itemId);
  assert.deepEqual(state.out, ["c0"]);
  assert.equal(state.turn, "c1");
  assert.equal(state.answer, null, "the table is not told");

  await accuse("c1", itemId, "a", "x", "r0");
  state = await cs(itemId);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "c1");
  assert.deepEqual(state.answer, ["s:a", "w:x", "r:r0"]);
});

test("the last player still in wins", async () => {
  const itemId = await deal(["c0", "c1"]);
  await rig(itemId, ["s:a", "w:x", "r:r0"], {});
  await accuse("c0", itemId, "b", "y", "r1");
  const state = await cs(itemId);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "c1");
});

test("a browser saving the item cannot rewrite the case", async () => {
  const itemId = await deal();
  await call(users[0], `update public.items set data = jsonb_set(data, '{state,cs,winner}', '"c0"') where id = $1`, [itemId]);
  assert.equal((await cs(itemId)).winner, null);
});
