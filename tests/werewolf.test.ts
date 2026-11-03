// Werewolf's narrator lives in the database (0011_werewolf.sql): roles and
// night actions in tables no browser reads, and only what the village may
// know written into the item.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";

let db: PGlite;
const users: string[] = [];
const chairs = ["s0", "s1", "s2", "s3", "s4", "s5"];

before(async () => {
  db = await freshDatabase();
  for (let i = 0; i < chairs.length; i += 1) users.push(await newUser(db));
});

const call = (user: string, sql: string, params: unknown[]) => as(db, user, (tx) => tx.query<{ out: unknown }>(sql, params));

async function deal(setup: Record<string, unknown> = { wolves: 1, seer: true, doctor: true }) {
  const { itemId } = await tableFor(db, users[0], "werewolf");
  await call(users[0], "select public.werewolf_deal($1, $2, $3, $4::jsonb)", [itemId, chairs, users, JSON.stringify(setup)]);
  const { rows } = await db.query<{ chair: string; role: string }>("select chair, role from public.ww_roles where item_id = $1", [itemId]);
  const roleOf = Object.fromEntries(rows.map((r) => [r.chair, r.role]));
  const chairOf = (role: string) => rows.filter((r) => r.role === role).map((r) => r.chair);
  const userOf = (chair: string) => users[chairs.indexOf(chair)];
  return { itemId, roleOf, chairOf, userOf };
}

async function ww(itemId: string) {
  const { rows } = await db.query<{ ww: Record<string, unknown> }>("select data #> '{state,ww}' as ww from public.items where id = $1", [itemId]);
  return rows[0].ww as { phase: string; night: number; alive: string[]; dead: Array<{ chair: string; role: string }>; winner: string | null; morning: string[]; roles: Record<string, string> | null };
}

const night = (user: string, itemId: string, chair: string, kind: string, target: string | null = null) =>
  call(user, "select public.werewolf_night($1, $2, $3, $4) as out", [itemId, chair, kind, target]);

test("roles are dealt in secret: nobody can read them, and every card is the same size", async () => {
  const { itemId } = await deal();
  // Refused outright, or row level security with no policy hands back nothing.
  const peek = await call(users[1], "select * from public.ww_roles where item_id = $1", [itemId]).then((r) => r.rows.length).catch(() => 0);
  assert.equal(peek, 0);
  const { rows } = await call(users[1], "select slot, cards from public.secrets where item_id = $1", [itemId]);
  assert.equal(rows.length, 1, "only your own card");
  const sizes = await db.query<{ n: number }>("select distinct jsonb_array_length(cards) as n from public.secrets where item_id = $1", [itemId]);
  assert.equal(sizes.rows.length, 1);
  const state = await ww(itemId);
  assert.equal(state.phase, "night");
  assert.equal(state.alive.length, 6);
});

test("nobody plays somebody else's card", async () => {
  const { itemId } = await deal();
  await assert.rejects(night(users[1], itemId, "s0", "sleep"));
});

test("the wolves' victim dies at dawn, with their role turned over", async () => {
  const { itemId, chairOf, roleOf, userOf } = await deal();
  const wolf = chairOf("wolf")[0];
  const victim = chairs.find((c) => roleOf[c] === "villager")!;
  for (const c of chairs) {
    if (c === wolf) await night(userOf(c), itemId, c, "kill", victim);
    else await night(userOf(c), itemId, c, "sleep");
  }
  const state = await ww(itemId);
  assert.equal(state.phase, "day");
  assert.deepEqual(state.morning, [victim]);
  assert.equal(state.dead[0].role, "villager");
  assert.ok(!state.alive.includes(victim));
});

test("the seer learns a role, and only the seer is told", async () => {
  const { itemId, chairOf, roleOf, userOf } = await deal();
  const seer = chairOf("seer")[0];
  const wolf = chairOf("wolf")[0];
  const { rows } = await night(userOf(seer), itemId, seer, "see", wolf);
  assert.deepEqual(rows[0].out, { role: "wolf" });
  assert.equal(roleOf[wolf], "wolf");
  const other = chairs.find((c) => roleOf[c] === "villager")!;
  await assert.rejects(night(userOf(other), itemId, other, "see", wolf), "a villager cannot look");
});

test("the doctor's save keeps the victim alive", async () => {
  const { itemId, chairOf, userOf } = await deal();
  const wolf = chairOf("wolf")[0];
  const doctor = chairOf("doctor")[0];
  const victim = chairOf("seer")[0];
  for (const c of chairs) {
    if (c === wolf) await night(userOf(c), itemId, c, "kill", victim);
    else if (c === doctor) await night(userOf(c), itemId, c, "save", victim);
    else await night(userOf(c), itemId, c, "sleep");
  }
  const state = await ww(itemId);
  assert.deepEqual(state.morning, []);
  assert.equal(state.alive.length, 6);
});

test("the day's vote puts the most-voted to death, and the last wolf gone ends it", async () => {
  const { itemId, chairOf, userOf } = await deal();
  const wolf = chairOf("wolf")[0];
  for (const c of chairs) await night(userOf(c), itemId, c, c === wolf ? "kill" : "sleep", c === wolf ? chairOf("doctor")[0] : null);
  let state = await ww(itemId);
  for (const c of state.alive) await call(userOf(c), "select public.werewolf_vote($1, $2, $3)", [itemId, c, c === wolf ? "skip" : wolf]);
  state = await ww(itemId);
  assert.equal(state.phase, "over");
  assert.equal(state.winner, "village");
  assert.equal(state.roles?.[wolf], "wolf", "every role is shown at the end");
});

test("a browser saving the item cannot rewrite the narrator's part", async () => {
  const { itemId } = await deal();
  await call(users[0], `update public.items set data = jsonb_set(data, '{state,ww,winner}', '"wolves"') where id = $1`, [itemId]);
  assert.equal((await ww(itemId)).winner, null);
});

test("the hunter, dying, takes someone along", async () => {
  const { itemId, chairOf, userOf } = await deal({ wolves: 1, seer: false, doctor: false, hunter: true });
  const wolf = chairOf("wolf")[0];
  const hunter = chairOf("hunter")[0];
  for (const c of chairs) await night(userOf(c), itemId, c, c === wolf ? "kill" : "sleep", c === wolf ? hunter : null);
  let state = await ww(itemId);
  assert.equal(state.phase, "hunter");
  await call(userOf(hunter), "select public.werewolf_shoot($1, $2, $3)", [itemId, hunter, wolf]);
  state = await ww(itemId);
  assert.equal(state.winner, "village");
});

test("the witch waits for the wolves, sees their victim, and can heal them", async () => {
  const { itemId, chairOf, userOf } = await deal({ wolves: 1, seer: false, doctor: false, witch: true });
  const wolf = chairOf("wolf")[0];
  const witch = chairOf("witch")[0];
  const victim = chairs.find((c) => c !== wolf && c !== witch)!;
  const early = await night(userOf(witch), itemId, witch, "victim");
  assert.deepEqual(early.rows[0].out, { waiting: true, heal: true, poison: true });
  await night(userOf(wolf), itemId, wolf, "kill", victim);
  const told = await night(userOf(witch), itemId, witch, "victim");
  assert.deepEqual(told.rows[0].out, { victim, heal: true, poison: true });
  for (const c of chairs) {
    if (c === wolf) continue;
    await night(userOf(c), itemId, c, c === witch ? "heal" : "sleep");
  }
  const state = await ww(itemId);
  assert.deepEqual(state.morning, []);
  // The potion is gone for good, and the witch is told so.
  for (const c of state.alive) await call(userOf(c), "select public.werewolf_vote($1, $2, 'skip')", [itemId, c]);
  await assert.rejects(night(userOf(witch), itemId, witch, "heal"));
  const bag = await night(userOf(witch), itemId, witch, "victim");
  assert.equal((bag.rows[0].out as { heal: boolean }).heal, false);
});
