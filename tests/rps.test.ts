import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import { emptyRps, readThrows, scoreRound, startMatch, throwSlot, winnersOf } from "../src/lib/rps.ts";

test("each shape beats one and loses to the other", () => {
  assert.deepEqual(winnersOf({ s0: "R", s1: "S" }), ["s0"]);
  assert.deepEqual(winnersOf({ s0: "R", s1: "P" }), ["s1"]);
  assert.deepEqual(winnersOf({ s0: "S", s1: "P" }), ["s0"]);
  assert.deepEqual(winnersOf({ s0: "S", s1: "S" }), [], "the same is a draw");
});

test("with more than two, only two shapes thrown has a winner", () => {
  assert.deepEqual(winnersOf({ s0: "R", s1: "R", s2: "S" }), ["s0", "s1"]);
  assert.deepEqual(winnersOf({ s0: "R", s1: "P", s2: "S" }), [], "all three cancel out");
});

test("a match runs to its target and stops", () => {
  let state = startMatch({ ...emptyRps(2), firstTo: 2 }, ["s0", "s1"]);
  const round = state.round;
  state = scoreRound(state, { s0: "R", s1: "S" });
  assert.equal(state.round, round + 1);
  assert.equal(state.scores.s0, 1);
  assert.equal(state.winner, undefined);
  state = scoreRound(state, { s0: "P", s1: "P" });
  assert.equal(state.scores.s0, 1, "a draw scores nothing");
  state = scoreRound(state, { s0: "S", s1: "P" });
  assert.equal(state.winner, "s0");
});

test("a round is only read once every throw is showing", () => {
  const revealed = { [throwSlot(4, "s0")]: ["R"] };
  assert.equal(readThrows(revealed, 4, ["s0", "s1"]), null);
  assert.deepEqual(readThrows({ ...revealed, [throwSlot(4, "s1")]: ["P"] }, 4, ["s0", "s1"]), { s0: "R", s1: "P" });
  assert.equal(readThrows({ [throwSlot(4, "s0")]: ["lizard"] }, 4, ["s0"]), null, "nothing but the three shapes");
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("a throw stays sealed until the other is in, and only its owner can read it", async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  const { itemId } = await tableFor(db, a, "rps");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const slots = [throwSlot(1, "s0"), throwSlot(1, "s1")];
  const put = (user: string, slot: string, shape: string) =>
    run(user, "select public.pile_put(p_item => $1, p_to => $2, p_cards => $3::jsonb, p_to_owner => $4, p_seal => $5::jsonb)", [
      itemId,
      slot,
      JSON.stringify([shape]),
      user,
      JSON.stringify(slots),
    ]);

  await put(a, slots[0], "R");
  const { rows } = await run(b, "select slot from public.secrets where item_id = $1", [itemId]);
  assert.equal(rows.length, 0, "the other player could read the throw");
  await assert.rejects(run(b, "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, slots]), /committed/);

  await put(b, slots[1], "S");
  await run(b, "select public.pile_reveal(p_item => $1, p_slots => $2)", [itemId, slots]);
  const { rows: item } = await db.query<{ data: { state: { revealed: Record<string, unknown[]> } } }>(
    "select data from public.items where id = $1",
    [itemId],
  );
  assert.deepEqual(readThrows(item[0].data.state.revealed, 1, ["s0", "s1"]), { s0: "R", s1: "S" });
});
