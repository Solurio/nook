// The holes the security migration (0010) closes, each checked against the
// real policies and functions in Postgres.

import { before, test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, newUser, tableFor } from "./support/database.ts";

let db: PGlite;
let owner: string;
let player: string;

before(async () => {
  db = await freshDatabase();
  owner = await newUser(db);
  player = await newUser(db);
});

async function count(user: string, sql: string, params: unknown[] = []) {
  const { rows } = await as(db, user, (tx) => tx.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params));
  return rows[0].n;
}

async function fails(user: string, sql: string, params: unknown[] = []) {
  try {
    await as(db, user, (tx) => tx.query(sql, params));
    return false;
  } catch {
    return true;
  }
}

async function rpc(user: string, fn: string, args: Record<string, unknown>) {
  const names = Object.keys(args);
  const params = names.map((n) => (typeof args[n] === "object" && args[n] !== null && !Array.isArray(args[n]) ? JSON.stringify(args[n]) : Array.isArray(args[n]) && n !== "p_slots" ? JSON.stringify(args[n]) : args[n]));
  const { rows } = await as(db, user, (tx) =>
    tx.query<{ out: unknown }>(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as out`, params),
  );
  return rows[0]?.out;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("somebody who never opened a room's link cannot list it, or read what is in it", async () => {
  const { roomId } = await tableFor(db, owner);
  const stranger = await newUser(db);
  await db.query("insert into public.messages (room_id, author_id, body) values ($1, $2, 'hi')", [roomId, owner]);
  assert.equal(await count(stranger, "select * from public.rooms where id = $1", [roomId]), 0);
  assert.equal(await count(stranger, "select * from public.items where room_id = $1", [roomId]), 0);
  assert.equal(await count(stranger, "select * from public.messages where room_id = $1", [roomId]), 0);
  assert.equal(await count(owner, "select * from public.messages where room_id = $1", [roomId]), 1, "the owner still can");
});

test("opening the link by its slug lets you in, and only that room", async () => {
  const { roomId } = await tableFor(db, owner);
  const other = await tableFor(db, owner);
  const visitor = await newUser(db);
  const { rows } = await db.query<{ slug: string }>("select slug from public.rooms where id = $1", [roomId]);
  const joined = await as(db, visitor, (tx) => tx.query<{ id: string }>("select id from public.join_room($1)", [rows[0].slug]));
  assert.equal(joined.rows[0]?.id, roomId);
  assert.equal(await count(visitor, "select * from public.items where room_id = $1", [roomId]), 1);
  assert.equal(await count(visitor, "select * from public.items where room_id = $1", [other.roomId]), 0);
  const nowhere = await as(db, visitor, (tx) => tx.query("select * from public.join_room('no-such-room')"));
  assert.equal(nowhere.rows.length, 0);
});

test("without a session there is nothing to read", async () => {
  await tableFor(db, owner);
  const anon = await db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    try {
      await tx.query("select * from public.rooms");
      return "read";
    } catch {
      return "refused";
    }
  });
  assert.equal(anon, "refused");
});

// ---------------------------------------------------------------------------
// Taking a room over
// ---------------------------------------------------------------------------

test("nobody takes an open room over by writing their own id as its owner", async () => {
  const { roomId } = await tableFor(db, owner);
  assert.ok(await fails(player, "update public.rooms set owner_id = $2 where id = $1", [roomId, player]));
  assert.ok(await fails(player, "update public.rooms set slug = 'mine' where id = $1", [roomId]));
  const { rows } = await db.query<{ owner_id: string }>("select owner_id from public.rooms where id = $1", [roomId]);
  assert.equal(rows[0].owner_id, owner);
});

test("only the owner locks a room, and anyone in it may still rename it while open", async () => {
  const { roomId } = await tableFor(db, owner);
  assert.ok(await fails(player, "update public.rooms set locked = true where id = $1", [roomId]));
  assert.ok(!(await fails(player, "update public.rooms set name = 'ours' where id = $1", [roomId])));
  assert.ok(!(await fails(owner, "update public.rooms set locked = true where id = $1", [roomId])));
  const renamed = await as(db, player, (tx) => tx.query("update public.rooms set name = 'nope' where id = $1 returning id", [roomId]));
  assert.equal(renamed.rows.length, 0, "locked: no change");
});

// ---------------------------------------------------------------------------
// Secret piles
// ---------------------------------------------------------------------------

test("a random draw out of somebody else's hand is refused", async () => {
  const { itemId } = await tableFor(db, owner);
  await rpc(owner, "pile_setup", { p_item: itemId, p_piles: [{ slot: "hand:a", owner: owner, cards: ["A", "B", "C"] }] });
  await assert.rejects(rpc(player, "pile_move", { p_item: itemId, p_from: "hand:a", p_to: "loot", p_count: 3, p_random: true, p_to_owner: player }));
  const { rows } = await db.query<{ cards: string[] }>("select cards from public.secrets where item_id = $1 and slot = 'hand:a'", [itemId]);
  assert.equal(rows[0].cards.length, 3);
});

test("the owner of a hand may still draw at random out of it", async () => {
  const { itemId } = await tableFor(db, owner);
  await rpc(owner, "pile_setup", { p_item: itemId, p_piles: [{ slot: "hand:a", owner: owner, cards: ["A", "B", "C"] }] });
  await rpc(owner, "pile_move", { p_item: itemId, p_from: "hand:a", p_to: "discard", p_count: 2, p_random: true });
  const { rows } = await db.query<{ cards: string[] }>("select cards from public.secrets where item_id = $1 and slot = 'hand:a'", [itemId]);
  assert.equal(rows[0].cards.length, 1);
});

test("teams are made from role piles into team piles only, and never over someone's pile", async () => {
  const { itemId } = await tableFor(db, owner);
  await rpc(owner, "pile_setup", {
    p_item: itemId,
    p_piles: [
      { slot: "role:a", owner: owner, cards: ["spy"] },
      { slot: "role:b", owner: player, cards: ["spy"] },
      { slot: "hand:b", owner: player, cards: ["X"] },
    ],
  });
  await assert.rejects(rpc(owner, "pile_team", { p_item: itemId, p_prefix: "role:", p_card: JSON.stringify("spy"), p_to_prefix: "hand:" }));
  await assert.rejects(rpc(owner, "pile_team", { p_item: itemId, p_prefix: "hand:", p_card: JSON.stringify("X"), p_to_prefix: "team:" }));
  await rpc(owner, "pile_team", { p_item: itemId, p_prefix: "role:", p_card: JSON.stringify("spy"), p_to_prefix: "team:" });
  const { rows } = await db.query<{ cards: string[] }>("select cards from public.secrets where item_id = $1 and slot = 'hand:b'", [itemId]);
  assert.deepEqual(rows[0].cards, ["X"], "the hand is untouched");
});

test("showing a card only writes a shown: pile, never someone else's", async () => {
  const { itemId } = await tableFor(db, owner);
  await rpc(owner, "pile_setup", {
    p_item: itemId,
    p_piles: [
      { slot: "hand:a", owner: owner, cards: ["duke"] },
      { slot: "hand:b", owner: player, cards: ["X"] },
    ],
  });
  await assert.rejects(rpc(owner, "pile_show", { p_item: itemId, p_from: "hand:a", p_cards: ["duke"], p_viewer: owner, p_to: "hand:b" }));
  await rpc(owner, "pile_show", { p_item: itemId, p_from: "hand:a", p_cards: ["duke"], p_viewer: player, p_to: "shown:b" });
  const { rows } = await as(db, player, (tx) => tx.query<{ cards: string[] }>("select cards from public.secrets where item_id = $1 and slot = 'shown:b'", [itemId]));
  assert.deepEqual(rows[0].cards, ["duke"]);
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

test("uploads land only in the folder of a room you may write to", async () => {
  const { roomId } = await tableFor(db, owner);
  const stranger = await newUser(db);
  const put = (user: string, name: string) => fails(user, "insert into storage.objects (bucket_id, name, owner) values ('decorations', $1, $2)", [name, user]);
  assert.ok(!(await put(owner, `${roomId}/a.png`)));
  assert.ok(await put(owner, "brushes/a.png"), "not a room folder");
  assert.ok(await put(stranger, `${roomId}/b.png`), "not in the room");
  const { rows } = await db.query<{ types: string[] }>("select allowed_mime_types as types from storage.buckets where id = 'decorations'");
  assert.ok(!rows[0].types.includes("image/svg+xml"));
});
