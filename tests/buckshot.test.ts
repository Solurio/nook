import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";
import {
  CHAMBER,
  MAX_GEAR,
  aim,
  alive,
  emptyBuckshot,
  landed,
  left,
  needsLoad,
  newLoad,
  oddsLive,
  remaining,
  shellKey,
  startRound,
  steal,
  applyGear,
  type BuckshotState,
  type Gear,
} from "../src/lib/buckshot.ts";

const name = (c: string) => c;
const chairs = ["s0", "s1"];

/** A round with a known load and chosen items. */
function table(gear: Record<string, Gear[]> = {}, live = 2, blank = 2): BuckshotState {
  const { state } = startRound(emptyBuckshot(2), chairs, () => 0);
  return {
    ...state,
    loaded: { live, blank },
    spent: [],
    players: Object.fromEntries(chairs.map((c) => [c, { charges: 4, gear: gear[c] ?? [] }])),
  };
}

const shoot = (state: BuckshotState, by: string, at: string, raw: "live" | "blank") => landed(aim(state, by, at), raw, name);

test("every load has at least one of each, and says how many", () => {
  for (let i = 0; i < 300; i += 1) {
    const { state, shells } = newLoad(table());
    const live = shells.filter((s) => s === "live").length;
    assert.ok(live >= 1 && live < shells.length);
    assert.ok(shells.length >= 2 && shells.length <= 8);
    assert.deepEqual(state.loaded, { live, blank: shells.length - live });
  }
});

test("items pile up to a limit", () => {
  let state = table();
  for (let i = 0; i < 10; i += 1) state = newLoad(state).state;
  for (const c of chairs) assert.equal(state.players[c].gear.length, MAX_GEAR);
});

test("a live shell at someone else costs them a charge and passes the turn", () => {
  const next = shoot(table(), "s0", "s1", "live");
  assert.equal(next.players.s1.charges, 3);
  assert.equal(next.turn, "s1");
  assert.deepEqual(remaining(next), { live: 1, blank: 2 });
});

test("a blank at your own head keeps the turn; a live one does not", () => {
  const blank = shoot(table(), "s0", "s0", "blank");
  assert.equal(blank.turn, "s0");
  assert.equal(blank.players.s0.charges, 4);
  const live = shoot(table(), "s0", "s0", "live");
  assert.equal(live.turn, "s1");
  assert.equal(live.players.s0.charges, 3);
});

test("a blank at someone else still passes the turn", () => {
  assert.equal(shoot(table(), "s0", "s1", "blank").turn, "s1");
});

test("the saw doubles one shot, then it is gone", () => {
  let state = table({ s0: ["saw"] });
  state = applyGear(state, "s0", "saw", name)?.state as BuckshotState;
  assert.equal(state.saw, true);
  const again = { ...state, players: { ...state.players, s0: { charges: 4, gear: ["saw" as Gear] } } };
  assert.equal(applyGear(again, "s0", "saw", name), null, "no sawing twice");
  state = shoot(state, "s0", "s1", "live");
  assert.equal(state.players.s1.charges, 2);
  assert.equal(state.saw, false);
});

test("the inverter turns the shell over, and the count follows what was loaded", () => {
  let state = table({ s0: ["inverter"] });
  state = applyGear(state, "s0", "inverter", name)?.state as BuckshotState;
  assert.equal(oddsLive(state), 0.5);
  state = shoot(state, "s0", "s1", "live");
  assert.equal(state.players.s1.charges, 4, "the live shell came out a blank");
  assert.deepEqual(remaining(state), { live: 1, blank: 2 }, "but it was a live one that left the gun");
  assert.equal(state.inverted, false);
});

test("cuffs make someone miss a turn, once", () => {
  let state = table({ s0: ["cuffs"] });
  assert.equal(applyGear(state, "s0", "cuffs", name, { target: "s0" }), null, "not yourself");
  state = applyGear(state, "s0", "cuffs", name, { target: "s1" })?.state as BuckshotState;
  state = shoot(state, "s0", "s1", "blank");
  assert.equal(state.turn, "s0", "s1 sat that one out");
  assert.deepEqual(state.cuffed, []);
  state = shoot(state, "s0", "s1", "blank");
  assert.equal(state.turn, "s1");
});

test("cigarettes never go past where you started", () => {
  let state = table({ s0: ["cigarettes", "cigarettes"] });
  state = applyGear(state, "s0", "cigarettes", name)?.state as BuckshotState;
  assert.equal(state.players.s0.charges, 4);
  state = { ...state, players: { ...state.players, s0: { ...state.players.s0, charges: 2 } } };
  state = applyGear(state, "s0", "cigarettes", name)?.state as BuckshotState;
  assert.equal(state.players.s0.charges, 3);
});

test("expired medicine is a coin toss", () => {
  const good = applyGear(table({ s0: ["medicine"] }), "s0", "medicine", name, { random: () => 0 })?.state as BuckshotState;
  assert.equal(good.players.s0.charges, 4, "capped at the start");
  const bad = applyGear(table({ s0: ["medicine"] }), "s0", "medicine", name, { random: () => 1 })?.state as BuckshotState;
  assert.equal(bad.players.s0.charges, 3);
});

test("the glass looks at the chamber; the phone at some later shell", () => {
  assert.equal(applyGear(table({ s0: ["glass"] }), "s0", "glass", name)?.peek, 0);
  const phone = applyGear(table({ s0: ["phone"] }), "s0", "phone", name, { random: () => 2 });
  assert.equal(phone?.peek, 3);
  const last = { ...table({ s0: ["phone"] }), loaded: { live: 1, blank: 0 } };
  assert.equal(applyGear(last, "s0", "phone", name)?.peek, undefined, "nothing after the last shell to learn");
});

test("beer racks a shell out without anyone being shot, and the turn stays", () => {
  const racked = applyGear(table({ s0: ["beer"] }), "s0", "beer", name);
  assert.equal(racked?.rack, true);
  const next = landed(racked?.state as BuckshotState, "live", name);
  assert.equal(next.turn, "s0");
  assert.equal(next.players.s0.charges, 4);
  assert.equal(left(next), 3);
});

test("adrenaline takes an item from someone else and uses it", () => {
  const state = table({ s0: ["adrenaline"], s1: ["saw", "beer"] });
  const used = steal(state, "s0", "s1", "saw", name)?.state as BuckshotState;
  assert.equal(used.saw, true);
  assert.deepEqual(used.players.s0.gear, []);
  assert.deepEqual(used.players.s1.gear, ["beer"]);
  assert.equal(steal(state, "s0", "s1", "adrenaline", name), null);
});

test("the last one standing wins, and an empty gun gets loaded again", () => {
  let state = table({}, 1, 0);
  state = { ...state, players: { ...state.players, s1: { charges: 1, gear: [] } } };
  state = shoot(state, "s0", "s1", "live");
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "s0");
  assert.equal(state.wins.s0, 1);
  assert.deepEqual(alive(state), ["s0"]);

  const empty = shoot(table({}, 1, 1), "s0", "s1", "blank");
  assert.equal(needsLoad(empty), false);
  assert.equal(needsLoad(shoot(empty, "s1", "s0", "live")), true);
});

let db: PGlite;
before(async () => {
  db = await freshDatabase();
});

test("nobody can read the chamber; a peek is logged; a shot is shown to all", async () => {
  const [a, b] = [await newUser(db), await newUser(db)];
  const { itemId } = await tableFor(db, a, "buckshot");
  const run = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query(sql, params));
  const state = async () =>
    (await db.query<{ data: { state: Record<string, unknown> } }>("select data from public.items where id = $1", [itemId])).rows[0].data.state;

  await run(a, "select public.pile_setup(p_item => $1, p_piles => $2::jsonb)", [
    itemId,
    JSON.stringify([{ slot: CHAMBER, cards: ["live", "live", "blank", "blank", "blank"], shuffle: true }]),
  ]);
  for (const user of [a, b]) {
    const { rows } = await run(user, "select slot from public.secrets where item_id = $1", [itemId]);
    assert.equal(rows.length, 0, "the chamber is readable");
  }

  const { rows: peek } = await run(b, "select public.pile_peek(p_item => $1, p_slot => $2, p_index => 0) as card", [itemId, CHAMBER]);
  const seen = (peek[0] as { card: string }).card;
  assert.ok(seen === "live" || seen === "blank");
  const peeked = (await state()).peeked as Array<{ by: string; index: number }>;
  assert.equal(peeked[0].by, b);
  assert.equal(peeked[0].index, 0);
  assert.equal(JSON.stringify(peeked).includes(seen), false, "the log gave the shell away");

  await run(a, "select public.pile_reveal(p_item => $1, p_slots => $2, p_count => 1, p_as => $3)", [itemId, [CHAMBER], shellKey(1, 0)]);
  const shown = ((await state()).revealed as Record<string, string[]>)[shellKey(1, 0)];
  assert.deepEqual(shown, [seen], "the shell fired was the one looked at");
  assert.equal(((await state()).piles as Record<string, { size: number }>)[CHAMBER].size, 4);
});
